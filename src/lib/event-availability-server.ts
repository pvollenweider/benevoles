// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { canAdoptBeta } from "./beta-access"
import { availabilityShipped } from "./event-availability-gate"
import { availabilityDates, answerState, type AnswerState } from "./event-availability"
import { publishedMissionWindow, readAvailability, type StoredDay } from "./event-availability-data"
import { answersEditable } from "./availability-correction"
import {
  AVAILABILITY_NOT_ADOPTABLE,
  answersOpen,
  availabilityOffConfirmText,
  eventDatesLabel,
  type SendResult,
} from "./event-availability-text"
import { formatMoment, localInputToUtc, utcToLocalInput } from "./registration-window"
import { localDateTimeToUtc, orgTimeZone } from "./time-zone"
import { hashToken } from "./token-hash"
import { linkToken } from "./token-vault"
import { generateToken } from "./utils"
import { enqueueBatch } from "./notifications/outbox"
import type { NotificationPayload } from "./notifications/types"
import type { AvailabilityRequestData } from "./notifications/templates/availability"
import { OUTSTANDING_OUTBOX_STATUSES, REMIND_COOLDOWN_MS, RESEND_GUARD_MS, SEND_TRANSACTION_OPTIONS, sendCutoff } from "./invitation-sending"
import { AVAILABILITY_LINK_REVOKED_REASON } from "./outbox-address-changed-reason"
import type { OrgScopedPrisma } from "./prisma-org"
import type { Tx } from "./registration-capacity"

/**
 * The dated availability around the answers (#1146, lot A, owner decisions of 2026-10-29): the
 * event's option « Recueillir les disponibilités pour cet événement » and its deadline, the link
 * « Indiquer mes disponibilités » (its own secret per person and event, never the invitation's),
 * the request emails through the outbox, and the reads of the organisers' page. Server only.
 */

// ── Outbox keys ───────────────────────────────────────────────────────────────────────────────

/** Every email of one event's requests starts with this; one request's with `…:<requestId>:`. */
export const availabilityKeyPrefix = (eventId: string) => `availability_request:${eventId}:`
export const availabilityEmailKey = (eventId: string, requestId: string, claimedAt: Date) => `availability_request:${eventId}:${requestId}:${claimedAt.getTime()}`

/**
 * Cancels the queued availability emails of an event (or of some of its requests): their link is
 * being revoked or renewed. The delivery check (src/lib/outbox-recipient-check.ts) catches one
 * already being sent.
 */
export async function cancelAvailabilityEmails(tx: Tx, organizationId: string, eventId: string, requestIds?: string[]): Promise<number> {
  const prefix = availabilityKeyPrefix(eventId)
  const { count } = await tx.notificationOutbox.updateMany({
    where: {
      organizationId,
      status: "pending",
      ...(requestIds ? { OR: requestIds.map((id) => ({ dedupeKey: { startsWith: `${prefix}${id}:` } })) } : { dedupeKey: { startsWith: prefix } }),
    },
    data: { status: "cancelled", lastError: AVAILABILITY_LINK_REVOKED_REASON },
  })
  return count
}

// ── The option and its deadline ───────────────────────────────────────────────────────────────

export type AvailabilityOptionInput = { enabled?: boolean; deadline?: string | null; confirm?: boolean }

export type AvailabilityOptionState = { enabled: boolean; adopted: boolean; deadline: string | null; deadlineInput: string; timeZone: string; open: boolean }

export type AvailabilityOptionResult =
  | ({ ok: true; changes: Record<string, { from: unknown; to: unknown }> } & AvailabilityOptionState)
  | { ok: false; status: 400 | 403 | 404 | 409; error: string; liveLinks?: number }

type OptionRow = { id: string; availabilityEnabled: boolean; availabilityAdoptedAt: Date | null; availabilityTimeZone: string | null; availabilityDeadline: Date | null; timeZone: string | null }

