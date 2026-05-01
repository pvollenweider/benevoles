import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgBaseUrl } from "@/lib/urls"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const registration = await prisma.registration.findFirst({
    where: { editToken: token, status: "active" },
    include: {
      volunteer: true,
      event: { select: { id: true, title: true, slug: true, organization: { select: { slug: true } } } },
    },
  })

  if (!registration) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }

  // Toutes les inscriptions actives du même bénévole pour le même événement
  const allRegistrations = await prisma.registration.findMany({
    where: {
      volunteerId: registration.volunteerId,
      eventId: registration.eventId,
      status: "active",
    },
    include: { shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  const orgSlug = registration.event.organization.slug
  return NextResponse.json({
    event: registration.event,
    orgHomeUrl: orgBaseUrl(orgSlug),
    volunteer: {
      firstName: registration.volunteer.firstName,
      lastName: registration.volunteer.lastName,
      email: registration.volunteer.email,
      phone: registration.volunteer.phone ?? "",
    },
    registrations: allRegistrations.map((r) => ({
      id: r.id,
      editToken: r.editToken,
      shift: {
        id: r.shift.id,
        label: r.shift.label,
        roleName: r.shift.roleName,
        date: r.shift.date,
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
      },
    })),
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
