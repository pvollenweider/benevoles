import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

/**
 * POST /api/admin/events/[id]/send-reminder
 *
 * Sends one email per volunteer who has at least one active registration
 * on the event. Each email contains the admin's custom reminder message
 * (Event.reminderMessage) followed by the volunteer's own shifts.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: { organization: { select: { name: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Defense in depth: re-scope the registration lookup explicitly via
  // event.organizationId so a route bug can't leak another org's data.
  const regs = await prisma.registration.findMany({
    where: {
      eventId: id,
      status: "active",
      event: { organizationId: event.organizationId },
    },
    include: { volunteer: true, shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  if (regs.length === 0) {
    return NextResponse.json({ error: "Aucun bénévole inscrit" }, { status: 400 })
  }

  // Group registrations by volunteer (one email per person, even if
  // they have several shifts). Use the volunteer.id as key so we don't
  // depend on a single editToken per volunteer.
  type Bundle = {
    volunteer: typeof regs[number]["volunteer"]
    editToken: string
    shifts: typeof regs[number]["shift"][]
  }
  const byVolunteer = new Map<string, Bundle>()
  for (const r of regs) {
    let bundle = byVolunteer.get(r.volunteerId)
    if (!bundle) {
      bundle = { volunteer: r.volunteer, editToken: r.editToken, shifts: [] }
      byVolunteer.set(r.volunteerId, bundle)
    }
    bundle.shifts.push(r.shift)
  }

  let sent = 0
  let failed = 0
  for (const bundle of byVolunteer.values()) {
    if (!bundle.volunteer.email) continue
    const result = await sendNotification({
      kind: "manual_reminder",
      recipient: { email: bundle.volunteer.email, name: bundle.volunteer.firstName },
      data: {
        volunteerName: bundle.volunteer.firstName,
        organizationName: event.organization.name,
        eventTitle: event.title,
        customMessage: event.reminderMessage ?? "",
        shifts: bundle.shifts.map((s) => ({
          label: s.label,
          date: s.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
          startTime: s.startTime,
          endTime: s.endTime,
          roleName: s.roleName,
        })),
        editToken: bundle.editToken,
      },
    })
    if (result.ok) sent++
    else failed++
  }

  await prisma.event.update({
    where: { id },
    data: { reminderSentAt: new Date() },
  })

  return NextResponse.json({ sent, failed, totalVolunteers: byVolunteer.size })
}
