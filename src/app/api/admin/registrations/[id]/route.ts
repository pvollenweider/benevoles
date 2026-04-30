import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  status: z.enum(["active", "cancelled", "deleted"]).optional(),
  comment: z.string().optional().nullable(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const owned = await db.registration.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const registration = await prisma.registration.update({
    where: { id },
    data: parsed.data,
    include: { shift: true },
  })

  const activeCount = await prisma.registration.count({
    where: { shiftId: registration.shiftId, status: "active" },
  })

  let shiftStatus = "open"
  if (registration.shift.status === "closed" || registration.shift.status === "cancelled") {
    shiftStatus = registration.shift.status
  } else if (activeCount >= registration.shift.capacity) {
    shiftStatus = "full"
  }

  await prisma.shift.update({ where: { id: registration.shiftId }, data: { status: shiftStatus } })

  return NextResponse.json(registration)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const owned = await db.registration.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const registration = await prisma.registration.update({
    where: { id },
    data: { status: "cancelled" },
    include: { shift: true },
  })

  const activeCount = await prisma.registration.count({
    where: { shiftId: registration.shiftId, status: "active" },
  })

  if (activeCount < registration.shift.capacity && registration.shift.status === "full") {
    await prisma.shift.update({ where: { id: registration.shiftId }, data: { status: "open" } })
  }

  return NextResponse.json({ success: true })
}
