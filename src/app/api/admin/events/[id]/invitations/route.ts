import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendMemberInvite } from "@/lib/email"
import { z } from "zod"

const postSchema = z.object({
  memberIds: z.array(z.string()).min(1).max(500),
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
      member: {
        select: { id: true, firstName: true, lastName: true, email: true, tags: true, active: true },
      },
    },
    orderBy: { sentAt: "desc" },
  })

  // Pull the active registrations for the same members on this event so
  // the UI can show "registered" vs "no answer".
  const memberIds = invites.map((i) => i.memberId)
  const memberEmails = invites
    .map((i) => i.member.email)
    .filter((e): e is string => !!e)

  const registrationsByEmail = memberEmails.length
    ? await prisma.registration.findMany({
        where: {
          eventId,
          status: "active",
          volunteer: { email: { in: memberEmails } },
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
    if (!regsByEmail.has(key)) regsByEmail.set(key, [])
    regsByEmail.get(key)!.push(r)
  }

  const total = invites.length
  const registered = invites.filter((i) => i.member.email && (regsByEmail.get(i.member.email)?.length ?? 0) > 0).length
  const noAnswer = total - registered

  return NextResponse.json({
    summary: { total, registered, noAnswer },
    invites: invites.map((i) => ({
      id: i.id,
      sentAt: i.sentAt,
      usedAt: i.usedAt,
      member: i.member,
      registrations:
        i.member.email
          ? (regsByEmail.get(i.member.email) ?? []).map((r) => ({
              shiftId: r.shift.id,
              label: r.shift.label,
              roleName: r.shift.roleName,
              startTime: r.shift.startTime,
              endTime: r.shift.endTime,
            }))
          : [],
    })),
    memberIds,
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
    include: { organization: { select: { name: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  // Only consider members that belong to this org.
  const members = await db.member.findMany({
    where: { id: { in: parsed.data.memberIds }, active: true },
  })

  if (members.length === 0) {
    return NextResponse.json({ error: "Aucun membre valide à inviter" }, { status: 400 })
  }

  // Existing invites for this event so we don't recreate them.
  const existing = await prisma.memberInvite.findMany({
    where: { eventId, memberId: { in: members.map((m) => m.id) } },
    select: { memberId: true, id: true, token: true },
  })
  const existingByMember = new Map(existing.map((e) => [e.memberId, e]))

  const created: { id: string; memberId: string; token: string }[] = []
  for (const member of members) {
    if (existingByMember.has(member.id)) continue
    const invite = await prisma.memberInvite.create({
      data: { eventId, memberId: member.id },
      select: { id: true, memberId: true, token: true },
    })
    created.push(invite)
  }

  // Send emails in parallel so a slow SMTP doesn't make the route
  // hang for `members.length × timeout`. Promise.allSettled keeps a
  // partial failure from cancelling the others.
  const sends = members
    .filter((m) => m.email)
    .map(async (member) => {
      const invite = existingByMember.get(member.id) ?? created.find((c) => c.memberId === member.id)
      if (!invite) return { ok: false }
      try {
        await sendMemberInvite({
          to: member.email!,
          memberName: member.firstName,
          organizationName: event.organization.name,
          eventTitle: event.title,
          eventDate: event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
          eventLocation: event.location,
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
    skippedExisting: members.length - created.length,
    emailsSent: sent,
    emailsFailed: failed,
    membersWithoutEmail: members.filter((m) => !m.email).length,
  }, { status: 201 })
}