function optionState(e: Pick<OptionRow, "availabilityEnabled" | "availabilityAdoptedAt" | "availabilityDeadline">, timeZone: string, now: Date): AvailabilityOptionState {
  return {
    enabled: e.availabilityEnabled,
    adopted: !!e.availabilityAdoptedAt,
    deadline: e.availabilityDeadline?.toISOString() ?? null,
    deadlineInput: utcToLocalInput(e.availabilityDeadline, timeZone),
    timeZone,
    open: answersOpen(e.availabilityDeadline, now),
  }
}

/**
 * Turns collection on or off and sets its deadline, under the event's row lock. On: a new adoption
 * (beta gate) unless the event already adopted it; the first time, the organisation's zone is
 * snapshotted for every range. Off (owner decision 4): every link is revoked and its queued emails
 * cancelled, the answers are kept; asked to confirm first while links are live. The deadline is an
 * instant entered in the event's zone (« 2030-07-01T23:59 »); a later one reopens collection, none
 * leaves it open.
 */
export async function setAvailabilityOption(db: OrgScopedPrisma, organizationId: string, eventId: string, wanted: AvailabilityOptionInput, now: Date = new Date()): Promise<AvailabilityOptionResult> {
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const rows = await tx.$queryRaw<OptionRow[]>`
      SELECT e."id", e."availabilityEnabled", e."availabilityAdoptedAt", e."availabilityTimeZone", e."availabilityDeadline", o."timeZone"
      FROM "Event" e JOIN "Organization" o ON o."id" = e."organizationId"
      WHERE e."id" = ${eventId} AND e."organizationId" = ${organizationId} FOR UPDATE OF e`
    const event = rows[0]
    if (!event) return { ok: false as const, status: 404 as const, error: "Non trouvé" }
    const timeZone = event.availabilityTimeZone ?? orgTimeZone({ timeZone: event.timeZone })
    const enabled = wanted.enabled ?? event.availabilityEnabled
    if (enabled && !event.availabilityEnabled && !event.availabilityAdoptedAt && !(availabilityShipped() && (await canAdoptBeta(organizationId, "availability", tx)))) {
      return { ok: false as const, status: 403 as const, error: AVAILABILITY_NOT_ADOPTABLE }
    }
    let deadline = event.availabilityDeadline
    if (wanted.deadline !== undefined) {
      if (wanted.deadline === null || wanted.deadline.trim() === "") deadline = null
      else {
        deadline = localInputToUtc(wanted.deadline, timeZone, localDateTimeToUtc)
        if (!deadline) return { ok: false as const, status: 400 as const, error: "Date limite invalide : indiquez une date et une heure." }
      }
    }
    const turningOff = !enabled && event.availabilityEnabled
    if (turningOff && !wanted.confirm) {
      const liveLinks = await tx.availabilityRequest.count({ where: { eventId, tokenHash: { not: null } } })
      if (liveLinks > 0) return { ok: false as const, status: 409 as const, error: availabilityOffConfirmText(liveLinks), liveLinks }
    }
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (enabled !== event.availabilityEnabled) changes.availabilityEnabled = { from: event.availabilityEnabled, to: enabled }
    if ((deadline?.getTime() ?? null) !== (event.availabilityDeadline?.getTime() ?? null)) changes.availabilityDeadline = { from: event.availabilityDeadline?.toISOString() ?? null, to: deadline?.toISOString() ?? null }
    const adoptedAt = event.availabilityAdoptedAt ?? (enabled ? now : null)
    if (Object.keys(changes).length > 0) {
      await tx.event.update({
        where: { id: eventId },
        data: { availabilityEnabled: enabled, availabilityDeadline: deadline, availabilityAdoptedAt: adoptedAt, ...(enabled && !event.availabilityTimeZone ? { availabilityTimeZone: timeZone } : {}) },
      })
    }
    if (turningOff) {
      await tx.availabilityRequest.updateMany({ where: { eventId }, data: { tokenHash: null, tokenEnc: null, tokenLegacy: null } })
      await cancelAvailabilityEmails(tx, organizationId, eventId)
    }
    return { ok: true as const, changes, ...optionState({ availabilityEnabled: enabled, availabilityAdoptedAt: adoptedAt, availabilityDeadline: deadline }, timeZone, now) }
  })
}

