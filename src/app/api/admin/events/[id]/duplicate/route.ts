import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id } = await params

  const source = await db.event.findFirst({
    where: { id },
    include: { shifts: true },
  })

  if (!source) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  let slug = slugify(`${source.title}-copie`)
  const existing = await db.event.findFirst({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  const newEvent = await db.event.create({
    data: {
      slug,
      organizationId,
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
