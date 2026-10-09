// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { canPublish, PUBLICATION_PENDING_ERROR } from "@/lib/org-approval"
import { NextResponse } from "next/server"
import { localDateTimeToUtc, orgTimeZone } from "@/lib/time-zone"
import { isValidWindow, localInputToUtc, WINDOW_ORDER_ERROR } from "@/lib/registration-window"
import { civilDateSchema, DATE_ORDER_ERROR, isOrderedPeriod } from "@/lib/civil-date"
import { COORDINATE_PAIR_ERROR, isCoordinatePair } from "@/lib/map-link"
import { ACCENT_KEYS } from "@/lib/event-accent"
import { requireOrgSession } from "@/lib/auth-guard"
import { titlesMatch } from "@/lib/confirm-title"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { EVENT_PUBLIC_STATUSES } from "@/lib/statuses"
import { isPublishing, publishBlocker } from "@/lib/event-publish"
import { dayContactSchema } from "@/lib/day-contact"

const showSchema = z.object({
  name: z.string(),
  date: civilDateSchema,
  startTime: z.string(),
  endTime: z.string(),
})

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  startDate: civilDateSchema.optional(),
  endDate: civilDateSchema.optional(),
  publicInstructions: z.string().optional().nullable(),
  confirmationMessage: z.string().optional().nullable(),
  publicStatus: z.enum(EVENT_PUBLIC_STATUSES).optional(),
  /** Unlisted events (#414): a strict boolean, logged as « visibilité ». */
  isListed: z.boolean().optional(),
  /** Registration window (#463): a switch, and an optional schedule as local « YYYY-MM-DDTHH:MM » in the organisation's zone. */
  registrationsOpen: z.boolean().optional(),
  registrationOpensAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional().or(z.literal("")),
  registrationClosesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional().or(z.literal("")),
  showSchedule: z.array(showSchema).optional(),
  reminderMessage: z.string().max(2000).optional().nullable(),
  remindersEnabled: z.boolean().optional(),
  requirePhone: z.boolean().optional(),
  /** Accent colour of the public page (#300): a palette key, or null for the neutral header. */
  accentColorKey: z.enum(ACCENT_KEYS).optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  /** Day-of contact (#560), for registered volunteers only. Not in the event log: a phone number. */
  ...dayContactSchema,
}).refine(isCoordinatePair, { message: COORDINATE_PAIR_ERROR, path: ["longitude"] })

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      shifts: {
        include: { registrations: { where: { status: "active" }, include: { volunteer: true } } },
        orderBy: [{ date: "asc" }, { displayOrder: "asc" }, { startTime: "asc" }],
      },
    },
  })

  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  return NextResponse.json(event)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const owned = await db.event.findFirst({
    where: { id },
    select: { id: true, title: true, publicStatus: true, isListed: true, startDate: true, endDate: true, publicInstructions: true, remindersEnabled: true, requirePhone: true, registrationsOpen: true, registrationOpensAt: true, registrationClosesAt: true, organization: { select: { timeZone: true, publicationApprovedAt: true } } },
  })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const data = parsed.data
  // Whatever the interface (edit form, publish toggle, review page, direct call): no
  // publication without a live shift.
  if (isPublishing(owned.publicStatus, data.publicStatus)) {
    // An organisation awaiting validation (#810) prepares everything but publishes nothing.
    if (!canPublish(owned.organization)) return NextResponse.json({ error: PUBLICATION_PENDING_ERROR, code: "publication_pending" }, { status: 409 })
    const blocker = await publishBlocker(db, id)
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 })
  }
  // The period stays in order whichever end is changed: compare with the stored other end.
  const nextStart = data.startDate ?? owned.startDate.toISOString().slice(0, 10)
  const nextEnd = data.endDate ?? owned.endDate.toISOString().slice(0, 10)
  if ((data.startDate || data.endDate) && !isOrderedPeriod(nextStart, nextEnd)) {
    return NextResponse.json({ error: DATE_ORDER_ERROR }, { status: 400 })
  }
  const updateData: Record<string, unknown> = { ...data }
  // The schedule arrives as local times: convert in the organisation's zone, keep the order.
  const zone = orgTimeZone(owned.organization)
  const toInstant = (v: string | null | undefined) => (v ? localInputToUtc(v, zone, localDateTimeToUtc) : null)
  if (data.registrationOpensAt !== undefined) updateData.registrationOpensAt = toInstant(data.registrationOpensAt)
  if (data.registrationClosesAt !== undefined) updateData.registrationClosesAt = toInstant(data.registrationClosesAt)
  const nextOpens = data.registrationOpensAt !== undefined ? (updateData.registrationOpensAt as Date | null) : owned.registrationOpensAt
  const nextCloses = data.registrationClosesAt !== undefined ? (updateData.registrationClosesAt as Date | null) : owned.registrationClosesAt
  if (!isValidWindow(nextOpens, nextCloses)) return NextResponse.json({ error: WINDOW_ORDER_ERROR }, { status: 400 })
  if (data.startDate) updateData.startDate = new Date(data.startDate)
  if (data.endDate) updateData.endDate = new Date(data.endDate)

  try {
    const event = await db.event.update({ where: { id }, data: updateData })

    const { organization: _ownedOrg, ...ownedFields } = owned
    void _ownedOrg
    const eventChanges = diffFields(ownedFields, event, [
      "title",
      "publicStatus",
      "startDate",
      "endDate",
      "publicInstructions",
      "remindersEnabled",
      "requirePhone",
      "isListed",
      "registrationsOpen",
      "registrationOpensAt",
      "registrationClosesAt",
    ])
    if (eventChanges) {
      const statusChangedTo = eventChanges.publicStatus?.to
      await logEvent({
        eventId: id,
        actor: adminActor(guard.session),
        action: statusChangedTo === "published" ? "event.published" : statusChangedTo === "archived" ? "event.archived" : "event.updated",
        entityType: "Event",
        entityId: id,
        changes: eventChanges,
      })
    }

    return NextResponse.json(event)
  } catch (err) {
    // Details stay in the server log: they can name tables or constraints.
    console.error("Event PATCH error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}

const deleteSchema = z.object({ confirmTitle: z.string() })

/**
 * Permanently deletes an event. Only an archived event can be deleted, and the
 * caller must send the exact event title as confirmation. Shifts, registrations
 * and invitations are removed by cascade; volunteers stay in the org roster.
 * Archiving goes through PATCH { publicStatus: "archived" }.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const owned = await db.event.findFirst({ where: { id }, select: { id: true, title: true, publicStatus: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  if (owned.publicStatus !== "archived") {
    return NextResponse.json({ error: "Archivez l'événement avant de le supprimer." }, { status: 409 })
  }

  const body = deleteSchema.safeParse(await req.json().catch(() => null))
  if (!body.success || !titlesMatch(body.data.confirmTitle, owned.title)) {
    return NextResponse.json({ error: "Le titre saisi ne correspond pas à celui de l'événement." }, { status: 400 })
  }

  try {
    await db.event.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Event DELETE error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