/** The option's state for the event's information page, or null when it is neither offered nor in use. */
export async function loadAvailabilityOption(db: OrgScopedPrisma, organizationId: string, eventId: string, now: Date = new Date()): Promise<AvailabilityOptionState | null> {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { availabilityEnabled: true, availabilityAdoptedAt: true, availabilityTimeZone: true, availabilityDeadline: true, organization: { select: { timeZone: true } } } })
  if (!event) return null
  const inUse = event.availabilityEnabled || !!event.availabilityAdoptedAt
  if (!inUse && !(availabilityShipped() && (await canAdoptBeta(organizationId, "availability")))) return null
  return optionState(event, event.availabilityTimeZone ?? orgTimeZone(event.organization), now)
}

// ── Sending the requests ──────────────────────────────────────────────────────────────────────

export type SendRequestsResult = { ok: true; result: SendResult; outboxIds: string[]; createdIds: string[] } | { ok: false; status: 400 | 404 | 409; error: string }

export type EventForSend = { id: string; title: string; startDate: Date; endDate: Date; organizationId: string; availabilityEnabled: boolean; availabilityDeadline: Date | null; availabilityTimeZone: string | null; organization: { name: string; slug: string; timeZone: string | null } }

export function availabilityRequestPayload(event: EventForSend, volunteer: { id: string; firstName: string; lastName: string; email: string }, token: string, key: string, reminder: boolean): NotificationPayload {
  const timeZone = event.availabilityTimeZone ?? orgTimeZone(event.organization)
  const data: AvailabilityRequestData = {
    firstName: volunteer.firstName,
    organizationName: event.organization.name,
    eventTitle: event.title,
    datesLabel: eventDatesLabel(event.startDate, event.endDate),
    deadlineLabel: event.availabilityDeadline ? formatMoment(event.availabilityDeadline, timeZone) : null,
    orgSlug: event.organization.slug,
    token,
    reminder,
  }
  return {
    kind: "availability_request",
    recipient: { email: volunteer.email, name: `${volunteer.firstName} ${volunteer.lastName}`.trim() },
    organizationId: event.organizationId,
    volunteerId: volunteer.id,
    dedupeKey: key,
    data,
  }
}

/**
 * Asks these members for their availability (or, with `reminder`, re-asks everyone asked who has
 * not answered yet), in one transaction with the outbox rows (#1105 pattern). Only active members of
 * the organisation (owner decision 1). A request gets its link on first send; a request whose link
 * was revoked gets a new one; otherwise the same link is sent again. Nobody is emailed twice within
 * RESEND_GUARD_MS (a double click), nor within REMIND_COOLDOWN_MS by a reminder, nor while a copy
 * still waits in the outbox. Members without an address are asked (their answers can be entered by
 * an organiser) but not emailed.
 */
