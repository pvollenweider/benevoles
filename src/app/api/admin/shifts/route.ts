import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { clockSchema, firstIssueMessage, SAME_TIME_ERROR } from "@/lib/shift-time"

const schema = z.object({
  eventId: z.string(),
  roleName: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  date: z.string(),
  startTime: clockSchema,
  endTime: clockSchema,
  capacity: z.number().int().min(1),
  locationDetails: z.string().optional(),
  displayOrder: z.number().int().optional(),
  internalNotes: z.string().optional(),
  waitlistEnabled: z.boolean().optional(),
}).refine((d) => d.startTime !== d.endTime, { message: SAME_TIME_ERROR, path: ["endTime"] })

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error), details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  const owned = await db.event.findFirst({ where: { id: data.eventId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })

  const shift = await prisma.shift.create({
    data: { ...data, date: new Date(data.date), status: "open" },
  })

  return NextResponse.json(shift, { status: 201 })
}
