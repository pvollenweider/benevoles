// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash, randomUUID } from "node:crypto"
import { availabilityAckKey, shiftFit, shiftInterval, usesAvailability, type AnswerForFit } from "./availability-assist"
import { logAvailabilityAcks, readAnswerForFit, readAnswersForFit, readAvailabilityGate } from "./availability-assist-data"
import { shiftStartsAt } from "./cancel-deadline"
import {
  draftAvailabilityStamp, draftShiftTerms, judgeDraftBatch, publicationRefusalText, selectionCanonical,
  DRAFTS_CHANGED_TEXT, MAX_EVENT_DRAFTS, MAX_PUBLISH_DRAFTS, PUBLICATION_KEY_REUSED_TEXT,
  type BatchHeld, type BatchPerson, type BatchShift, type DraftProblem,
} from "./draft-assignments"
import type { LogActor } from "./event-log"
import { manualAddNotice, manualAddNoticeLog } from "./manual-add-notice"
import { queueAddedByOrganizer } from "./notifications/added-by-organizer"
import type { OrgScopedPrisma } from "./prisma-org"
import { LIVE_STATUSES, OCCUPYING_STATUSES, lockShifts, type Tx } from "./registration-capacity"
import { reservedRoles } from "./role-reservation"
import { roleLimits } from "./role-limit"
import { orgTimeZone } from "./time-zone"
import { registrationToken } from "./token-vault"
import { generateToken } from "./utils"
import { checkDutyChange, lockVolunteerRows, lockWorkloadShared, readWorkloadGate, workloadRefusalBody } from "./workload-guard"

/**
 * Draft assignments (#1146, lot C), server only: writing drafts and publishing them. The rules are
 * in src/lib/draft-assignments.ts. Every function takes the organisation's scoped client and checks
 * each id it is given (event, shift, person, draft) against the event, since the client scopes the
 * event only.
 *
 * Locks, in the global order of the workload protection (src/lib/workload-guard.ts): the event's
 * shared workload lock (publication only, the step that creates commitments), the event row FOR
 * SHARE (publication), the shifts ORDER BY id, the volunteers ORDER BY id, then the draft rows.
 * A draft is written under its shift's and its person's locks, so it never interleaves with a
 * publication or an answer saved meanwhile (saveAvailabilityAnswers: event FOR SHARE, then the
 * person FOR UPDATE, and nothing after).
 */

type Db = OrgScopedPrisma

/** What the routes and the publication summary show of a draft. */
export type DraftRow = {
  id: string
  shiftId: string
  volunteerId: string
  source: string
  revision: number
  status: string
  ackKey: string | null
  /** Locked (#1172): a new proposal never replaces it. */
  locked: boolean
}

const DRAFT_SELECT = { id: true, eventId: true, shiftId: true, volunteerId: true, source: true, revision: true, status: true, ackKey: true, shiftTerms: true, availabilityStamp: true, locked: true } as const

const SHIFT_SELECT = {
  id: true, eventId: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true, capacity: true, maxPerVolunteer: true,
  overlapAllowed: true, assignedOnly: true, requiresApproval: true, minAge: true, reservedTags: true, locationDetails: true, latitude: true, longitude: true,
  sectorId: true, mealOnTheGo: true, placeId: true,
} as const

type ShiftRow = Omit<BatchShift, "occupied" | "date"> & { date: Date; mealOnTheGo: boolean; placeId: string | null }

export type DraftResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; error: string; code?: string }

const fail = (status: 400 | 404 | 409, error: string, code?: string) => ({ ok: false as const, status, error, ...(code ? { code } : {}) })

const NOT_FOUND = "Événement, créneau ou personne introuvable."
const DRAFT_GONE = "Ce brouillon a changé ou n'existe plus : rechargez la page."
const STALE_ACK = "Les disponibilités de cette personne ou les horaires du créneau ont changé : relisez-les avant de confirmer."

