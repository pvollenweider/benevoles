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
import { reportError } from "@/lib/report-error"
import { REGISTRATION_ADMIN_SELECT } from "@/lib/admin-row-selects"
import { titlesMatch } from "@/lib/confirm-title"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { cappedText } from "@/lib/text-limits-schema"
import { EVENT_LOCATION_MAX, EVENT_TITLE_MAX, MARKDOWN_TEXT_MAX, SHOW_NAME_MAX } from "@/lib/text-limits"
import { EVENT_PUBLIC_STATUSES } from "@/lib/statuses"
import { isPublishing, publishBlocker } from "@/lib/event-publish"
import { dayContactSchema } from "@/lib/day-contact"
import { cancelDeadlineSchema } from "@/lib/cancel-deadline-schema"
import { eventDatesRefusalBody, eventDatesWorkloadCheck, type PersonFindings } from "@/lib/workload-policy-data"

/** Raised inside the date change's transaction to roll it back (#1171, days-off rule). */
class EventDatesRefusal extends Error {
  constructor(readonly people: PersonFindings[]) { super("Workload protection refuses the new dates") }
}

const showSchema = z.object({
  name: cappedText(SHOW_NAME_MAX, "Le nom du spectacle"),
  date: civilDateSchema,
  startTime: z.string(),
  endTime: z.string(),
})

const schema = z.object({
  title: cappedText(EVENT_TITLE_MAX, "Le titre").min(1).optional(),
  description: cappedText(MARKDOWN_TEXT_MAX, "La description").optional().nullable(),
  location: cappedText(EVENT_LOCATION_MAX, "Le lieu").optional().nullable(),
  startDate: civilDateSchema.optional(),
  endDate: civilDateSchema.optional(),
  publicInstructions: cappedText(MARKDOWN_TEXT_MAX, "Les informations pratiques").optional().nullable(),
  confirmationMessage: cappedText(MARKDOWN_TEXT_MAX, "Le message de confirmation").optional().nullable(),
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
  /** Shift roster between volunteers (#1068): enables the volunteers' opt-in, shows nobody by itself. Logged. */
  shiftRosterEnabled: z.boolean().optional(),
  /** Accent colour of the public page (#300): a palette key, or null for the neutral header. */
  accentColorKey: z.enum(ACCENT_KEYS).optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  /** Day-of contact (#560), for registered volunteers only. Not in the event log: a phone number. */
  ...dayContactSchema,
  /** Volunteer self-cancellation deadline (#946): days and hours before each shift, null = until the start. */
  ...cancelDeadlineSchema,
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
        // Never the personal link's token (#1009).
        include: { registrations: { where: { status: "active" }, select: { ...REGISTRATION_ADMIN_SELECT, volunteer: true } } },
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
    select: { id: true, title: true, publicStatus: true, isListed: true, startDate: true, endDate: true, publicInstructions: true, remindersEnabled: true, requirePhone: true, shiftRosterEnabled: true, cancelDeadlineDays: true, cancelDeadlineHours: true, registrationsOpen: true, registrationOpensAt: true, registrationClosesAt: true, organization: { select: { timeZone: true, publicationApprovedAt: true } } },
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
    // New dates of a protected event with a days-off rule (#1171, lot 2): the periods it checks
    // follow the dates, so they are judged for everyone under the exclusive workload lock, and the
    // whole change is refused if someone's programme would break the rule.
    const datesChange = (data.startDate && data.startDate !== owned.startDate.toISOString().slice(0, 10)) || (data.endDate && data.endDate !== owned.endDate.toISOString().slice(0, 10))
    const event = datesChange
      ? await db.$transaction(async (tx) => {
        const refused = await eventDatesWorkloadCheck(tx, id, { startDate: nextStart, endDate: nextEnd })
        if (refused.length > 0) throw new EventDatesRefusal(refused)
        return tx.event.update({ where: { id }, data: updateData })
      })
      : await db.event.update({ where: { id }, data: updateData })

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
      "shiftRosterEnabled",
      "cancelDeadlineDays",
      "cancelDeadlineHours",
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
    if (err instanceof EventDatesRefusal) return NextResponse.json(eventDatesRefusalBody(err.people), { status: 409 })
    // Not in the response: details can name tables or constraints. The log line keeps a code and the
    // scrubbed message only, never the raw error with the event's fields (src/lib/report-error.ts).
    reportError("event.update")(err)
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
    reportError("event.delete")(err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
