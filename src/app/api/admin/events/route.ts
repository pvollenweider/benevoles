// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { civilDateSchema, DATE_ORDER_ERROR, isOrderedPeriod } from "@/lib/civil-date"
import { COORDINATE_PAIR_ERROR, isCoordinatePair } from "@/lib/map-link"
import { ACCENT_KEYS } from "@/lib/event-accent"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { dayContactSchema } from "@/lib/day-contact"

const showSchema = z.object({
  name: z.string(),
  date: civilDateSchema,
  startTime: z.string(),
  endTime: z.string(),
})

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: civilDateSchema,
  endDate: civilDateSchema,
  publicInstructions: z.string().optional(),
  confirmationMessage: z.string().optional(),
  showSchedule: z.array(showSchema).optional(),
  requirePhone: z.boolean().optional(),
  /** Accent colour of the public page (#300): a palette key, or null for the neutral header. */
  accentColorKey: z.enum(ACCENT_KEYS).optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  /** Day-of contact (#560), for registered volunteers only. */
  ...dayContactSchema,
}).refine(isCoordinatePair, { message: COORDINATE_PAIR_ERROR, path: ["longitude"] }).refine((d) => isOrderedPeriod(d.startDate, d.endDate), { message: DATE_ORDER_ERROR, path: ["endDate"] })

export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const events = await db.event.findMany({
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
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  // Always a draft: a new event has no shift yet, and publication is a deliberate later step
  // (PATCH enforces the rule). Any publicStatus in the body is ignored, listed by default.
  const data = parsed.data
  let slug = slugify(data.title)

  const existing = await db.event.findFirst({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  const event = await db.event.create({
    data: {
      ...data,
      slug,
      organizationId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      publicStatus: "draft",
      isListed: true,
      showSchedule: data.showSchedule ?? [],
    },
  })

  return NextResponse.json(event, { status: 201 })
}
