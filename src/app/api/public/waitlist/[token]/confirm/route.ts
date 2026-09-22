import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(getClientIp(_req), "waitlist-confirm", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 })

  const { token } = await params

  const reg = await prisma.registration.findFirst({
    where: { editToken: token, status: "offered" },
    include: {
      volunteer: true,
      shift: true,
      event: { include: { organization: { select: { slug: true } } } },
    },
  })

  if (!reg) {
    return NextResponse.json({ error: "Lien invalide, déjà confirmé ou expiré." }, { status: 404 })
  }

  if (reg.waitingExpiresAt && reg.waitingExpiresAt < new Date()) {
    return NextResponse.json({ error: "Ce lien a expiré. La place a été proposée à quelqu'un d'autre." }, { status: 410 })
  }

  await prisma.registration.update({
    where: { id: reg.id },
    data: {
      status: "active",
      waitingPosition: null,
      waitingOfferedAt: null,
      waitingExpiresAt: null,
    },
  })

  // Link back to the offer that made this possible, itself already linked to whatever
  // cancellation freed the spot — closes the causal chain for narrative mode.
  const offerLog = await prisma.eventLog.findFirst({
    where: { entityType: "Registration", entityId: reg.id, action: "registration.waitlist_offered" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })

  await logEvent({
    eventId: reg.eventId,
    actor: { type: "volunteer", id: reg.volunteerId },
    action: "registration.waitlist_confirmed",
    entityType: "Registration",
    entityId: reg.id,
    changes: { status: { from: "offered", to: "active" } },
    causedByLogId: offerLog?.id,
  })

  // Send confirmation email
  const orgSlug = reg.event.organization.slug
  await sendNotification({
    kind: "registration_confirmation",
    recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
    data: {
      volunteerName: reg.volunteer.firstName,
      eventTitle: reg.event.title,
      shifts: [{
        label: reg.shift.label,
        date: reg.shift.date.toLocaleDateString("fr-FR"),
        startTime: reg.shift.startTime,
        endTime: reg.shift.endTime,
      }],
      editToken: reg.editToken,
      orgSlug,
    },
  }).catch(() => {})

  return NextResponse.json({ success: true, editToken: reg.editToken })
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return POST(req, ctx)
}
