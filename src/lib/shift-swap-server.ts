// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"
import type { OrgScopedPrisma } from "./prisma-org"
import { lockShifts, LIVE_STATUSES } from "./registration-capacity"
import { assignedOnlyRoles } from "./role-assignment"
import { reservedRoles } from "./role-reservation"
import { roleLimits } from "./role-limit"
import { orgLinksOpen } from "./org-lifecycle"
import { orgTimeZone } from "./time-zone"
import { hashToken } from "./token-hash"
import { registrationToken } from "./token-vault"
import type { NotificationPayload } from "./notifications/types"
import type { LogActor } from "./event-log"
import { reportError } from "./report-error"
import {
  agreementTerms, beforeSwapDeadline, materialTerms, needsSwapApproval, personSwapCheck, swapCompatibility, swapDeadline,
  swapRefusalMessage, SWAP_COUNTER_LIVE_STATUSES, SWAP_LIVE_STATUSES,
  type SwapEndReason, type SwapRegistration, type SwapShift, type SwapStatus,
} from "./shift-swaps"
import { deadlineMoment, selfCancelDeadline } from "./cancel-deadline"
import { rosterDisplayName } from "./shift-roster-text"

/**
 * The commands of a shift swap (#1174), server only. The rules are in src/lib/shift-swaps.ts; each
 * command reads what they need under lock and writes its change, its event log entries and its
 * emails (outbox) in one transaction, delivered after the commit (#352): an SMTP failure never
 * undoes a swap (E16).
 *
 * Lock order, the sign-up's (shifts first, then people): the shifts involved `ORDER BY id`
 * (lockShifts), then the volunteers `ORDER BY id`, then the request row. Erasure, merge and
 * deletion lock volunteers only, the waitlist and restore shifts only: no cycle. The issue's text
 * proposed volunteers first; the public sign-up locks a shift then its volunteer, so that order
 * could deadlock with a sign-up of the same person (decision recorded in the PR). A deadlock or
 * serialization failure is retried a few times all the same (`runSwapTransaction`).
 *
 * Applying a swap (E14, E15) exchanges the `shiftId` of the two registrations: each person keeps
 * their own registration, personal link, token, comment and group link (#947), so no token changes
 * hands. The reminders already sent (J-2, J-1, same day), the check-in and the waitlist fields are
 * reset. Both shifts keep the same number of people: the capacity never dips, no waitlist offer
 * fires. Every rule runs again at each step, an organiser's approval included: a human approval
 * never overrides a hard rule.
 *
 * Who calls what (routes and pages come with the next lot of #1174): the volunteer's personal link
 * identifies `volunteerId`; an organiser's session gives `organizationId` and `adminId`.
 */

type Tx = Prisma.TransactionClient

/** The global client or an organisation's (OrgScopedPrisma): only its interactive transaction. */
export type SwapDb = { $transaction: <R>(fn: (tx: Tx) => Promise<R>, options?: { timeout?: number; maxWait?: number }) => Promise<R> }

/** What the commands accept: the global client (personal links) or an organisation's (organiser routes). */
export type SwapDbLike = typeof prisma | OrgScopedPrisma

// Both clients run the same interactive transaction; the org-scoped one constrains its model calls.
const asDb = (db: SwapDbLike) => db as unknown as SwapDb

/** What every command answers: the request's state after it, or why nothing changed. */
export type SwapResult =
  | { ok: true; requestId: string; status: SwapStatus }
  | {
      ok: false
      httpStatus: 403 | 404 | 409
      error: string
      /** The request's current status, when it exists: a replayed or late action shows where it stands. */
      status?: SwapStatus
      code?: SwapEndReason | "unavailable" | "busy" | "revision" | "declined"
    }

export const SWAP_NOT_FOUND = "Demande d'échange introuvable."
export const SWAP_UNAVAILABLE = "Les échanges de créneaux ne sont pas disponibles pour cet événement."
export const SWAP_BUSY = "Ce créneau fait déjà partie d'une autre demande d'échange : retire-la d'abord."
export const SWAP_NEW_TERMS = "La proposition a changé : relis les deux créneaux avant de confirmer."
export const SWAP_OFFER_GONE = "Ta proposition d'échange n'est plus en cours."
export const SWAP_ALREADY_DECLINED = "Ta proposition a déjà été refusée pour cette demande."

const notFound = (): SwapResult => ({ ok: false, httpStatus: 404, error: SWAP_NOT_FOUND })

/** The answer to an action the request's current state does not allow (replayed link, double click). */
export function swapStateError(status: string): string {
  switch (status) {
    case "applied": return "Cet échange a déjà été effectué."
    case "approval": return "Cet échange attend la validation de l'organisation."
    case "offered": return "Une proposition attend déjà une réponse pour cette demande."
    case "open": return "Cette demande attend encore une proposition."
    case "expired": return "Cette demande d'échange a expiré."
    case "withdrawn":
    case "refused": return "Cet échange n'a pas eu lieu."
    default: return "Cet échange ne peut plus être effectué."
  }
}

const stateError = (status: string): SwapResult => ({ ok: false, httpStatus: 409, error: swapStateError(status), status: status as SwapStatus })

// ── Transaction, locks and reads ────────────────────────────────────────────

/** A deadlock or a serialization failure, as Prisma 7's pg adapter reports it (P2010 / P2034, 40P01 / 40001). */
export function isRetryableConflict(e: unknown): boolean {
  const err = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } } } | null
  if (!err || typeof err !== "object") return false
  if (err.code === "P2034") return true
  const cause = err.meta?.driverAdapterError?.cause
  return cause?.originalCode === "40P01" || cause?.originalCode === "40001" || cause?.kind === "TransactionWriteConflict"
}

/** Runs `fn` in one transaction, again (at most three times in all) after a deadlock or serialization failure. */
export async function runSwapTransaction<R>(db: SwapDb, fn: (tx: Tx) => Promise<R>): Promise<R> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(fn, { timeout: 15_000 })
    } catch (e) {
      if (attempt < 3 && isRetryableConflict(e)) continue
      throw e
    }
  }
}

const isUniqueViolation = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002"