export async function sendAvailabilityRequests(db: OrgScopedPrisma, eventId: string, input: { volunteerIds?: string[]; reminder?: boolean; actorId: string | null }, now: Date = new Date()): Promise<SendRequestsResult> {
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const event = await db.event.findFirst({
      where: { id: eventId },
      select: { id: true, title: true, startDate: true, endDate: true, organizationId: true, availabilityEnabled: true, availabilityDeadline: true, availabilityTimeZone: true, organization: { select: { name: true, slug: true, timeZone: true } } },
    })
    if (!event) return { ok: false as const, status: 404 as const, error: "Non trouvé" }
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR SHARE`
    if (!event.availabilityEnabled) return { ok: false as const, status: 409 as const, error: "Activez d'abord « Recueillir les disponibilités pour cet événement »." }
    if (!answersOpen(event.availabilityDeadline, now)) return { ok: false as const, status: 409 as const, error: "La date limite est passée : choisissez une nouvelle date limite pour rouvrir la collecte, puis envoyez les demandes." }

    let targetIds: string[]
    if (input.reminder) {
      const pending = await tx.availabilityRequest.findMany({ where: { eventId, answeredAt: null, sentAt: { not: null } }, select: { volunteerId: true } })
      targetIds = pending.map((r) => r.volunteerId)
    } else {
      targetIds = [...new Set(input.volunteerIds ?? [])]
      if (targetIds.length === 0) return { ok: false as const, status: 400 as const, error: "Choisissez au moins une personne." }
    }
    const members = targetIds.length === 0 ? [] : await tx.volunteer.findMany({
      where: { id: { in: targetIds }, organizationId: event.organizationId, active: true, erasedAt: null, mergedIntoId: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { id: "asc" },
    })
    if (!input.reminder && members.length === 0) return { ok: false as const, status: 400 as const, error: "Aucun membre actif de l'organisation parmi les personnes choisies." }
    if (members.length > 0) await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ANY(${members.map((m) => m.id)}::text[]) ORDER BY id FOR UPDATE`

    const existing = await tx.availabilityRequest.findMany({
      where: { eventId, volunteerId: { in: members.map((m) => m.id) } },
      select: { id: true, volunteerId: true, sentAt: true, lastRemindedAt: true, answeredAt: true, ...linkToken.select, tokenHash: true },
    })
    const byVolunteer = new Map(existing.map((r) => [r.volunteerId, r]))
    const outstandingRows = await tx.notificationOutbox.findMany({ where: { organizationId: event.organizationId, status: { in: [...OUTSTANDING_OUTBOX_STATUSES] }, dedupeKey: { startsWith: availabilityKeyPrefix(eventId) } }, select: { dedupeKey: true } })
    const outstanding = new Set(outstandingRows.map((r) => r.dedupeKey?.slice(availabilityKeyPrefix(eventId).length).split(":")[0]).filter(Boolean))
    const cutoff = sendCutoff(now, input.reminder ? REMIND_COOLDOWN_MS : RESEND_GUARD_MS)

    const payloads: NotificationPayload[] = []
    const createdIds: string[] = []
    let recentlySkipped = 0, withoutEmail = 0
    for (const m of members) {
      const row = byVolunteer.get(m.id)
      if (input.reminder && row?.answeredAt) continue
      const lastEmail = row ? [row.sentAt, row.lastRemindedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] : undefined
      const recent = (lastEmail && lastEmail > cutoff) || (row && outstanding.has(row.id))
      if (row && m.email && recent) { recentlySkipped++; continue }
      let token: string
      let requestId: string
      if (!row) {
        token = generateToken()
        const created = await tx.availabilityRequest.create({ data: { eventId, volunteerId: m.id, ...(m.email ? { ...linkToken.data(token), sentAt: now } : {}) }, select: { id: true } })
        requestId = created.id
        createdIds.push(created.id)
      } else if (!row.tokenHash) {
        token = generateToken()
        requestId = row.id
        if (m.email) await tx.availabilityRequest.update({ where: { id: row.id }, data: { ...linkToken.data(token), ...(row.sentAt ? { lastRemindedAt: now } : { sentAt: now }) } })
      } else {
        token = linkToken.reveal(row)
        requestId = row.id
        if (m.email) await tx.availabilityRequest.update({ where: { id: row.id }, data: row.sentAt ? { lastRemindedAt: now } : { sentAt: now } })
      }
      if (!m.email) { withoutEmail++; continue }
      payloads.push(availabilityRequestPayload(event, { ...m, email: m.email }, token, availabilityEmailKey(eventId, requestId, now), !!input.reminder))
    }
    const outboxIds = payloads.length === 0 ? [] : await enqueueBatch(payloads, tx, { organizationId: event.organizationId, batch: { kind: input.reminder ? "availability_reminder" : "availability_request", eventId, actorId: input.actorId } })
    return { ok: true as const, result: { asked: members.length, emailsQueued: outboxIds.length, recentlySkipped, withoutEmail }, outboxIds, createdIds }
  }, SEND_TRANSACTION_OPTIONS)
}

