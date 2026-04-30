import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/utils"
import { z } from "zod"

const schema = z.object({
  eventId: z.string(),
  shiftId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  comment: z.string().optional(),
})

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { eventId, shiftId, firstName, lastName, email, phone, comment } = parsed.data

  const shift = await db.shift.findFirst({
    where: { id: shiftId, eventId },
    include: { registrations: { where: { status: "active" } } },
  })

  if (!shift) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })

  const usedEmail = email || `admin-${Date.now()}@internal`
  let volunteer = email
    ? await prisma.volunteer.findFirst({ where: { email } })
    : null

  if (!volunteer) {
    volunteer = await prisma.volunteer.create({ data: { firstName, lastName, email: usedEmail, phone } })
  }

  const registration = await prisma.registration.create({
    data: {
      eventId,
      shiftId,
      volunteerId: volunteer.id,
      source: "admin_manual",
      comment,
      editToken: generateToken(),
    },
    include: { volunteer: true, shift: true },
  })

  if (shift.registrations.length + 1 >= shift.capacity) {
    await prisma.shift.update({ where: { id: shiftId }, data: { status: "full" } })
  }

  return NextResponse.json(registration, { status: 201 })
}
