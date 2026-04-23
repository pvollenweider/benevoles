import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const events = await prisma.event.findMany({
    where: { publicStatus: "published" },
    include: {
      shifts: {
        where: { status: { in: ["open", "full"] } },
        include: { registrations: { where: { status: "active" } } },
      },
    },
    orderBy: { startDate: "asc" },
  })

  const result = events.map((event) => {
    const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
    const totalRegistered = event.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      totalCapacity,
      totalRegistered,
      spotsLeft: totalCapacity - totalRegistered,
    }
  })

  return NextResponse.json(result)
}
