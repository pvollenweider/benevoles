import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
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