/** The draft's acknowledgement, judged now: the key the organiser must send, if any. */
function currentAck(p: { eventId: string; volunteerId: string; shift: { id: string; date: Date; startTime: string; endTime: string }; answer: AnswerForFit | null; dates: readonly string[]; timeZone: string }): string | null {
  const interval = shiftInterval(p.shift, p.timeZone)
  const fit = shiftFit(interval, p.answer, p.dates, p.timeZone)
  if (!fit.needsAck || !p.answer) return null
  return availabilityAckKey({ eventId: p.eventId, volunteerId: p.volunteerId, shiftId: p.shift.id, interval, requestId: p.answer.requestId, revision: p.answer.revision, timeZone: p.timeZone })
}

/** The acknowledgement to store: none needed, the key sent if it is the current one, or a refusal. */
function ackToStore(needed: string | null, sent: string | null | undefined): { ok: true; key: string | null } | { ok: false } {
  if (!needed) return { ok: true, key: null }
  if (!sent) return { ok: true, key: null }
  return sent === needed ? { ok: true, key: needed } : { ok: false }
}

/** The event, when it is this organisation's and uses dated availability; its zone and dates. */
async function eventGate(tx: Tx, eventId: string) {
  const event = await tx.event.findFirst({ where: { id: eventId }, select: { id: true, organizationId: true, publicStatus: true, availabilityEnabled: true, availabilityAdoptedAt: true } })
  if (!event || !usesAvailability(event)) return null
  const gate = await readAvailabilityGate(tx, eventId)
  return gate.inUse ? { event, gate } : null
}

// ── Writing drafts ────────────────────────────────────────────────────────────────────────────

export type CreateDraftInput = {
  eventId: string
  shiftId: string
  volunteerId: string
  actorId: string | null
  source?: "manual" | "proposal"
  proposalRunId?: string | null
  note?: string | null
  /** The acknowledgement the organiser ticked (outside declared availability), as lot B's key. */
  ackKey?: string | null
  now?: Date
}

/**
 * Adds a draft: this person on this shift, nothing else (no place held, no email). Refused when the
 * shift is cancelled, the person is not an active member, already holds a live registration or a
 * pending draft on it. Anything else (availability, overlaps, limits, workload) is allowed here and
 * shown as a finding; publication refuses what still breaks a rule.
 */
export async function createDraft(db: Db, input: CreateDraftInput): Promise<DraftResult<DraftRow>> {
  const now = input.now ?? new Date()
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const found = await eventGate(tx, input.eventId)
    if (!found) return fail(404, NOT_FOUND)
    if (found.event.publicStatus === "archived") return fail(409, "Cet événement est archivé.")
    const [shiftBefore, person] = await Promise.all([
      tx.shift.findFirst({ where: { id: input.shiftId, eventId: input.eventId }, select: { id: true } }),
      tx.volunteer.findFirst({ where: { id: input.volunteerId }, select: { id: true } }),
    ])
    if (!shiftBefore || !person) return fail(404, NOT_FOUND)
    await lockShifts(tx, [input.shiftId])
    await lockVolunteerRows(tx, [input.volunteerId])
    const shift = await tx.shift.findFirst({ where: { id: input.shiftId, eventId: input.eventId }, select: SHIFT_SELECT }) as ShiftRow | null
    const member = await tx.volunteer.findFirst({ where: { id: input.volunteerId }, select: { active: true, erasedAt: true, mergedIntoId: true, organizationId: true } })
    if (!shift || !member) return fail(404, NOT_FOUND)
    if (shift.status === "cancelled") return fail(409, "Ce créneau est annulé.")
    if (!member.active || member.erasedAt || member.mergedIntoId || member.organizationId !== found.event.organizationId) return fail(409, "Cette personne n'est plus membre actif de l'organisation.")
    const live = await tx.registration.findFirst({ where: { shiftId: shift.id, volunteerId: input.volunteerId, status: { in: [...LIVE_STATUSES] } }, select: { id: true } })
    if (live) return fail(409, "Cette personne est déjà inscrite sur ce créneau.", "already_on_shift")
    const pending = await tx.draftAssignment.findFirst({ where: { eventId: input.eventId, shiftId: shift.id, volunteerId: input.volunteerId, status: "draft" }, select: { id: true } })
    if (pending) return fail(409, "Cette personne a déjà une affectation en brouillon sur ce créneau.", "draft_exists")
    const count = await tx.draftAssignment.count({ where: { eventId: input.eventId, status: "draft" } })
    if (count >= MAX_EVENT_DRAFTS) return fail(409, `Au plus ${MAX_EVENT_DRAFTS} affectations en brouillon par événement : publiez ou retirez-en d'abord.`)

    const answer = await readAnswerForFit(tx, input.eventId, input.volunteerId)
    const ack = ackToStore(currentAck({ eventId: input.eventId, volunteerId: input.volunteerId, shift, answer, dates: found.gate.dates, timeZone: found.gate.timeZone }), input.ackKey)
    if (!ack.ok) return fail(409, STALE_ACK, "availability")
    const row = await tx.draftAssignment.create({
      data: {
        eventId: input.eventId, shiftId: shift.id, volunteerId: input.volunteerId,
        source: input.source ?? "manual", proposalRunId: input.proposalRunId ?? null, note: input.note?.trim() || null,
        createdById: input.actorId, shiftTerms: draftShiftTerms(shift), availabilityStamp: draftAvailabilityStamp(answer, shift, found.gate.timeZone),
        reviewedAt: now, reviewedById: input.actorId,
        ...(ack.key ? { ackKey: ack.key, acknowledgedAt: now, acknowledgedById: input.actorId } : {}),
      },
      select: DRAFT_SELECT,
    })
    return { ok: true as const, value: row }
  })
}

