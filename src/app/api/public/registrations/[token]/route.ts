import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const registration = await prisma.registration.findFirst({
    where: { editToken: token, status: "active" },
    include: {
      volunteer: true,
      shift: true,
      event: { select: { title: true, slug: true } },
    },
  })

  if (!registration) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }

  return NextResponse.json({
    id: registration.id,
    event: registration.event,
    shift: {
      label: registration.shift.label,
      date: registration.shift.date,
      startTime: registration.shift.startTime,
      endTime: registration.shift.endTime,
    },
    volunteer: {
      firstName: registration.volunteer.firstName,
      lastName: registration.volunteer.lastName,
      email: registration.volunteer.email,
    },
    createdAt: registration.createdAt,
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const registration = await prisma.registration.findFirst({
    where: { editToken: token, status: "active" },
  })

  if (!registration) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }

  await prisma.registration.update({
    where: { id: registration.id },
    data: { status: "cancelled" },
  })

  return NextResponse.json({ success: true })
}
