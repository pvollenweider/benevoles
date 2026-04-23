import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  roleName: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional().nullable(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(["open", "full", "closed", "cancelled"]).optional(),
  locationDetails: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  internalNotes: z.string().optional().nullable(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const updateData: Record<string, unknown> = { ...data }
  if (data.date) updateData.date = new Date(data.date)

  const shift = await prisma.shift.update({ where: { id }, data: updateData })
  return NextResponse.json(shift)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params

  await prisma.shift.update({ where: { id }, data: { status: "cancelled" } })
  return NextResponse.json({ success: true })
}