// ── The link of the person asked ──────────────────────────────────────────────────────────────

export type AvailabilityLinkView = {
  event: { title: string; organizationName: string; datesLabel: string }
  timeZone: string
  dates: string[]
  deadline: string | null
  open: boolean
  state: AnswerState
  answeredAt: string | null
  answeredBy: string | null
  days: StoredDay[]
  /**
   * A mission given by a publication of drafts (#1146, lot C): `published`, the page says a
   * correction cancels nothing; `viaCorrection`, open only as such a correction, until `until`.
   */
  correction: { published: boolean; viaCorrection: boolean; until: string | null }
}

/** The request behind a link, when it may be used: event collecting, person an active member. */
export async function resolveAvailabilityLink(token: string) {
  const request = await prisma.availabilityRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true, eventId: true, volunteerId: true,
      volunteer: { select: { active: true, erasedAt: true, mergedIntoId: true, organizationId: true } },
      event: { select: { title: true, startDate: true, endDate: true, organizationId: true, availabilityEnabled: true, availabilityDeadline: true, availabilityTimeZone: true, organization: { select: { name: true, slug: true, timeZone: true, active: true, suspendedAt: true } } } },
    },
  })
  if (!request) return null
  const v = request.volunteer
  if (!v.active || v.erasedAt || v.mergedIntoId || v.organizationId !== request.event.organizationId) return null
  if (!request.event.availabilityEnabled) return null
  return request
}

export type ResolvedLink = NonNullable<Awaited<ReturnType<typeof resolveAvailabilityLink>>>

/** What the page « Mes disponibilités » shows: the person's own answer only, never anyone else's. */
export async function availabilityLinkView(request: ResolvedLink, now: Date = new Date()): Promise<AvailabilityLinkView> {
  const e = request.event
  const stored = await readAvailability(prisma, request.eventId, request.volunteerId)
  const dates = availabilityDates(e.startDate, e.endDate)
  const mission = await publishedMissionWindow(prisma, request.eventId, request.volunteerId)
  const window = answersEditable({ deadline: e.availabilityDeadline, published: mission.published, until: mission.until, now })
  return {
    event: { title: e.title, organizationName: e.organization.name, datesLabel: eventDatesLabel(e.startDate, e.endDate) },
    timeZone: e.availabilityTimeZone ?? orgTimeZone(e.organization),
    dates,
    deadline: e.availabilityDeadline?.toISOString() ?? null,
    open: window.open,
    correction: { published: window.published, viaCorrection: window.viaCorrection, until: window.until?.toISOString() ?? null },
    state: answerState(dates, (stored?.days ?? []).map((d) => ({ date: d.date, rangeCount: d.ranges.length }))),
    answeredAt: stored?.answeredAt?.toISOString() ?? null,
    answeredBy: stored?.answeredBy ?? null,
    days: stored?.days ?? [],
  }
}

// ── The organisers' page ──────────────────────────────────────────────────────────────────────

export type AvailabilityOverviewRow = {
  volunteerId: string
  firstName: string
  lastName: string
  email: string | null
  state: AnswerState
  answeredDates: number
  answeredAt: string | null
  answeredBy: string | null
  sentAt: string | null
  lastRemindedAt: string | null
  hasLink: boolean
  reviewReason: string | null
  /** The answer's revision: « Marquer comme vu » clears its flag only at this revision. */
  revision: number
}

export type AvailabilityOverview = {
  dates: string[]
  timeZone: string
  counts: Record<AnswerState, number>
  rows: AvailabilityOverviewRow[]
}