/** Locks and re-reads one pending draft at the revision the organiser saw, or says why not. */
async function lockDraft(tx: Tx, eventId: string, draftId: string, revision: number) {
  const before = await tx.draftAssignment.findFirst({ where: { id: draftId, eventId }, select: { shiftId: true, volunteerId: true } })
  if (!before) return null
  await lockShifts(tx, [before.shiftId])
  await lockVolunteerRows(tx, [before.volunteerId])
  await tx.$queryRaw`SELECT id FROM "DraftAssignment" WHERE id = ${draftId} FOR UPDATE`
  const draft = await tx.draftAssignment.findFirst({ where: { id: draftId, eventId }, select: DRAFT_SELECT })
  if (!draft || draft.status !== "draft" || draft.revision !== revision || draft.volunteerId !== before.volunteerId) return null
  return draft
}

/**
 * Reviews a draft again: its snapshot becomes the shift and the answer as they are now (the draft is
 * no longer « à revoir »), with the acknowledgement the organiser ticks now, if one is needed.
 */
export async function reviewDraft(db: Db, input: { eventId: string; draftId: string; revision: number; ackKey?: string | null; actorId: string | null; now?: Date }): Promise<DraftResult<DraftRow>> {
  const now = input.now ?? new Date()
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const found = await eventGate(tx, input.eventId)
    if (!found) return fail(404, NOT_FOUND)
    const draft = await lockDraft(tx, input.eventId, input.draftId, input.revision)
    if (!draft) return fail(409, DRAFT_GONE, "drafts_changed")
    const shift = await tx.shift.findFirst({ where: { id: draft.shiftId, eventId: input.eventId }, select: SHIFT_SELECT }) as ShiftRow | null
    if (!shift || shift.status === "cancelled") return fail(409, "Ce créneau est annulé : retirez ce brouillon.")
    const answer = await readAnswerForFit(tx, input.eventId, draft.volunteerId)
    const ack = ackToStore(currentAck({ eventId: input.eventId, volunteerId: draft.volunteerId, shift, answer, dates: found.gate.dates, timeZone: found.gate.timeZone }), input.ackKey)
    if (!ack.ok) return fail(409, STALE_ACK, "availability")
    await tx.draftAssignment.updateMany({
      where: { id: draft.id, eventId: input.eventId },
      data: {
        shiftTerms: draftShiftTerms(shift), availabilityStamp: draftAvailabilityStamp(answer, shift, found.gate.timeZone), reviewedAt: now, reviewedById: input.actorId,
        ackKey: ack.key, acknowledgedAt: ack.key ? now : null, acknowledgedById: ack.key ? input.actorId : null,
        // A generated draft the organiser reviewed is theirs now: a new proposal never replaces it (#1172).
        ...(draft.source === "proposal" ? { locked: true } : {}),
        revision: { increment: 1 },
      },
    })
    const row = await tx.draftAssignment.findFirst({ where: { id: draft.id, eventId: input.eventId }, select: DRAFT_SELECT })
    return { ok: true as const, value: row! }
  })
}

