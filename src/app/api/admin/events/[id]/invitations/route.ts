import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendMemberInvite } from "@/lib/email"
import { z } from "zod"
import { randomBytes } from "crypto"

const postSchema = z.object({
  volunteerIds: z.array(z.string()).min(1).max(500),
  message: z.string().max(500).optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const invites = await db.memberInvite.findMany({
    where: { eventId },
    include: {
      volunteer: {
        select: { id: true, firstName: true, lastName: true, email: true, tags: true, active: true },
      },
    },
    orderBy: { sentAt: "desc" },
  })

  // Pull the active registrations for the same volunteers on this event so
  // the UI can show "registered" vs "no answer".
  const volunteerIds = invites.map((i) => i.volunteerId)
  const volunteerEmails = invites
    .map((i) => i.volunteer.email)
    .filter((e): e is string => !!e)

  const registrationsByEmail = volunteerEmails.length
    ? await prisma.registration.findMany({
        where: {
          eventId,
          status: "active",
          volunteer: { email: { in: volunteerEmails } },
        },
        include: {
          volunteer: { select: { email: true } },
          shift: { select: { id: true, label: true, roleName: true, startTime: true, endTime: true } },
        },
      })
    : []

  const regsByEmail = new Map<string, typeof registrationsByEmail>()
  for (const r of registrationsByEmail) {
    const key = r.volunteer.email
    if (!key) continue
    if (!regsByEmail.has(key)) regsByEmail.set(key, [])
    regsByEmail.get(key)!.push(r)
  }

  const total = invites.length
  const registered = invites.filter((i) => i.volunteer.email && (regsByEmail.get(i.volunteer.email)?.length ?? 0) > 0).length
  const noAnswer = total - registered

  return NextResponse.json({
    summary: { total, registered, noAnswer },
    invites: invites.map((i) => ({
      id: i.id,
      sentAt: i.sentAt,
      usedAt: i.usedAt,
      volunteer: i.volunteer,
      registrations:
        i.volunteer.email
          ? (regsByEmail.get(i.volunteer.email) ?? []).map((r) => ({
              shiftId: r.shift.id,
              label: r.shift.label,
              roleName: r.shift.roleName,
              startTime: r.shift.startTime,
              endTime: r.shift.endTime,
            }))
          : [],
    })),
    volunteerIds,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.findFirst({
    where: { id: eventId },
    include: { organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  // Only consider volunteers that belong to this org.
  const volunteers = await db.volunteer.findMany({
    where: { id: { in: parsed.data.volunteerIds }, active: true },
  })

  if (volunteers.length === 0) {
    return NextResponse.json({ error: "Aucun membre valide à inviter" }, { status: 400 })
  }

  // Existing invites for this event so we don't recreate them.
  const existing = await prisma.memberInvite.findMany({
    where: { eventId, volunteerId: { in: volunteers.map((v) => v.id) } },
    select: { volunteerId: true, id: true, token: true },
  })
  const existingByVolunteer = new Map(existing.map((e) => [e.volunteerId, e]))

  const created: { id: string; volunteerId: string; token: string }[] = []
  for (const volunteer of volunteers) {
    if (existingByVolunteer.has(volunteer.id)) continue
    const invite = await prisma.memberInvite.create({
      data: { eventId, volunteerId: volunteer.id, token: randomBytes(24).toString("hex") },
      select: { id: true, volunteerId: true, token: true },
    })
    created.push(invite)
  }

  // Send emails in parallel so a slow SMTP doesn't make the route
  // hang for `volunteers.length × timeout`. Promise.allSettled keeps a
  // partial failure from cancelling the others.
  const sends = volunteers
    .filter((v) => v.email)
    .map(async (volunteer) => {
      const invite = existingByVolunteer.get(volunteer.id) ?? created.find((c) => c.volunteerId === volunteer.id)
      if (!invite) return { ok: false }
      try {
        await sendMemberInvite({
          to: volunteer.email!,
          memberName: volunteer.firstName,
          organizationName: event.organization.name,
          eventTitle: event.title,
          eventDate: event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
          eventLocation: event.location,
          orgSlug: event.organization.slug,
          eventSlug: event.slug,
          message: parsed.data.message ?? null,
          token: invite.token,
        })
        return { ok: true }
      } catch (err) {
        console.error("Member invite email error:", err)
        return { ok: false }
      }
    })

  const results = await Promise.allSettled(sends)
  const sent = results.filter((r) => r.status === "fulfilled" && r.value.ok).length
  const failed = results.length - sent

  return NextResponse.json({
    invitedNew: created.length,
    skippedExisting: volunteers.length - created.length,
    emailsSent: sent,
    emailsFailed: failed,
    membersWithoutEmail: volunteers.filter((v) => !v.email).length,
  }, { status: 201 })
}