/** Who was asked and where each answer stands (no ranges: they are read person by person). */
export async function loadAvailabilityOverview(db: OrgScopedPrisma, eventId: string): Promise<AvailabilityOverview | null> {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { startDate: true, endDate: true, availabilityTimeZone: true, organization: { select: { timeZone: true } } } })
  if (!event) return null
  const dates = availabilityDates(event.startDate, event.endDate)
  const requests = await db.availabilityRequest.findMany({
    where: { eventId },
    select: {
      volunteerId: true, answeredAt: true, answeredBy: true, sentAt: true, lastRemindedAt: true, tokenHash: true, reviewReason: true, revision: true,
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      days: { select: { date: true, _count: { select: { ranges: true } } } },
    },
  })
  const counts: Record<AnswerState, number> = { none: 0, partial: 0, complete: 0, unavailable: 0 }
  const wanted = new Set(dates)
  const rows = requests.map((r) => {
    const answered = r.days.map((d) => ({ date: d.date.toISOString().slice(0, 10), rangeCount: d._count.ranges }))
    const state = answerState(dates, answered)
    counts[state]++
    return {
      volunteerId: r.volunteerId,
      firstName: r.volunteer.firstName,
      lastName: r.volunteer.lastName,
      email: r.volunteer.email,
      state,
      answeredDates: answered.filter((d) => wanted.has(d.date)).length,
      answeredAt: r.answeredAt?.toISOString() ?? null,
      answeredBy: r.answeredBy,
      sentAt: r.sentAt?.toISOString() ?? null,
      lastRemindedAt: r.lastRemindedAt?.toISOString() ?? null,
      hasLink: !!r.tokenHash,
      reviewReason: r.reviewReason,
      revision: r.revision,
    }
  }).sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"))
  return { dates, timeZone: event.availabilityTimeZone ?? orgTimeZone(event.organization), counts, rows }
}

/** One person's answer for the organisers (correction form), or null outside the organisation. */
export async function loadPersonAvailability(db: OrgScopedPrisma, eventId: string, volunteerId: string) {
  const [event, volunteer] = await Promise.all([
    db.event.findFirst({ where: { id: eventId }, select: { id: true, startDate: true, endDate: true, availabilityTimeZone: true, organization: { select: { timeZone: true } } } }),
    db.volunteer.findFirst({ where: { id: volunteerId }, select: { id: true, firstName: true, lastName: true } }),
  ])
  if (!event || !volunteer) return null
  const stored = await readAvailability(db as unknown as Tx, eventId, volunteerId)
  const dates = availabilityDates(event.startDate, event.endDate)
  return {
    volunteer,
    dates,
    timeZone: event.availabilityTimeZone ?? orgTimeZone(event.organization),
    state: answerState(dates, (stored?.days ?? []).map((d) => ({ date: d.date, rangeCount: d.ranges.length }))),
    answeredAt: stored?.answeredAt?.toISOString() ?? null,
    answeredBy: stored?.answeredBy ?? null,
    reviewReason: stored?.reviewReason ?? null,
    days: stored?.days ?? [],
  }
}

/**
 * An organiser read a flagged answer (#1146, lot C): its « à revoir » flag goes, only at the
 * revision they saw (a newer answer keeps it). Under the person's lock, as every answer write.
 */
export async function markAvailabilityReviewed(db: OrgScopedPrisma, eventId: string, volunteerId: string, revision: number): Promise<"ok" | "changed" | "not_found"> {
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const request = await tx.availabilityRequest.findFirst({ where: { eventId, volunteerId }, select: { id: true } })
    if (!request) return "not_found" as const
    await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ${volunteerId} FOR UPDATE`
    const { count } = await tx.availabilityRequest.updateMany({ where: { id: request.id, eventId, revision }, data: { reviewNeededAt: null, reviewReason: null } })
    return count === 1 ? "ok" as const : "changed" as const
  })
}