/**
 * Locks or unlocks a draft (#1172): a locked draft is kept by every new proposal, as an input that is
 * never moved. Bound to the revision the organiser saw; nothing else changes.
 */
export async function setDraftLock(db: Db, input: { eventId: string; draftId: string; revision: number; locked: boolean }): Promise<DraftResult<DraftRow>> {
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const event = await tx.event.findFirst({ where: { id: input.eventId }, select: { id: true } })
    if (!event) return fail(404, NOT_FOUND)
    const draft = await lockDraft(tx, input.eventId, input.draftId, input.revision)
    if (!draft) return fail(409, DRAFT_GONE, "drafts_changed")
    await tx.draftAssignment.updateMany({ where: { id: draft.id, eventId: input.eventId }, data: { locked: input.locked, revision: { increment: 1 } } })
    const row = await tx.draftAssignment.findFirst({ where: { id: draft.id, eventId: input.eventId }, select: DRAFT_SELECT })
    return { ok: true as const, value: row! }
  })
}

/** Withdraws a draft (kept as « discarded »): nothing was ever published, nobody is told. */
export async function discardDraft(db: Db, input: { eventId: string; draftId: string; revision: number; now?: Date }): Promise<DraftResult<{ id: string }>> {
  const now = input.now ?? new Date()
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const event = await tx.event.findFirst({ where: { id: input.eventId }, select: { id: true } })
    if (!event) return fail(404, NOT_FOUND)
    const draft = await lockDraft(tx, input.eventId, input.draftId, input.revision)
    if (!draft) return fail(409, DRAFT_GONE, "drafts_changed")
    await tx.draftAssignment.updateMany({ where: { id: draft.id, eventId: input.eventId }, data: { status: "discarded", discardedAt: now, revision: { increment: 1 } } })
    return { ok: true as const, value: { id: draft.id } }
  })
}

// ── Publication ───────────────────────────────────────────────────────────────────────────────

export type PublishInput = {
  eventId: string
  /** The drafts selected, at the revisions the organiser saw. */
  selection: { id: string; revision: number }[]
  /** From the organiser's page, one per click on « Publier »: a retry returns the first result. */
  idempotencyKey: string
  actor: LogActor
  /** The signed-in organiser: placing oneself sends no email (manualAddNotice), their name signs the others. */
  organizer: { email: string | null; name: string | null }
  now?: Date
}

export type PublishOutcome = { publicationId: string; replay: boolean; drafts: { draftId: string; registrationId: string }[]; people: number }

export type PublishResult =
  | { ok: true; value: PublishOutcome }
  | { ok: false; status: 400 | 404 | 409; error: string; code: "drafts_changed" | "key_reused" | "refused" | "not_found"; problems?: DraftProblem[] }

/** Raised inside the transaction to roll the whole publication back, its claim included. */
class PublicationRollback extends Error {
  constructor(readonly result: Extract<PublishResult, { ok: false }>) {
    super("Draft publication refused")
  }
}

const requestHash = (selection: PublishInput["selection"]) => createHash("sha256").update(selectionCanonical(selection)).digest("hex")

type PublicationRow = { id: string; requestHash: string; personCount: number; result: unknown }

function storedOutcome(row: PublicationRow): PublishOutcome {
  const drafts = ((row.result as { drafts?: { draftId: string; registrationId: string }[] } | null)?.drafts ?? [])
  return { publicationId: row.id, replay: true, drafts, people: row.personCount }
}

/**
 * Publishes the selected drafts, all or nothing, in one transaction (Codex, lot C): each becomes an
 * active registration (`source: "admin_draft"`, no charter acceptance invented), with the
 * acknowledgements' evidence, the event log and one grouped email per person (the organiser's
 * placement email, #916) written in the same transaction. Every rule is checked again under the
 * locks on the rows as they are now, each person's batch judged as a whole by the workload
 * protection. A refusal changes nothing and lists every problem. The same `idempotencyKey` again
 * returns the first result, never a second publication.
 */
