import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendMemberInvite } from "@/lib/email"
import { z } from "zod"

const schema = z.object({
  message: z.string().max(500).optional(),
})

/**
 * Re-sends the invitation email to every invited member who has not yet
 * registered to the event. Reuses the existing token (no duplicate row).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.findFirst({
    where: { id: eventId },
    include: { organization: { select: { name: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  const invites = await db.memberInvite.findMany({
    where: { eventId },
    include: { member: true },
  })

  const memberEmails = invites
    .map((i) => i.member.email)
    .filter((e): e is string => !!e)

  const registeredEmails = new Set(
    memberEmails.length
      ? (
          await prisma.registration.findMany({
            where: {
              eventId,
              status: "active",
              volunteer: { email: { in: memberEmails } },
            },
            select: { volunteer: { select: { email: true } } },
          })
        ).map((r) => r.volunteer.email)
      : [],
  )

  let sent = 0
  let failed = 0
  for (const invite of invites) {
    const m = invite.member
    if (!m.email || !m.active) continue
    if (registeredEmails.has(m.email)) continue
    try {
      await sendMemberInvite({
        to: m.email,
        memberName: m.firstName,
        organizationName: event.organization.name,
        eventTitle: event.title,
        eventDate: event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        eventLocation: event.location,
        eventSlug: event.slug,
        message: parsed.data.message ?? null,
        token: invite.token,
      })
      sent++
    } catch (err) {
      console.error("Reminder email error:", err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed })
}
