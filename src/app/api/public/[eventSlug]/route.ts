import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params
  const orgSlug =
    (await headers()).get("x-org-slug") ??
    new URL(_req.url).searchParams.get("org")

  if (!orgSlug) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 })

  const event = await prisma.event.findFirst({
    where: {
      slug: eventSlug,
      publicStatus: "published",
      organization: { slug: orgSlug },
    },
    include: {
      organization: { select: { name: true, volunteerCharter: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        include: { registrations: { where: { status: "active" } } },
        orderBy: [{ date: "asc" }, { displayOrder: "asc" }, { startTime: "asc" }],
      },
    },
  })

  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  const shifts = event.shifts.map((shift) => ({
    id: shift.id,
    roleName: shift.roleName,
    label: shift.label,
    description: shift.description,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    capacity: shift.capacity,
    registered: shift.registrations.length,
    spotsLeft: Math.max(0, shift.capacity - shift.registrations.length),
    status: shift.registrations.length >= shift.capacity ? "full" : shift.status,
    locationDetails: shift.locationDetails,
    displayOrder: shift.displayOrder,
    waitlistEnabled: shift.waitlistEnabled,
  }))

  return NextResponse.json({
    id: event.id,
    slug: event.slug,
    title: event.title,
    organizationName: event.organization.name,
    description: event.description,
    location: event.location,
    startDate: event.startDate,
    endDate: event.endDate,
    publicInstructions: event.publicInstructions,
    confirmationMessage: event.confirmationMessage,
    showSchedule: event.showSchedule,
    volunteerCharter: event.organization.volunteerCharter,
    shifts,
  })
}