export async function publishDrafts(db: Db, input: PublishInput): Promise<PublishResult> {
  const now = input.now ?? new Date()
  const ids = [...new Set(input.selection.map((s) => s.id))]
  if (ids.length === 0) return { ok: false, status: 400, error: "Choisissez au moins une affectation à publier.", code: "refused" }
  if (ids.length !== input.selection.length) return { ok: false, status: 400, error: "Une affectation figure deux fois dans la sélection.", code: "refused" }
  if (ids.length > MAX_PUBLISH_DRAFTS) return { ok: false, status: 400, error: `Au plus ${MAX_PUBLISH_DRAFTS} affectations par publication.`, code: "refused" }
  const hash = requestHash(input.selection)
  const wanted = new Map(input.selection.map((s) => [s.id, s.revision]))
  const { eventId } = input

  try {
    return await db.$transaction(async (raw) => {
      const tx = raw as unknown as Tx
      // 1. The workload protection's shared lock, first statement (src/lib/workload-guard.ts).
      await lockWorkloadShared(tx, eventId)
      // 2. The event, this organisation's (the scoped read), then its row FOR SHARE: its state and
      //    settings hold until the commit; a write of them waits.
      const scoped = await tx.event.findFirst({ where: { id: eventId }, select: { id: true } })
      if (!scoped) throw new PublicationRollback({ ok: false, status: 404, error: NOT_FOUND, code: "not_found" })
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR SHARE`

      // 3. The claim: a second request with the same key waits here for the first one's commit,
      //    then finds its row; a rolled-back first one leaves the key free.
      const publicationId = randomUUID()
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "DraftPublication" ("id", "eventId", "idempotencyKey", "requestHash", "actorId", "createdAt")
        VALUES (${publicationId}, ${eventId}, ${input.idempotencyKey}, ${hash}, ${"id" in input.actor ? input.actor.id ?? null : null}, ${now})
        ON CONFLICT ("eventId", "idempotencyKey") DO NOTHING RETURNING "id"`
      if (claimed.length === 0) {
        const existing = await tx.draftPublication.findFirst({ where: { eventId, idempotencyKey: input.idempotencyKey }, select: { id: true, requestHash: true, personCount: true, result: true } })
        if (!existing || existing.requestHash !== hash) throw new PublicationRollback({ ok: false, status: 409, error: PUBLICATION_KEY_REUSED_TEXT, code: "key_reused" })
        return { ok: true as const, value: storedOutcome(existing) }
      }

      // 4-6. The shifts, the people, then the drafts, each set ORDER BY id; then the drafts again.
      const changed = () => new PublicationRollback({ ok: false, status: 409, error: DRAFTS_CHANGED_TEXT, code: "drafts_changed" })
      const before = await tx.draftAssignment.findMany({ where: { id: { in: ids }, eventId }, select: { id: true, shiftId: true, volunteerId: true } })
      if (before.length !== ids.length) throw changed()
      const shiftIds = [...new Set(before.map((d) => d.shiftId))].sort()
      const volunteerIds = [...new Set(before.map((d) => d.volunteerId))].sort()
      await lockShifts(tx, shiftIds)
      await lockVolunteerRows(tx, volunteerIds)
      await tx.$queryRaw`SELECT id FROM "DraftAssignment" WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`
      const drafts = await tx.draftAssignment.findMany({ where: { id: { in: ids }, eventId }, select: DRAFT_SELECT })
      const lockedPeople = new Set(volunteerIds)
      if (drafts.length !== ids.length || drafts.some((d) => d.status !== "draft" || d.revision !== wanted.get(d.id) || !lockedPeople.has(d.volunteerId) || !shiftIds.includes(d.shiftId))) throw changed()

      // 7. Everything the rules read, as it is now.
      const event = await tx.event.findFirst({
        where: { id: eventId },
        select: { id: true, title: true, organizationId: true, publicStatus: true, availabilityEnabled: true, availabilityAdoptedAt: true, organization: { select: { name: true, slug: true, timeZone: true } } },
      })
      if (!event) throw new PublicationRollback({ ok: false, status: 404, error: NOT_FOUND, code: "not_found" })
      const refused = (problems: DraftProblem[]) => new PublicationRollback({ ok: false, status: 409, error: publicationRefusalText(problems), code: "refused", problems })
      if (event.publicStatus === "archived") throw refused([{ code: "event_archived", message: "Cet événement est archivé." }])
      const availability = await readAvailabilityGate(tx, eventId)
      if (!usesAvailability(event) || !availability.inUse) throw refused([{ code: "not_in_use", message: "Cet événement ne recueille pas les disponibilités." }])
      const timeZone = orgTimeZone(event.organization)

      const shiftRows = await tx.shift.findMany({ where: { id: { in: shiftIds }, eventId }, select: SHIFT_SELECT }) as ShiftRow[]
      const occupied = await tx.registration.groupBy({ by: ["shiftId"], where: { shiftId: { in: shiftIds }, status: { in: [...OCCUPYING_STATUSES] } }, _count: { _all: true } })
      const occupiedOf = new Map(occupied.map((o) => [o.shiftId, o._count._all]))
      const shifts = new Map<string, ShiftRow & { occupied: number }>(shiftRows.map((s) => [s.id, { ...s, occupied: occupiedOf.get(s.id) ?? 0 }]))
      // Role-level rules (#466, #470) come from every live shift of the event's roles concerned.
      const roleRows = await tx.shift.findMany({ where: { eventId, status: { not: "cancelled" }, roleName: { in: [...new Set(shiftRows.map((s) => s.roleName))] } }, select: { roleName: true, reservedTags: true, maxPerVolunteer: true } })

      const people = await tx.volunteer.findMany({ where: { id: { in: volunteerIds } }, select: { id: true, firstName: true, lastName: true, email: true, organizationId: true, active: true, erasedAt: true, mergedIntoId: true, birthDate: true, tags: true } })
      const held = await tx.registration.findMany({ where: { eventId, volunteerId: { in: volunteerIds }, status: { in: [...LIVE_STATUSES] } }, select: { id: true, volunteerId: true, status: true, shift: { select: SHIFT_SELECT } } })
      const answers = await readAnswersForFit(tx, eventId, volunteerIds)
      const heldOf = new Map<string, BatchHeld[]>()
      for (const h of held as unknown as { id: string; volunteerId: string; status: string; shift: ShiftRow }[]) heldOf.set(h.volunteerId, [...(heldOf.get(h.volunteerId) ?? []), { id: h.id, status: h.status, shift: { ...h.shift, occupied: 0 } }])
      const personMap = new Map<string, BatchPerson>(people.map((p) => [p.id, { ...p, held: heldOf.get(p.id) ?? [], answer: answers.get(p.id) ?? null }]))

      const verdict = judgeDraftBatch({
        eventId, organizationId: event.organizationId, timeZone, availability: { timeZone: availability.timeZone, dates: availability.dates }, now,
        drafts, shifts, people: personMap, reserved: reservedRoles(roleRows), limits: roleLimits(roleRows),
      })
      const problems = [...verdict.problems]

      // 8. The workload protection (#1171): each person's whole batch at once, its own evaluator.
      const gate = await readWorkloadGate(tx, eventId)
      for (const volunteerId of volunteerIds) {
        const usable = verdict.usable.get(volunteerId)
        if (!usable || usable.length === 0) continue
        const add = usable.map(({ shift }) => {
          const s = shifts.get(shift.id)!
          return { id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, mealOnTheGo: s.mealOnTheGo, placeId: s.placeId }
        })
        const workload = await checkDutyChange(tx, gate, eventId, volunteerId, { add })
        if (!workload.ok) {
          const p = personMap.get(volunteerId)!
          const body = workloadRefusalBody(workload, `${`${p.firstName} ${p.lastName}`.trim()} : avec ces affectations, son programme ne respecterait plus les pauses et limites de charge de cet événement.`)
          problems.push({ code: "workload", volunteerId, message: body.error, details: body.workload })
        }
      }
      if (problems.length > 0) throw refused(problems)

      // 9-10. The registrations, in time order, then everything that goes with them.
      const ordered = [...drafts].sort((a, b) => {
        const x = shifts.get(a.shiftId)!, y = shifts.get(b.shiftId)!
        return x.date.getTime() - y.date.getTime() || x.startTime.localeCompare(y.startTime) || (a.volunteerId < b.volunteerId ? -1 : a.volunteerId > b.volunteerId ? 1 : 0) || (a.id < b.id ? -1 : 1)
      })
      const actorId = "id" in input.actor ? input.actor.id ?? null : null
      const publicationLog = await tx.eventLog.create({
        data: {
          eventId, actorType: input.actor.type, actorId,
          action: "drafts.published", entityType: "DraftPublication", entityId: publicationId,
          changes: { drafts: { from: null, to: ordered.length }, people: { from: null, to: volunteerIds.length } },
        },
        select: { id: true },
      })
      const out: { draftId: string; registrationId: string }[] = []
      const registrationOf = new Map<string, string>()
      for (const d of ordered) {
        const shift = shifts.get(d.shiftId)!
        const person = personMap.get(d.volunteerId)!
        const registration = await tx.registration.create({
          data: { eventId, shiftId: d.shiftId, volunteerId: d.volunteerId, status: "active", source: "admin_draft", ...registrationToken.data(generateToken()) },
          select: { id: true },
        })
        await tx.draftAssignment.updateMany({ where: { id: d.id, eventId }, data: { status: "published", publicationId, registrationId: registration.id, revision: { increment: 1 } } })
        const notice = manualAddNotice({ email: (people.find((p) => p.id === d.volunteerId)?.email) ?? null, organizerEmail: input.organizer.email, shiftStart: shiftStartsAt(shift, timeZone), now })
        if (notice.send) {
          // Grouped per person and event (#916): one email with every mission published for them.
          await queueAddedByOrganizer(tx, {
            eventId, volunteerId: d.volunteerId, registrationId: registration.id, organizationId: event.organizationId,
            recipient: { email: notice.email, name: `${person.firstName} ${person.lastName}`.trim() },
            data: {
              volunteerName: `${person.firstName} ${person.lastName}`.trim(), eventTitle: event.title, orgSlug: event.organization.slug,
              organizationName: event.organization.name, organizerName: input.organizer.name?.trim() || null,
            },
            now,
          })
        }
        await tx.eventLog.create({
          data: {
            eventId, actorType: input.actor.type, actorId,
            action: "registration.created", entityType: "Registration", entityId: registration.id,
            changes: { shiftId: { from: null, to: d.shiftId }, source: { from: null, to: "admin_draft" }, confirmationEmail: { from: null, to: manualAddNoticeLog(notice) } },
            causedByLogId: publicationLog.id,
          },
        })
        out.push({ draftId: d.id, registrationId: registration.id })
        registrationOf.set(`${d.volunteerId}|${d.shiftId}`, registration.id)
      }
      // The acknowledgements' evidence, committed with the registrations (#1146, lot B pattern).
      await logAvailabilityAcks(tx, { eventId, actor: input.actor, via: "publish", acks: verdict.acknowledged, registrationOf: (a) => registrationOf.get(`${a.volunteerId}|${a.shiftId}`), causedByLogId: publicationLog.id })
      // A shift filled by the batch shows « complet », as after a manual addition.
      for (const s of shifts.values()) {
        const added = drafts.filter((d) => d.shiftId === s.id).length
        if (s.status === "open" && s.occupied + added >= s.capacity) await tx.shift.updateMany({ where: { id: s.id, eventId }, data: { status: "full" } })
      }
      await tx.draftPublication.updateMany({ where: { id: publicationId, eventId }, data: { draftCount: out.length, personCount: volunteerIds.length, result: { drafts: out } } })
      return { ok: true as const, value: { publicationId, replay: false, drafts: out, people: volunteerIds.length } }
    }, { maxWait: 10_000, timeout: 60_000 })
  } catch (e) {
    if (e instanceof PublicationRollback) return e.result
    throw e
  }
}