async function lockVolunteers(tx: Tx, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ANY(${unique}::text[]) ORDER BY id FOR UPDATE`
}

type LockedRequest = {
  id: string; eventId: string; status: string; registrationId: string; volunteerId: string; shiftId: string
  counterRegistrationId: string | null; counterVolunteerId: string | null; counterShiftId: string | null
  revision: number; termsHash: string | null; shiftHash: string; declinedVolunteerIds: string[]; expiresAt: Date
}

/** Locks the request row (last in the lock order), within `organizationId` when given. */
async function lockRequest(tx: Tx, requestId: string, organizationId?: string): Promise<LockedRequest | null> {
  const rows = organizationId
    ? await tx.$queryRaw<LockedRequest[]>`SELECT r.* FROM "ShiftSwapRequest" r JOIN "Event" e ON e.id = r."eventId" WHERE r.id = ${requestId} AND e."organizationId" = ${organizationId} FOR UPDATE OF r`
    : await tx.$queryRaw<LockedRequest[]>`SELECT * FROM "ShiftSwapRequest" WHERE id = ${requestId} FOR UPDATE`
  return rows[0] ?? null
}

const SHIFT_SELECT = {
  id: true, eventId: true, roleName: true, label: true, status: true, date: true, startTime: true, endTime: true,
  overlapAllowed: true, assignedOnly: true, requiresApproval: true, minAge: true, reservedTags: true,
  locationDetails: true, latitude: true, longitude: true, sectorId: true, instructions: true,
} as const

const REG_SELECT = {
  id: true, eventId: true, volunteerId: true, status: true, shiftId: true, editTokenEnc: true, editTokenLegacy: true,
  shift: { select: SHIFT_SELECT },
  volunteer: { select: { firstName: true, lastName: true, email: true, active: true, erasedAt: true, mergedIntoId: true, birthDate: true, tags: true } },
} as const

const EVENT_SELECT = {
  id: true, title: true, organizationId: true, publicStatus: true, shiftSwapsEnabled: true, shiftSwapsApproval: true,
  cancelDeadlineDays: true, cancelDeadlineHours: true,
  organization: { select: { slug: true, timeZone: true, active: true, suspendedAt: true } },
} as const

type LoadedRegistration = Prisma.RegistrationGetPayload<{ select: typeof REG_SELECT }>
type LoadedEvent = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>

const loadRegistration = (tx: Tx, id: string | null) => (id ? tx.registration.findFirst({ where: { id }, select: REG_SELECT }) : Promise.resolve(null))
const loadEvent = (tx: Tx, id: string) => tx.event.findFirst({ where: { id }, select: EVENT_SELECT })

const asSwapRegistration = (r: LoadedRegistration): SwapRegistration => ({ id: r.id, volunteerId: r.volunteerId, eventId: r.eventId, status: r.status, shift: r.shift })

/** Events that accept no mutation at all: the organisation is closed (T05) or the event archived. */
function eventUnavailable(event: LoadedEvent): boolean {
  return !orgLinksOpen(event.organization) || event.publicStatus === "archived"
}

const unavailable = (): SwapResult => ({ ok: false, httpStatus: 403, error: SWAP_UNAVAILABLE, code: "unavailable" })

const termsHashOf = (a: SwapShift, b: SwapShift) => hashToken(agreementTerms(a, b))
const shiftHashOf = (s: SwapShift) => hashToken(materialTerms(s))

/** Whether the registration is part of a live request other than `exceptRequestId`, on either side. */
async function registrationBusy(tx: Tx, registrationId: string, exceptRequestId?: string): Promise<boolean> {
  const found = await tx.shiftSwapRequest.findFirst({
    where: {
      ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}),
      OR: [
        { registrationId, status: { in: [...SWAP_LIVE_STATUSES] } },
        { counterRegistrationId: registrationId, status: { in: [...SWAP_COUNTER_LIVE_STATUSES] } },
      ],
    },
    select: { id: true },
  })
  return found != null
}

/** One person's side, as the eligibility check reads it (their live registrations, the roles' settings). */
async function personCheck(tx: Tx, event: LoadedEvent, giving: LoadedRegistration, receiving: SwapShift) {
  const [held, roleShifts] = await Promise.all([
    tx.registration.findMany({ where: { volunteerId: giving.volunteerId, eventId: event.id, status: { in: [...LIVE_STATUSES] } }, select: { id: true, status: true, shift: { select: SHIFT_SELECT } } }),
    tx.shift.findMany({ where: { eventId: event.id, roleName: receiving.roleName, status: { not: "cancelled" } }, select: { roleName: true, reservedTags: true, maxPerVolunteer: true } }),
  ])
  return personSwapCheck({
    person: giving.volunteer,
    giving,
    receiving,
    held,
    reserved: reservedRoles(roleShifts),
    limits: roleLimits(roleShifts),
  })
}

type Evaluation = { ok: true; approval: boolean } | { ok: false; end: "expired" | "impossible" | "cancelled"; reason: SwapEndReason }

/**
 * Every rule of the swap, read now under the locks (E05, E06, E08, E12, E13): the event's option,
 * both registrations still confirmed on the agreed shifts, the agreed terms unchanged, the deadline,
 * compatibility and each person's plan. `terms` false at the offer itself, where they are set.
 */
async function evaluateSwap(tx: Tx, req: LockedRequest, event: LoadedEvent, mine: LoadedRegistration | null, theirs: LoadedRegistration | null, now: Date, opts: { terms: boolean }): Promise<Evaluation> {
  if (!event.shiftSwapsEnabled) return { ok: false, end: "cancelled", reason: "option_off" }
  const gone = (r: LoadedRegistration | null, volunteerId: string | null, shiftId: string | null) =>
    !r || r.volunteerId !== volunteerId || r.shiftId !== shiftId || r.status !== "active" || r.eventId !== req.eventId
  if (gone(mine, req.volunteerId, req.shiftId) || gone(theirs, req.counterVolunteerId, req.counterShiftId)) return { ok: false, end: "impossible", reason: "registration_gone" }
  const a = mine!, b = theirs!
  if (shiftHashOf(a.shift) !== req.shiftHash) return { ok: false, end: "impossible", reason: "shift_changed" }
  if (opts.terms && termsHashOf(a.shift, b.shift) !== req.termsHash) return { ok: false, end: "impossible", reason: "shift_changed" }
  const deadline = swapDeadline({ expiresAt: req.expiresAt, given: [a.shift, b.shift], setting: event, timeZone: orgTimeZone(event.organization) })
  if (!beforeSwapDeadline(now, deadline)) return { ok: false, end: "expired", reason: "deadline" }
  const hidden = assignedOnlyRoles(await tx.shift.findMany({ where: { eventId: event.id, status: { not: "cancelled" }, assignedOnly: true }, select: { roleName: true, assignedOnly: true } }))
  const compatible = swapCompatibility(asSwapRegistration(a), asSwapRegistration(b), { assignedOnlyRoles: hidden })
  if (!compatible.ok) return { ok: false, end: "impossible", reason: compatible.code }
  for (const [giving, receiving] of [[a, b.shift], [b, a.shift]] as const) {
    const check = await personCheck(tx, event, giving, receiving)
    if (!check.ok) return { ok: false, end: "impossible", reason: check.code }
  }
  return { ok: true, approval: needsSwapApproval(a.shift, b.shift, event) }
}

/** The request's own side, before any offer: the option, Pierre's registration, his shift's terms and deadline. */
function requesterSide(req: LockedRequest, event: LoadedEvent, mine: LoadedRegistration | null, now: Date): Evaluation {
  if (!event.shiftSwapsEnabled) return { ok: false, end: "cancelled", reason: "option_off" }
  if (!mine || mine.volunteerId !== req.volunteerId || mine.shiftId !== req.shiftId || mine.status !== "active") return { ok: false, end: "impossible", reason: "registration_gone" }
  if (shiftHashOf(mine.shift) !== req.shiftHash) return { ok: false, end: "impossible", reason: "shift_changed" }
  const deadline = swapDeadline({ expiresAt: req.expiresAt, given: [mine.shift], setting: event, timeZone: orgTimeZone(event.organization) })
  if (!beforeSwapDeadline(now, deadline)) return { ok: false, end: "expired", reason: "deadline" }
  return { ok: true, approval: false }
}

// ── Emails (outbox) ─────────────────────────────────────────────────────────

type ShiftPart = { roleName: string; label: string; date: string; startTime: string; endTime: string; locationDetails: string | null; instructions: string | null }

const shiftPart = (s: LoadedRegistration["shift"]): ShiftPart => ({
  roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime,
  locationDetails: s.locationDetails ?? null, instructions: s.instructions ?? null,
})

const nameOf = (r: LoadedRegistration) => `${r.volunteer.firstName} ${r.volunteer.lastName}`.trim()

function appliedPayload(event: LoadedEvent, req: LockedRequest, person: LoadedRegistration, gave: LoadedRegistration["shift"], received: LoadedRegistration["shift"]): NotificationPayload | null {
  const editToken = registrationToken.reveal(person)
  if (!person.volunteer.email || !editToken) return null
  return {
    kind: "shift_swap_applied",
    recipient: { email: person.volunteer.email, name: nameOf(person) },
    volunteerId: person.volunteerId,
    organizationId: event.organizationId,
    dedupeKey: `shift_swap_applied:${req.id}:${person.volunteerId}`,
    data: { volunteerName: nameOf(person), eventTitle: event.title, orgSlug: event.organization.slug, gave: shiftPart(gave), received: shiftPart(received), editToken },
  }
}

/**
 * To Pierre: someone offered a swap (#1174). Names the other person as « Jean D. » only (owner
 * decision, 2026-10-27); the email only links to the personal page, where the answer is a POST
 * bound to this offer's revision (never an action by GET).
 */
function offeredPayload(event: LoadedEvent, req: LockedRequest, mine: LoadedRegistration, theirs: LoadedRegistration, deadline: Date): NotificationPayload | null {
  const editToken = registrationToken.reveal(mine)
  if (!mine.volunteer.email || !editToken) return null
  return {
    kind: "shift_swap_offered",
    recipient: { email: mine.volunteer.email, name: nameOf(mine) },
    volunteerId: mine.volunteerId,
    organizationId: event.organizationId,
    dedupeKey: `shift_swap_offered:${req.id}:${req.revision}`,
    data: {
      volunteerName: nameOf(mine), eventTitle: event.title, orgSlug: event.organization.slug,
      otherName: rosterDisplayName(theirs.volunteer.firstName, theirs.volunteer.lastName),
      gives: shiftPart(mine.shift), receives: shiftPart(theirs.shift),
      deadline: deadlineMoment(deadline, orgTimeZone(event.organization)), editToken,
    },
  }
}

/** To each active organiser: a swap waits for their approval, with both people and both missions. */
function approvalPayload(event: LoadedEvent, req: LockedRequest, admin: { email: string; name: string | null }, mine: LoadedRegistration, theirs: LoadedRegistration, deadline: Date): NotificationPayload {
  return {
    kind: "shift_swap_approval_needed",
    recipient: { email: admin.email, name: admin.name ?? undefined },
    organizationId: event.organizationId,
    dedupeKey: `shift_swap_approval_needed:${req.id}:${req.revision}:${admin.email.toLowerCase()}`,
    data: {
      eventId: event.id, eventTitle: event.title,
      requester: { name: nameOf(mine), shift: shiftPart(mine.shift) },
      counterpart: { name: nameOf(theirs), shift: shiftPart(theirs.shift) },
      deadline: deadlineMoment(deadline, orgTimeZone(event.organization)),
    },
  }
}

export type SwapEndedOutcome = "expired" | "impossible" | "refused" | "cancelled" | "withdrawn" | "declined"

function endedPayload(event: LoadedEvent, req: LockedRequest, person: LoadedRegistration | null, outcome: SwapEndedOutcome, reason: SwapEndReason | null): NotificationPayload | null {
  if (!person) return null
  const editToken = registrationToken.reveal(person)
  if (!person.volunteer.email || !editToken) return null
  return {
    kind: "shift_swap_ended",
    recipient: { email: person.volunteer.email, name: nameOf(person) },
    volunteerId: person.volunteerId,
    organizationId: event.organizationId,
    dedupeKey: `shift_swap_ended:${req.id}:${req.revision}:${person.volunteerId}:${outcome}`,
    data: {
      volunteerName: nameOf(person), eventTitle: event.title, orgSlug: event.organization.slug,
      outcome, reason: reason ? swapRefusalMessage(reason) : null, kept: shiftPart(person.shift), editToken,
    },
  }
}

async function queue(tx: Tx, event: LoadedEvent, payloads: (NotificationPayload | null)[]): Promise<string[]> {
  const real = payloads.filter((p): p is NotificationPayload => p !== null)
  if (real.length === 0) return []
  // Loaded on use: the hooks put this module in many routes, and the email channel behind the
  // outbox validates the whole environment when it is first imported.
  const { enqueueNotifications } = await import("./notifications/outbox")
  return enqueueNotifications(real, tx, { organizationId: event.organizationId })
}

/** Delivery right after the response; outside a request (a job, a test) the outbox run sends them. */
function deliver(ids: string[]): void {
  if (ids.length === 0) return
  void import("./notifications/outbox").then(({ deliverAfterResponse }) => {
    try { deliverAfterResponse(ids) } catch { /* outside a request: the next outbox run sends them */ }
  }, reportError("swap.deliver"))
}

const actorFields = (actor: LogActor) => ({ actorType: actor.type, actorId: ("id" in actor ? actor.id : undefined) ?? null })

/**
 * Ends a live request (expired, impossible, refused, cancelled) inside the caller's transaction,
 * with its log entry and the emails to the people concerned. The request row is locked first;
 * nothing happens when it already ended.
 */
async function endRequest(tx: Tx, req: LockedRequest, event: LoadedEvent, end: "expired" | "impossible" | "refused" | "cancelled", reason: SwapEndReason, actor: LogActor, now: Date, extra: { decidedById?: string } = {}): Promise<string[]> {
  const { count } = await tx.shiftSwapRequest.updateMany({
    where: { id: req.id, status: { in: [...SWAP_LIVE_STATUSES] } },
    data: { status: end, endReason: reason, endedAt: now, ...(extra.decidedById ? { decidedById: extra.decidedById, decidedAt: now } : {}) },
  })
  if (count === 0) return []
  await tx.eventLog.create({
    data: {
      eventId: req.eventId, ...actorFields(actor),
      action: end === "expired" ? "swap.expired" : end === "refused" ? "swap.refused" : "swap.ended",
      entityType: "ShiftSwap", entityId: req.id,
      changes: { swapStatus: { from: req.status, to: end }, swapReason: { from: null, to: reason } },
    },
  })
  const [mine, theirs] = await Promise.all([loadRegistration(tx, req.registrationId), loadRegistration(tx, req.counterRegistrationId)])
  // Only a person who still holds their place is told « Tu conserves ton créneau »: one whose
  // registration was withdrawn or removed already got that email.
  const told = (r: LoadedRegistration | null, volunteerId: string | null) => (r && r.volunteerId === volunteerId && r.status === "active" ? r : null)
  const people = [told(mine, req.volunteerId), told(theirs, req.counterVolunteerId)]
  return queue(tx, event, people.map((p) => endedPayload(event, req, p, end, reason)))
}

// ── Commands ────────────────────────────────────────────────────────────────

/**
 * « Je cherche à échanger ce créneau » (#1174): Pierre publishes one of his confirmed registrations.
 * Reserves nothing; at most one live request per registration, on either side. Its expiry is the
 * self-cancellation deadline of the shift, or `expiresAt` when earlier.
 */
export async function publishSwapRequest(db: SwapDbLike, input: { registrationId: string; volunteerId: string; now?: Date; expiresAt?: Date }): Promise<SwapResult> {
  const now = input.now ?? new Date()
  const pre = await prisma.registration.findFirst({ where: { id: input.registrationId, volunteerId: input.volunteerId }, select: { shiftId: true, eventId: true } })
  if (!pre) return notFound()
  try {
    return await runSwapTransaction(asDb(db), async (tx): Promise<SwapResult> => {
      await lockShifts(tx, [pre.shiftId])
      await lockVolunteers(tx, [input.volunteerId])
      const [reg, event] = await Promise.all([loadRegistration(tx, input.registrationId), loadEvent(tx, pre.eventId)])
      if (!reg || !event || reg.volunteerId !== input.volunteerId) return notFound()
      if (eventUnavailable(event) || !event.shiftSwapsEnabled) return unavailable()
      if (reg.status !== "active" || reg.shiftId !== pre.shiftId) return { ok: false, httpStatus: 409, error: swapRefusalMessage("not_confirmed"), code: "not_confirmed" }
      if (reg.shift.status === "cancelled") return { ok: false, httpStatus: 409, error: swapRefusalMessage("shift_cancelled"), code: "shift_cancelled" }
      const hidden = assignedOnlyRoles(await tx.shift.findMany({ where: { eventId: event.id, status: { not: "cancelled" }, assignedOnly: true }, select: { roleName: true, assignedOnly: true } }))
      if (reg.shift.assignedOnly || hidden.has(reg.shift.roleName)) return { ok: false, httpStatus: 409, error: swapRefusalMessage("assigned_only"), code: "assigned_only" }
      const deadline = selfCancelDeadline(reg.shift, event, orgTimeZone(event.organization))
      const expiresAt = input.expiresAt && input.expiresAt < deadline ? input.expiresAt : deadline
      if (!beforeSwapDeadline(now, expiresAt)) return { ok: false, httpStatus: 409, error: swapRefusalMessage("deadline"), code: "deadline" }
      if (await registrationBusy(tx, reg.id)) return { ok: false, httpStatus: 409, error: SWAP_BUSY, code: "busy" }
      const created = await tx.shiftSwapRequest.create({
        data: { eventId: event.id, registrationId: reg.id, volunteerId: reg.volunteerId, shiftId: reg.shiftId, shiftHash: shiftHashOf(reg.shift), expiresAt },
        select: { id: true },
      })
      await tx.eventLog.create({
        data: {
          eventId: event.id, ...actorFields({ type: "volunteer", id: reg.volunteerId }),
          action: "swap.published", entityType: "ShiftSwap", entityId: created.id,
          changes: { swapStatus: { from: null, to: "open" }, shiftId: { from: null, to: reg.shiftId } },
        },
      })
      return { ok: true, requestId: created.id, status: "open" }
    })
  } catch (e) {
    // Two publications of the same registration at once: the partial unique index keeps one.
    if (isUniqueViolation(e)) return { ok: false, httpStatus: 409, error: SWAP_BUSY, code: "busy" }
    throw e
  }
}

/**
 * Jean offers one of his own confirmed registrations in return. The whole swap is checked now;
 * a rule about Pierre's side ends the request, one about Jean's only refuses his offer.
 */
export async function offerSwap(db: SwapDbLike, input: { requestId: string; registrationId: string; volunteerId: string; now?: Date }): Promise<SwapResult> {
  const now = input.now ?? new Date()
  const [preReq, preReg] = await Promise.all([
    prisma.shiftSwapRequest.findFirst({ where: { id: input.requestId }, select: { shiftId: true, volunteerId: true, eventId: true } }),
    prisma.registration.findFirst({ where: { id: input.registrationId, volunteerId: input.volunteerId }, select: { shiftId: true, eventId: true } }),
  ])
  if (!preReq || !preReg || preReq.eventId !== preReg.eventId) return notFound()
  let outboxIds: string[] = []
  try {
    const result = await runSwapTransaction(asDb(db), async (tx): Promise<SwapResult> => {
      await lockShifts(tx, [preReq.shiftId, preReg.shiftId])
      await lockVolunteers(tx, [preReq.volunteerId, input.volunteerId])
      const req = await lockRequest(tx, input.requestId)
      if (!req) return notFound()
      const event = await loadEvent(tx, req.eventId)
      if (!event) return notFound()
      if (eventUnavailable(event)) return unavailable()
      if (req.status !== "open") return stateError(req.status)
      if (req.volunteerId === input.volunteerId) return { ok: false, httpStatus: 409, error: swapRefusalMessage("same_person"), code: "same_person" }
      if (req.declinedVolunteerIds.includes(input.volunteerId)) return { ok: false, httpStatus: 409, error: SWAP_ALREADY_DECLINED, code: "declined" }
      const [mine, theirs] = await Promise.all([loadRegistration(tx, req.registrationId), loadRegistration(tx, input.registrationId)])
      if (!theirs || theirs.volunteerId !== input.volunteerId) return notFound()
      if (theirs.status !== "active" || theirs.shiftId !== preReg.shiftId) return { ok: false, httpStatus: 409, error: swapRefusalMessage("not_confirmed"), code: "not_confirmed" }
      if (await registrationBusy(tx, theirs.id, req.id)) return { ok: false, httpStatus: 409, error: SWAP_BUSY, code: "busy" }
      // Pierre's side or the request itself can no longer work: it ends, and he is told.
      const own = requesterSide(req, event, mine, now)
      if (!own.ok) {
        outboxIds = await endRequest(tx, req, event, own.end, own.reason, { type: "system" }, now)
        return { ok: false, httpStatus: 409, error: swapRefusalMessage(own.reason), status: own.end, code: own.reason }
      }
      // Anything else is about this offer: refused, the request stays open for another one.
      const proposed: LockedRequest = { ...req, counterRegistrationId: theirs.id, counterVolunteerId: theirs.volunteerId, counterShiftId: theirs.shiftId }
      const verdict = await evaluateSwap(tx, proposed, event, mine, theirs, now, { terms: false })
      if (!verdict.ok) return { ok: false, httpStatus: 409, error: swapRefusalMessage(verdict.reason), status: "open", code: verdict.reason }
      const revision = req.revision + 1
      await tx.shiftSwapRequest.update({
        where: { id: req.id },
        data: {
          status: "offered", counterRegistrationId: theirs.id, counterVolunteerId: theirs.volunteerId, counterShiftId: theirs.shiftId,
          revision, termsHash: termsHashOf(mine!.shift, theirs.shift), offeredAt: now, confirmedAt: null,
        },
      })
      await tx.eventLog.create({
        data: {
          eventId: req.eventId, ...actorFields({ type: "volunteer", id: input.volunteerId }),
          action: "swap.offered", entityType: "ShiftSwap", entityId: req.id,
          changes: { swapStatus: { from: "open", to: "offered" }, shiftId: { from: null, to: theirs.shiftId } },
        },
      })
      // Pierre is told, with « Jean D. » and both missions; he answers from his personal page.
      const deadline = swapDeadline({ expiresAt: req.expiresAt, given: [mine!.shift, theirs.shift], setting: event, timeZone: orgTimeZone(event.organization) })
      outboxIds = await queue(tx, event, [offeredPayload(event, { ...req, revision }, mine!, theirs, deadline)])
      return { ok: true, requestId: req.id, status: "offered" }
    })
    deliver(outboxIds)
    return result
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, httpStatus: 409, error: SWAP_BUSY, code: "busy" }
    throw e
  }
}

/** Locks what a step on an existing request needs, in the lock order, and reads it again. */
async function lockForStep(tx: Tx, requestId: string, organizationId?: string) {
  const pre = await tx.shiftSwapRequest.findFirst({ where: { id: requestId }, select: { shiftId: true, counterShiftId: true, volunteerId: true, counterVolunteerId: true } })
  if (!pre) return null
  await lockShifts(tx, [pre.shiftId, ...(pre.counterShiftId ? [pre.counterShiftId] : [])])
  await lockVolunteers(tx, [pre.volunteerId, ...(pre.counterVolunteerId ? [pre.counterVolunteerId] : [])])
  const req = await lockRequest(tx, requestId, organizationId)
  if (!req) return null
  // The counterpart changed between the read and the lock (a new offer): its shift and person are
  // not locked. The caller's revision no longer matches anyway; answer with the current state.
  const stale = req.counterShiftId !== pre.counterShiftId || req.counterVolunteerId !== pre.counterVolunteerId
  const event = await loadEvent(tx, req.eventId)
  if (!event) return null
  return { req, event, stale }
}

/** The swap itself, inside the step's transaction once every rule passed (E14, E15). */
async function applySwap(tx: Tx, req: LockedRequest, event: LoadedEvent, mine: LoadedRegistration, theirs: LoadedRegistration, actor: LogActor, now: Date, extra: { decidedById?: string } = {}): Promise<string[]> {
  const resets = { reminderJ2Sent: null, reminderJ1Sent: null, reminderDdSent: null, checkedInAt: null, waitingPosition: null, waitingOfferedAt: null, waitingExpiresAt: null }
  const moved = [
    await tx.registration.updateMany({ where: { id: mine.id, volunteerId: mine.volunteerId, shiftId: mine.shiftId, status: "active" }, data: { shiftId: theirs.shiftId, ...resets } }),
    await tx.registration.updateMany({ where: { id: theirs.id, volunteerId: theirs.volunteerId, shiftId: theirs.shiftId, status: "active" }, data: { shiftId: mine.shiftId, ...resets } }),
  ]
  // Both rows were read under the locks: anything else is a bug, never half a swap.
  if (moved.some((m) => m.count !== 1)) throw new Error("Shift swap: a registration changed under the locks")
  await tx.shiftSwapRequest.update({
    where: { id: req.id },
    data: { status: "applied", appliedAt: now, ...(extra.decidedById ? { decidedById: extra.decidedById, decidedAt: now } : {}), ...(req.status === "offered" ? { confirmedAt: now } : {}) },
  })
  // The immutable trace of the old and new assignments, committed with them: the request's entry,
  // and one entry per registration caused by it (narrative mode follows the link).
  const applied = await tx.eventLog.create({
    data: {
      eventId: req.eventId, ...actorFields(actor), action: "swap.applied", entityType: "ShiftSwap", entityId: req.id,
      changes: { swapStatus: { from: req.status, to: "applied" } },
    },
    select: { id: true },
  })
  await tx.eventLog.create({
    data: {
      eventId: req.eventId, ...actorFields(actor), action: "registration.swapped", entityType: "Registration", entityId: mine.id,
      changes: { shiftId: { from: mine.shiftId, to: theirs.shiftId } }, causedByLogId: applied.id,
    },
  })
  await tx.eventLog.create({
    data: {
      eventId: req.eventId, ...actorFields(actor), action: "registration.swapped", entityType: "Registration", entityId: theirs.id,
      changes: { shiftId: { from: theirs.shiftId, to: mine.shiftId } }, causedByLogId: applied.id,
    },
  })
  return queue(tx, event, [appliedPayload(event, req, mine, mine.shift, theirs.shift), appliedPayload(event, req, theirs, theirs.shift, mine.shift)])
}

/**
 * Pierre confirms the offer he saw (`revision`). Every rule runs again; then the swap is applied at
 * once, or waits for an organiser (« Validation attendue ») when one of the shifts is « sur
 * validation » or the event asks to approve every swap. A rule that fails now ends the request.
 */
export async function confirmSwap(db: SwapDbLike, input: { requestId: string; volunteerId: string; revision: number; now?: Date }): Promise<SwapResult> {
  const now = input.now ?? new Date()
  let outboxIds: string[] = []
  const result = await runSwapTransaction(asDb(db), async (tx): Promise<SwapResult> => {
    const locked = await lockForStep(tx, input.requestId)
    if (!locked || locked.req.volunteerId !== input.volunteerId) return notFound()
    const { req, event } = locked
    if (eventUnavailable(event)) return unavailable()
    if (req.status !== "offered") return stateError(req.status)
    if (locked.stale || req.revision !== input.revision) return { ok: false, httpStatus: 409, error: SWAP_NEW_TERMS, status: req.status as SwapStatus, code: "revision" }
    const [mine, theirs] = await Promise.all([loadRegistration(tx, req.registrationId), loadRegistration(tx, req.counterRegistrationId)])
    const verdict = await evaluateSwap(tx, req, event, mine, theirs, now, { terms: true })
    if (!verdict.ok) {
      outboxIds = await endRequest(tx, req, event, verdict.end, verdict.reason, { type: "volunteer", id: input.volunteerId }, now)
      return { ok: false, httpStatus: 409, error: swapRefusalMessage(verdict.reason), status: verdict.end, code: verdict.reason }
    }
    if (verdict.approval) {
      await tx.shiftSwapRequest.update({ where: { id: req.id }, data: { status: "approval", confirmedAt: now } })
      await tx.eventLog.create({
        data: {
          eventId: req.eventId, ...actorFields({ type: "volunteer", id: input.volunteerId }),
          action: "swap.confirmed", entityType: "ShiftSwap", entityId: req.id,
          changes: { swapStatus: { from: "offered", to: "approval" } },
        },
      })
      // The organisers are told: nothing changes until one of them approves, before the deadline.
      const deadline = swapDeadline({ expiresAt: req.expiresAt, given: [mine!.shift, theirs!.shift], setting: event, timeZone: orgTimeZone(event.organization) })
      const admins = await tx.adminUser.findMany({ where: { organizationId: event.organizationId, isActive: true }, select: { email: true, name: true } })
      outboxIds = await queue(tx, event, admins.map((a) => approvalPayload(event, req, a, mine!, theirs!, deadline)))
      return { ok: true, requestId: req.id, status: "approval" }
    }
    outboxIds = await applySwap(tx, req, event, mine!, theirs!, { type: "volunteer", id: input.volunteerId }, now)
    return { ok: true, requestId: req.id, status: "applied" }
  })
  deliver(outboxIds)
  return result
}

/**
 * An organiser approves or refuses a swap waiting for validation (`revision` as shown). Approving
 * runs every rule again (an approval never overrides one) and applies the swap; refusing ends it.
 */
export async function decideSwap(db: SwapDbLike, input: { organizationId: string; requestId: string; adminId: string; approve: boolean; revision: number; now?: Date }): Promise<SwapResult> {
  const now = input.now ?? new Date()
  const actor: LogActor = { type: "admin", id: input.adminId }
  let outboxIds: string[] = []
  const result = await runSwapTransaction(asDb(db), async (tx): Promise<SwapResult> => {
    const locked = await lockForStep(tx, input.requestId, input.organizationId)
    if (!locked || locked.event.organizationId !== input.organizationId) return notFound()
    const { req, event } = locked
    if (eventUnavailable(event)) return unavailable()
    if (req.status !== "approval") return stateError(req.status)
    if (locked.stale || req.revision !== input.revision) return { ok: false, httpStatus: 409, error: SWAP_NEW_TERMS, status: req.status as SwapStatus, code: "revision" }
    if (!input.approve) {
      outboxIds = await endRequest(tx, req, event, "refused", "organiser", actor, now, { decidedById: input.adminId })
      return { ok: true, requestId: req.id, status: "refused" }
    }
    const [mine, theirs] = await Promise.all([loadRegistration(tx, req.registrationId), loadRegistration(tx, req.counterRegistrationId)])
    const verdict = await evaluateSwap(tx, req, event, mine, theirs, now, { terms: true })
    if (!verdict.ok) {
      outboxIds = await endRequest(tx, req, event, verdict.end, verdict.reason, actor, now)
      return { ok: false, httpStatus: 409, error: swapRefusalMessage(verdict.reason), status: verdict.end, code: verdict.reason }
    }
    outboxIds = await applySwap(tx, req, event, mine!, theirs!, actor, now, { decidedById: input.adminId })
    return { ok: true, requestId: req.id, status: "applied" }
  })
  deliver(outboxIds)
  return result
}

/**
 * Pierre declines the offer he saw: the request is open again for someone else, and Jean, told,
 * cannot offer again on it (no repeated offers after a refusal). Refusing changes nothing else.
 */
export async function declineSwapOffer(db: SwapDbLike, input: { requestId: string; volunteerId: string; revision: number }): Promise<SwapResult> {
  let outboxIds: string[] = []
  const result = await runSwapTransaction(asDb(db), async (tx): Promise<SwapResult> => {
    const locked = await lockForStep(tx, input.requestId)
    if (!locked || locked.req.volunteerId !== input.volunteerId) return notFound()
    const { req, event } = locked
    if (req.status !== "offered") return stateError(req.status)
    if (locked.stale || req.revision !== input.revision) return { ok: false, httpStatus: 409, error: SWAP_NEW_TERMS, status: req.status as SwapStatus, code: "revision" }
    const theirs = await loadRegistration(tx, req.counterRegistrationId)
    await tx.shiftSwapRequest.update({
      where: { id: req.id },
      data: {
        status: "open", counterRegistrationId: null, counterVolunteerId: null, counterShiftId: null, termsHash: null, offeredAt: null,
        declinedVolunteerIds: req.counterVolunteerId ? [...new Set([...req.declinedVolunteerIds, req.counterVolunteerId])] : req.declinedVolunteerIds,
      },
    })
    await tx.eventLog.create({
      data: {
        eventId: req.eventId, ...actorFields({ type: "volunteer", id: input.volunteerId }),
        action: "swap.offer_declined", entityType: "ShiftSwap", entityId: req.id,
        changes: { swapStatus: { from: "offered", to: "open" } },
      },
    })
    outboxIds = await queue(tx, event, [theirs?.volunteerId === req.counterVolunteerId ? endedPayload(event, req, theirs, "declined", null) : null])
    return { ok: true, requestId: req.id, status: "open" }
  })
  deliver(outboxIds)
  return result
}

/**
 * Jean takes back his offer, before it is applied (also while it waits for an organiser): the
 * request is open again and Pierre is told.
 */
export async function withdrawSwapOffer(db: SwapDbLike, input: { requestId: string; volunteerId: string; revision: number }): Promise<SwapResult> {
  let outboxIds: string[] = []
  const result = await runSwapTransaction(asDb(db), async (tx): Promise<SwapResult> => {
    const locked = await lockForStep(tx, input.requestId)
    if (!locked) return notFound()
    // Already withdrawn, declined or replaced: no longer this person's offer (says nothing of the request).
    if (locked.req.counterVolunteerId !== input.volunteerId) return { ok: false, httpStatus: 409, error: SWAP_OFFER_GONE }
    const { req, event } = locked
    if (req.status !== "offered" && req.status !== "approval") return stateError(req.status)
    // An old page's POST never takes back a later offer of the same person (Codex, PR 2).
    if (locked.stale || req.revision !== input.revision) return { ok: false, httpStatus: 409, error: SWAP_OFFER_GONE, code: "revision" }
    await tx.shiftSwapRequest.update({
      where: { id: req.id },
      data: { status: "open", counterRegistrationId: null, counterVolunteerId: null, counterShiftId: null, termsHash: null, offeredAt: null, confirmedAt: null },
    })
    await tx.eventLog.create({
      data: {
        eventId: req.eventId, ...actorFields({ type: "volunteer", id: input.volunteerId }),
        action: "swap.offer_withdrawn", entityType: "ShiftSwap", entityId: req.id,
        changes: { swapStatus: { from: req.status, to: "open" } },
      },
    })
    const mine = await loadRegistration(tx, req.registrationId)
    outboxIds = await queue(tx, event, [mine?.volunteerId === req.volunteerId ? endedPayload(event, req, mine, "withdrawn", null) : null])
    return { ok: true, requestId: req.id, status: "open" }
  })
  deliver(outboxIds)
  return result
}

/** Pierre withdraws his request, whatever its live state; Jean, if he had offered, is told. */
export async function withdrawSwapRequest(db: SwapDbLike, input: { requestId: string; volunteerId: string; now?: Date }): Promise<SwapResult> {
  const now = input.now ?? new Date()
  let outboxIds: string[] = []
  const result = await runSwapTransaction(asDb(db), async (tx): Promise<SwapResult> => {
    const locked = await lockForStep(tx, input.requestId)
    if (!locked || locked.req.volunteerId !== input.volunteerId) return notFound()
    const { req, event } = locked
    if (!(SWAP_LIVE_STATUSES as readonly string[]).includes(req.status)) return stateError(req.status)
    await tx.shiftSwapRequest.update({ where: { id: req.id }, data: { status: "withdrawn", endedAt: now } })
    await tx.eventLog.create({
      data: {
        eventId: req.eventId, ...actorFields({ type: "volunteer", id: input.volunteerId }),
        action: "swap.withdrawn", entityType: "ShiftSwap", entityId: req.id,
        changes: { swapStatus: { from: req.status, to: "withdrawn" } },
      },
    })
    const theirs = await loadRegistration(tx, req.counterRegistrationId)
    outboxIds = await queue(tx, event, [theirs && theirs.volunteerId === req.counterVolunteerId ? endedPayload(event, req, theirs, "withdrawn", null) : null])
    return { ok: true, requestId: req.id, status: "withdrawn" }
  })
  deliver(outboxIds)
  return result
}

export type SwapEndScope = { registrationIds?: string[]; shiftIds?: string[]; eventId?: string; volunteerIds?: string[] }

/**
 * Ends the live requests touched by a change made elsewhere (#1174 E09, E13, E18, E19): a
 * cancellation, a material edit of a shift, an erasure, a link revocation or the option switched
 * off, inside that change's transaction (after its own locks: requests come last in the order).
 * `option_off` ends them as cancelled by the organisation, anything else as impossible; the people
 * are told by email (outbox). Returns the outbox ids to deliver after the commit.
 */
export async function endSwapRequests(tx: Tx, scope: SwapEndScope, reason: Exclude<SwapEndReason, "deadline" | "organiser">, actor: LogActor, now: Date = new Date()): Promise<string[]> {
  const or: Prisma.ShiftSwapRequestWhereInput[] = []
  if (scope.registrationIds?.length) or.push({ registrationId: { in: scope.registrationIds } }, { counterRegistrationId: { in: scope.registrationIds } })
  if (scope.shiftIds?.length) or.push({ shiftId: { in: scope.shiftIds } }, { counterShiftId: { in: scope.shiftIds } })
  if (scope.eventId) or.push({ eventId: scope.eventId })
  if (scope.volunteerIds?.length) or.push({ volunteerId: { in: scope.volunteerIds } }, { counterVolunteerId: { in: scope.volunteerIds } })
  if (or.length === 0) return []
  const rows = await tx.shiftSwapRequest.findMany({ where: { status: { in: [...SWAP_LIVE_STATUSES] }, OR: or }, select: { id: true }, orderBy: { id: "asc" } })
  const ids: string[] = []
  for (const { id } of rows) {
    const req = await lockRequest(tx, id)
    if (!req || !(SWAP_LIVE_STATUSES as readonly string[]).includes(req.status)) continue
    const event = await loadEvent(tx, req.eventId)
    if (!event) continue
    ids.push(...await endRequest(tx, req, event, reason === "option_off" ? "cancelled" : "impossible", reason, actor, now))
  }
  return ids
}

/** The reasons a change made elsewhere ends a request with. */
export type SwapHookReason = Exclude<SwapEndReason, "deadline" | "organiser">

/**
 * Inside a mutation's own transaction (Codex, PR 2 of #1174): ends the requests it invalidates, in
 * the same commit, and schedules their emails after the response (rows of a rolled-back
 * transaction are simply never found by the delivery). Throws like any statement of the
 * transaction. `tx` is the global client's or an organisation's transaction client.
 */
export async function endSwapsIn(tx: unknown, scope: SwapEndScope, reason: SwapHookReason, actor: LogActor, now: Date = new Date()): Promise<void> {
  deliver(await endSwapRequests(tx as Tx, scope, reason, actor, now))
}

/**
 * For a change written outside a transaction (one conditional update): the same, right after it,
 * never failing the change itself. The hourly sweep catches up on anything missed.
 */
export async function endSwapsAfter(db: unknown, scope: SwapEndScope, reason: SwapHookReason, actor: LogActor, now: Date = new Date()): Promise<void> {
  try {
    await endSwapsIn(db, scope, reason, actor, now)
  } catch (e) {
    reportError("swap.end")(e)
  }
}

/**
 * A poste moved to another sector, or its sector archived (#1175 A07): inside that change's
 * transaction, after the shifts' `sectorId` was written. Every live request with an offer that
 * touches these shifts is checked again with the new sectors; a pair no longer compatible ends as
 * impossible (« devenu impossible »), the people told. An open request without an offer stays: its
 * own poste did not change, and who may answer it is read again on every page. Request locks only,
 * the last in the lock order.
 */
export async function recomputeSwapsIn(tx: unknown, scope: { shiftIds: string[] }, actor: LogActor, now: Date = new Date()): Promise<void> {
  const db = tx as Tx
  if (scope.shiftIds.length === 0) return
  const rows = await db.shiftSwapRequest.findMany({
    where: { status: { in: [...SWAP_COUNTER_LIVE_STATUSES] }, OR: [{ shiftId: { in: scope.shiftIds } }, { counterShiftId: { in: scope.shiftIds } }] },
    select: { id: true },
    orderBy: { id: "asc" },
  })
  const ids: string[] = []
  for (const { id } of rows) {
    const req = await lockRequest(db, id)
    if (!req || !(SWAP_COUNTER_LIVE_STATUSES as readonly string[]).includes(req.status)) continue
    const [event, mine, theirs] = await Promise.all([loadEvent(db, req.eventId), loadRegistration(db, req.registrationId), loadRegistration(db, req.counterRegistrationId)])
    if (!event || !mine || !theirs) continue
    const hidden = assignedOnlyRoles(await db.shift.findMany({ where: { eventId: event.id, status: { not: "cancelled" }, assignedOnly: true }, select: { roleName: true, assignedOnly: true } }))
    const check = swapCompatibility(asSwapRegistration(mine), asSwapRegistration(theirs), { assignedOnlyRoles: hidden })
    if (check.ok) continue
    ids.push(...await endRequest(db, req, event, "impossible", "sector_changed", actor, now))
  }
  deliver(ids)
}

/**
 * The hourly sweep: every live request past its deadline (its expiry, or a given-away shift's
 * self-cancellation deadline) ends as expired, and the people are told. Request locks only.
 */
export async function expireSwapRequests(now: Date = new Date(), db: SwapDbLike = prisma): Promise<number> {
  const live = await prisma.shiftSwapRequest.findMany({ where: { status: { in: [...SWAP_LIVE_STATUSES] } }, select: { id: true }, orderBy: { id: "asc" } })
  let expired = 0
  for (const { id } of live) {
    const outcome = await runSwapTransaction(asDb(db), async (tx) => {
      const req = await lockRequest(tx, id)
      if (!req || !(SWAP_LIVE_STATUSES as readonly string[]).includes(req.status)) return null
      const event = await loadEvent(tx, req.eventId)
      if (!event) return null
      const shifts = await tx.shift.findMany({ where: { id: { in: [req.shiftId, ...(req.counterShiftId ? [req.counterShiftId] : [])] } }, select: { date: true, startTime: true } })
      const deadline = swapDeadline({ expiresAt: req.expiresAt, given: shifts, setting: event, timeZone: orgTimeZone(event.organization) })
      if (beforeSwapDeadline(now, deadline)) return null
      return endRequest(tx, req, event, "expired", "deadline", { type: "system" }, now)
    })
    if (outcome) {
      expired++
      deliver(outcome)
    }
  }
  return expired
}
