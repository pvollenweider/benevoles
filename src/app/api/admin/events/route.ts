import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  publicInstructions: z.string().optional(),
  confirmationMessage: z.string().optional(),
  publicStatus: z.enum(["draft", "published", "archived"]).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const events = await prisma.event.findMany({
    include: {
      shifts: {
        include: { registrations: { where: { status: "active" } } },
      },
    },
    orderBy: { startDate: "desc" },
  })

  const result = events.map((e) => {
    const totalCapacity = e.shifts.reduce((s, sh) => s + sh.capacity, 0)
    const totalRegistered = e.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      publicStatus: e.publicStatus,
      totalShifts: e.shifts.length,
      totalCapacity,
      totalRegistered,
      spotsLeft: totalCapacity - totalRegistered,
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  let slug = slugify(data.title)

  const existing = await prisma.event.findUnique({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  const event = await prisma.event.create({
    data: {
      ...data,
      slug,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      publicStatus: data.publicStatus ?? "draft",
    },
  })

  return NextResponse.json(event, { status: 201 })
}
