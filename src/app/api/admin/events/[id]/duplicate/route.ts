import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params

  const source = await prisma.event.findUnique({
    where: { id },
    include: { shifts: true },
  })

  if (!source) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  let slug = slugify(`${source.title}-copie`)
  const existing = await prisma.event.findUnique({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  const newEvent = await prisma.event.create({
    data: {
      slug,
      title: `${source.title} (copie)`,
      description: source.description,
      location: source.location,
      publicStatus: "draft",
      startDate: source.startDate,
      endDate: source.endDate,
      publicInstructions: source.publicInstructions,
      confirmationMessage: source.confirmationMessage,
      shifts: {
        create: source.shifts.map((s) => ({
          roleName: s.roleName,
          label: s.label,
          description: s.description,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: s.capacity,
          status: "open",
          locationDetails: s.locationDetails,
          displayOrder: s.displayOrder,
          internalNotes: s.internalNotes,
        })),
      },
    },
  })

  return NextResponse.json(newEvent, { status: 201 })
}
