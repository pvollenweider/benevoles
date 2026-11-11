// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Database side of the confirmation by email of a public sign-up (#1253). The rule and the words
 * are pure (`src/lib/signup-confirmation.ts`); this module locks, decides under the locks, writes
 * the registrations and queues the usual emails.
 */

import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { registrationToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"
import { logEvent, SYSTEM_ACTOR } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { buildSignupNotifications, type CreatedRegistration, type SignupShift } from "@/lib/signup-notifications"
import { OCCUPYING_STATUSES, lockShifts } from "@/lib/registration-capacity"
import { lockVolunteerRows, lockWorkloadShared, readWorkloadGate, checkDutyChange } from "@/lib/workload-guard"
import { planPlacement } from "@/lib/registration-capacity"
import { orgTimeZone } from "@/lib/time-zone"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { cancelledState, confirmationDeadlineLabel, confirmationIdentityLines, signupConfirmationDecision, signupConfirmationPageState, type SignupConfirmationPageState } from "@/lib/signup-confirmation"
import { applySignupRosterChoice } from "@/lib/roster-consent-write"
import { isKnownMinor, signupNoticeVersion } from "@/lib/shift-roster"
import { clearShiftDeclines } from "@/lib/shift-decline-clear"
import { answerConditionProblems, reservedAnswerConditions } from "@/lib/role-answer"

/** A random 32-byte link token, stored only as its SHA-256 hash. */
export function newSignupConfirmationToken(): string {
  return randomBytes(32).toString("base64url")
}

export function signupConfirmationTokenWhere(token: string) {
  return { tokenHash: hashToken(token) }
}

const CONFIRMATION_SELECT = {
  id: true,
  eventId: true,
  volunteerId: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  birthDate: true,
  comment: true,
  expiresAt: true,
  confirmedAt: true,
  cancelledAt: true,
  cancelReason: true,
  resultActive: true,
  resultRequested: true,
  resultWaiting: true,
  charterAcceptedHash: true,
  charterAcceptedAt: true,
  groupLinkId: true,
  source: true,
  waitlistShiftIds: true,
  answers: true,
  rosterNameVisible: true,
  rosterNoticeVersion: true,
} as const

const REGISTRATION_FOR_CONFIRMATION = {
  id: true,
  shiftId: true,
  status: true,
  waitingPosition: true,
  editTokenEnc: true,
  editTokenLegacy: true,
  shift: { select: { id: true, eventId: true, label: true, roleName: true, date: true, startTime: true, endTime: true, capacity: true, status: true, waitlistEnabled: true, requiresApproval: true, mealOnTheGo: true, placeId: true, minAge: true, assignedOnly: true, place: { select: { name: true } } } },
} as const

type ConfirmationTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** The row the page and the POST read, with its event (title, zone, lifecycle) and held places. */
export async function loadSignupConfirmation(token: string) {
  if (!token) return null
  return prisma.signupConfirmation.findUnique({
    where: signupConfirmationTokenWhere(token),
    select: {
      ...CONFIRMATION_SELECT,
      event: { select: { id: true, title: true, slug: true, publicStatus: true, organization: { select: { name: true, slug: true, timeZone: true, ...ORG_LIFECYCLE_SELECT } } } },
      registrations: { select: REGISTRATION_FOR_CONFIRMATION },
    },
  })
}

/** The shifts listed in the email: held places and waitlist intents, in chronological order. */
export async function signupConfirmationShifts(row: { waitlistShiftIds: string[]; registrations: { shiftId: string }[]; eventId: string }) {
  const ids = [...new Set([...row.waitlistShiftIds, ...row.registrations.map((r) => r.shiftId)])]
  if (ids.length === 0) return []
  return prisma.shift.findMany({
    where: { id: { in: ids }, eventId: row.eventId },
    select: { id: true, label: true, roleName: true, date: true, startTime: true, endTime: true, capacity: true, waitlistEnabled: true, requiresApproval: true, status: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })
}

export type SignupConfirmationView = {
  state: SignupConfirmationPageState
  details: {
    eventTitle: string
    eventSlug: string
    organizationName: string
    firstShifts: { label: string; roleName: string; date: Date; startTime: string; endTime: string; waitlist: boolean; requiresApproval: boolean }[]
    deadline: string | null
    identity: string[]
    deadlineLabel: string | null
    counts: { active: number; requested: number; waiting: number } | null
  } | null
}

/**
 * What the link shows, read-only. Reading it changes nothing (#1253): mail scanners open links,
 * some run the page's scripts; only the button's POST confirms.
 */
export async function signupConfirmationView(token: string, now: Date = new Date()): Promise<SignupConfirmationView> {
  const row = await loadSignupConfirmation(token)
  const state = signupConfirmationPageState(
    row,
    now,
    orgLinksOpen(row?.event.organization),
    row?.registrations.map((r) => r.status) ?? [],
    row?.waitlistShiftIds ?? [],
  )
  if (!row || !state) return { state: "invalid", details: null }
  const shifts = await signupConfirmationShifts(row)
  const byId = new Map(shifts.map((s) => [s.id, s]))
  return {
    state,
    details: {
      eventTitle: row.event.title,
      eventSlug: row.event.slug,
      organizationName: row.event.organization.name,
      firstShifts: [...new Set([...row.waitlistShiftIds, ...row.registrations.map((r) => r.shiftId)])]
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({ label: s.label, roleName: s.roleName, date: s.date, startTime: s.startTime, endTime: s.endTime, waitlist: row.waitlistShiftIds.includes(s.id), requiresApproval: s.requiresApproval })),
      // Only while it waits: once settled, the page no longer repeats personal data.
      identity: state === "pending" ? confirmationIdentityLines(row) : [],
      deadline: row.confirmedAt || row.cancelledAt ? null : row.expiresAt.toISOString(),
      deadlineLabel: row.confirmedAt || row.cancelledAt ? null : confirmationDeadlineLabel(row.expiresAt, orgTimeZone(row.event.organization)),
      counts: row.confirmedAt
        ? { active: row.resultActive ?? 0, requested: row.resultRequested ?? 0, waiting: row.resultWaiting ?? 0 }
        : null,
    },
  }
}

export type ConfirmSignupResult =
  | { ok: true; already: boolean; counts: { active: number; requested: number; waiting: number } }
  | { ok: false; reason: "invalid" | "expired" | "replaced" | "cancelled" | "gone" | "unavailable" | "reserved_answer" }

/** The counts recorded at the click, or those the registrations show now. */
function countsOf(regs: { status: string }[], row: { resultActive: number | null; resultRequested: number | null; resultWaiting: number | null }) {
  if (row.resultActive != null || row.resultRequested != null || row.resultWaiting != null) {
    return { active: row.resultActive ?? 0, requested: row.resultRequested ?? 0, waiting: row.resultWaiting ?? 0 }
  }
  return {
    active: regs.filter((r) => r.status === "active").length,
    requested: regs.filter((r) => r.status === "requested").length,
    waiting: regs.filter((r) => r.status === "waiting").length,
  }
}

/**
 * The button's POST: idempotent, inside a transaction holding the shifts' locks. Rechecks the
 * deadline, that each provisional place is still this request's, and the capacity for a shift that
 * was full with a waitlist (the rank is taken now). A repeated click returns the recorded result.
 */
export async function confirmSignupConfirmation(token: string, now: Date = new Date()): Promise<ConfirmSignupResult> {
  const row = await loadSignupConfirmation(token)
  if (!row) return { ok: false, reason: "invalid" }
  if (!orgLinksOpen(row.event.organization)) return { ok: false, reason: "unavailable" }
  const decision = signupConfirmationDecision(row, now, row.registrations.map((r) => r.status), row.waitlistShiftIds)
  if (decision === "confirmed") return { ok: true, already: true, counts: countsOf(row.registrations, row) }
  if (decision !== "pending") return { ok: false, reason: decision === "gone" ? "gone" : decision }

  const lockIds = [...new Set([...row.registrations.map((r) => r.shiftId), ...row.waitlistShiftIds])]
  let outcome: { result: ConfirmSignupResult; outboxIds: string[]; logs: { registrationId: string; from: string; to: string }[] }
  try {
    outcome = await prisma.$transaction(async (tx) => {
      await lockWorkloadShared(tx, row.eventId)
      const gate = await readWorkloadGate(tx, row.eventId)
      await lockShifts(tx, lockIds)
      await lockVolunteerRows(tx, [row.volunteerId])
      const current = await tx.signupConfirmation.findUnique({
        where: { id: row.id },
        select: {
          ...CONFIRMATION_SELECT,
          event: { select: { id: true, title: true, organizationId: true, confirmationMessage: true, cancelDeadlineDays: true, cancelDeadlineHours: true, latitude: true, longitude: true, shiftRosterEnabled: true, startDate: true, organization: { select: { slug: true, timeZone: true } } } },
          registrations: { select: REGISTRATION_FOR_CONFIRMATION },
        },
      })
      if (!current) return { result: { ok: false as const, reason: "invalid" as const }, outboxIds: [], logs: [] }
      const nowDecision = signupConfirmationDecision(current, now, current.registrations.map((r) => r.status), current.waitlistShiftIds)
      if (nowDecision === "confirmed") return { result: { ok: true as const, already: true, counts: countsOf(current.registrations, current) }, outboxIds: [], logs: [] }
      if (nowDecision !== "pending") return { result: { ok: false as const, reason: nowDecision === "gone" ? "gone" as const : nowDecision }, outboxIds: [], logs: [] }

      // Answer conditions (#962): the answers given with the request must still open every poste
      // held or joined. Refused before anything is claimed, so the request stays as it was.
      const selectedIds = [...new Set([...current.registrations.map((r) => r.shiftId), ...current.waitlistShiftIds])]
      const selectedShifts = await tx.shift.findMany({
        where: { id: { in: selectedIds }, eventId: current.eventId },
        select: { id: true, roleName: true, reservedQuestionId: true, reservedAnswers: true },
      })
      const conditions = reservedAnswerConditions(await tx.shift.findMany({
        where: { eventId: current.eventId, roleName: { in: [...new Set(selectedShifts.map((s) => s.roleName))] }, status: { not: "cancelled" } },
        select: { roleName: true, reservedQuestionId: true, reservedAnswers: true },
      }))
      const storedAnswers = new Map(Object.entries((current.answers ?? {}) as Record<string, string[]>).filter(([, v]) => Array.isArray(v)))
      if (answerConditionProblems(selectedShifts, conditions, storedAnswers).length > 0) {
        return { result: { ok: false as const, reason: "reserved_answer" as const }, outboxIds: [], logs: [] }
      }

      // One click claims the request; a second one, or the cron expiring it, finds nothing to update.
      const claimed = await tx.signupConfirmation.updateMany({
        where: { id: current.id, confirmedAt: null, cancelledAt: null, expiresAt: { gt: now } },
        data: { confirmedAt: now },
      })
      if (claimed.count === 0) {
        const after = await tx.signupConfirmation.findUnique({ where: { id: current.id }, select: CONFIRMATION_SELECT })
        if (after?.confirmedAt) return { result: { ok: true as const, already: true, counts: countsOf(current.registrations, after) }, outboxIds: [], logs: [] }
        const reason = after?.cancelledAt ? cancelledState(after.cancelReason) : "expired" as const
        return { result: { ok: false as const, reason }, outboxIds: [], logs: [] }
      }

      const timeZone = orgTimeZone(current.event.organization)
      const shifts = await tx.shift.findMany({
        where: { id: { in: lockIds }, eventId: current.eventId },
        select: { id: true, eventId: true, label: true, roleName: true, date: true, startTime: true, endTime: true, capacity: true, status: true, waitlistEnabled: true, requiresApproval: true, mealOnTheGo: true, placeId: true, minAge: true, assignedOnly: true, place: { select: { name: true } } },
      })
      const shiftById = new Map(shifts.map((s) => [s.id, s]))
      void timeZone

      const registrations: CreatedRegistration[] = []
      const tokens = new Map<string, string>()
      const logs: { registrationId: string; from: string; to: string }[] = []
      const activeShiftIds: string[] = []

      // Held places: the shift's current approval mode decides between a place and a request. The
      // conditional update keeps a place reassigned or cancelled meanwhile from being confirmed.
      for (const reg of current.registrations) {
        if (reg.status !== "unconfirmed") continue
        const shift = shiftById.get(reg.shiftId)
        if (!shift || shift.status === "cancelled") continue
        const next = shift.requiresApproval ? "requested" : "active"
        const updated = await tx.registration.updateMany({
          where: { id: reg.id, signupConfirmationId: current.id, status: "unconfirmed" },
          data: { status: next, waitingPosition: null, waitingOfferedAt: null, waitingExpiresAt: null, linkEmailedAt: new Date() },
        })
        if (updated.count === 0) continue
        tokens.set(reg.shiftId, registrationToken.reveal(reg))
        registrations.push({ id: reg.id, shiftId: reg.shiftId, status: next, waitingPosition: null })
        logs.push({ registrationId: reg.id, from: "unconfirmed", to: next })
        if (next === "active") activeShiftIds.push(reg.shiftId)
      }

      // Short waits at the request (a full shift with a waitlist): the rank is taken now, never
      // before. A place freed meanwhile becomes a place (or a request), like a normal sign-up.
      for (const shiftId of current.waitlistShiftIds) {
        const shift = shiftById.get(shiftId)
        if (!shift || shift.status === "cancelled") continue
        const occupied = await tx.registration.count({ where: { shiftId, status: { in: [...OCCUPYING_STATUSES] } } })
        const maxPos = await tx.registration.aggregate({
          where: { shiftId, status: { in: ["waiting", "offered"] } },
          _max: { waitingPosition: true },
        })
        const placement = planPlacement({
          capacity: shift.capacity,
          occupied,
          waitlistEnabled: shift.waitlistEnabled,
          maxWaitingPosition: maxPos._max.waitingPosition,
          requiresApproval: shift.requiresApproval,
        })
        if (placement.status === "full") continue
        // A freed place is a new commitment: the event's protection can still refuse it. The
        // volunteer then joins the waitlist when the shift has one, or keeps nothing.
        let next: "active" | "requested" | "waiting" = placement.status
        let nextPosition = placement.status === "waiting" ? placement.waitingPosition : null
        if (next !== "waiting" && gate.kind !== "off") {
          const verdict = await checkDutyChange(tx, gate, current.eventId, current.volunteerId, { add: [{ ...shift, placeName: shift.place?.name ?? null }] })
          if (!verdict.ok) {
            if (shift.waitlistEnabled) {
              next = "waiting"
              nextPosition = (maxPos._max.waitingPosition ?? 0) + 1
            } else continue
          }
        }
        if (next === "waiting") {
          const position = nextPosition ?? (maxPos._max.waitingPosition ?? 0) + 1
          const token = generateToken()
          const created = await tx.registration.create({
            data: {
              eventId: current.eventId,
              shiftId,
              volunteerId: current.volunteerId,
              source: current.source,
              comment: current.comment,
              phone: current.phone?.trim() || null,
              ...registrationToken.data(token),
              status: "waiting",
              waitingPosition: position,
              charterAcceptedHash: current.charterAcceptedHash,
              charterAcceptedAt: current.charterAcceptedAt,
              groupLinkId: current.groupLinkId,
              signupConfirmationId: current.id,
              linkEmailedAt: new Date(),
            },
            select: { id: true, shiftId: true, status: true, waitingPosition: true },
          })
          tokens.set(shiftId, token)
          registrations.push(created)
          logs.push({ registrationId: created.id, from: "none", to: "waiting" })
        } else if (next === "active" || next === "requested") {
          const token = generateToken()
          const created = await tx.registration.create({
            data: {
              eventId: current.eventId,
              shiftId,
              volunteerId: current.volunteerId,
              source: current.source,
              comment: current.comment,
              phone: current.phone?.trim() || null,
              ...registrationToken.data(token),
              status: next,
              waitingPosition: null,
              charterAcceptedHash: current.charterAcceptedHash,
              charterAcceptedAt: current.charterAcceptedAt,
              groupLinkId: current.groupLinkId,
              signupConfirmationId: current.id,
              linkEmailedAt: new Date(),
            },
            select: { id: true, shiftId: true, status: true, waitingPosition: true },
          })
          tokens.set(shiftId, token)
          registrations.push(created)
          logs.push({ registrationId: created.id, from: "none", to: next })
          if (next === "active") activeShiftIds.push(shiftId)
        }
      }

      // The person's profile is theirs now (the email link proved the address). Only what the form
      // carried: name, phone and birth date.
      await tx.volunteer.update({
        where: { id: current.volunteerId },
        data: {
          firstName: current.firstName,
          lastName: current.lastName,
          phone: current.phone,
          ...(current.birthDate ? { birthDate: current.birthDate } : {}),
        },
      })
      // Custom answers (#483), kept from the request.
      const answers = (current.answers ?? {}) as Record<string, string[]>
      for (const [questionId, values] of Object.entries(answers)) {
        if (!Array.isArray(values) || values.length === 0) continue
        await tx.questionAnswer.upsert({
          where: { questionId_volunteerId: { questionId, volunteerId: current.volunteerId } },
          create: { questionId, eventId: current.eventId, volunteerId: current.volunteerId, values },
          update: { values },
        })
      }
      if (activeShiftIds.length > 0) await clearShiftDeclines(tx, current.volunteerId, activeShiftIds)
      // The roster opt-in asked with the sign-up (#1068): possible now that the address is proven.
      await applySignupRosterChoice(tx, {
        eventId: current.eventId,
        volunteerId: current.volunteerId,
        requested: current.event.shiftRosterEnabled && current.rosterNameVisible,
        verified: true,
        minor: isKnownMinor(current.birthDate, current.event.startDate),
        noticeVersion: signupNoticeVersion(current.rosterNoticeVersion ?? undefined),
        now,
      })

      const counts = {
        active: registrations.filter((r) => r.status === "active").length,
        requested: registrations.filter((r) => r.status === "requested").length,
        waiting: registrations.filter((r) => r.status === "waiting").length,
      }
      await tx.signupConfirmation.update({
        where: { id: current.id },
        data: { resultActive: counts.active, resultRequested: counts.requested, resultWaiting: counts.waiting },
      })

      let outboxIds: string[] = []
      if (registrations.length > 0) {
        const signupShifts: SignupShift[] = shifts
          .filter((s) => registrations.some((r) => r.shiftId === s.id))
          .map((s) => ({
            id: s.id, label: s.label, roleName: s.roleName, date: s.date, startTime: s.startTime, endTime: s.endTime,
            mealOnTheGo: s.mealOnTheGo, placeId: s.placeId, placeName: s.place?.name ?? null,
          }))
        const payloads = await buildSignupNotifications({
          event: {
            id: current.event.id, title: current.event.title, organizationId: current.event.organizationId,
            organization: { slug: current.event.organization.slug }, confirmationMessage: current.event.confirmationMessage,
            cancelDeadlineDays: current.event.cancelDeadlineDays, cancelDeadlineHours: current.event.cancelDeadlineHours,
            latitude: current.event.latitude, longitude: current.event.longitude,
          },
          shifts: signupShifts,
          volunteer: { id: current.volunteerId, email: current.email, firstName: current.firstName, lastName: current.lastName },
          registrations,
          tokens,
        })
        outboxIds = await enqueueNotifications(payloads, tx, { organizationId: current.event.organizationId })
      }
      return { result: { ok: true as const, already: false, counts }, outboxIds, logs }
    })
  } catch (e) {
    reportError("signup_confirmation.confirm")(e)
    throw e
  }

  if (outcome.result.ok && !outcome.result.already) {
    for (const log of outcome.logs) {
      await logEvent({
        eventId: row.eventId,
        actor: { type: "volunteer", id: row.volunteerId },
        action: log.from === "none" ? "registration.waitlist_joined" : "registration.confirmed_by_email",
        entityType: "Registration",
        entityId: log.registrationId,
        changes: { status: { from: log.from === "none" ? null : log.from, to: log.to } },
      })
    }
    deliverAfterResponse(outcome.outboxIds)
  }
  return outcome.result
}

/**
 * Frees the provisional places of every pending request whose deadline passed, then promotes the
 * waitlist for each freed shift, exactly like a withdrawal (#1253). The conditional update makes it
 * safe next to a confirmation click: only one of the two wins. Called by the reminders cron.
 */
export async function expireSignupConfirmations(now: Date = new Date(), limit = 200): Promise<{ expired: number; shifts: string[] }> {
  const due = await prisma.signupConfirmation.findMany({
    where: { confirmedAt: null, cancelledAt: null, expiresAt: { lt: now } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  })
  const shifts = new Set<string>()
  let expired = 0
  for (const { id } of due) {
    const freed = await prisma.$transaction(async (tx) => {
      const row = await tx.signupConfirmation.findUnique({
        where: { id },
        select: { id: true, eventId: true, expiresAt: true, waitlistShiftIds: true, registrations: { where: { status: "unconfirmed" }, select: { id: true, shiftId: true } } },
      })
      if (!row) return null
      const lockIds = [...new Set([...row.registrations.map((r) => r.shiftId), ...row.waitlistShiftIds])]
      await lockShifts(tx, lockIds)
      const claimed = await tx.signupConfirmation.updateMany({
        where: { id, confirmedAt: null, cancelledAt: null, expiresAt: { lt: now } },
        data: { cancelledAt: now, cancelReason: "expired" },
      })
      if (claimed.count === 0) return null
      const ids = row.registrations.map((r) => r.id)
      if (ids.length > 0) {
        await tx.registration.updateMany({ where: { id: { in: ids }, status: "unconfirmed" }, data: { status: "cancelled" } })
      }
      return { eventId: row.eventId, shiftIds: row.registrations.map((r) => r.shiftId), registrationIds: ids }
    }).catch((e) => {
      reportError("signup_confirmation.expire")(e)
      return null
    })
    if (!freed) continue
    expired++
    for (const shiftId of freed.shiftIds) {
      shifts.add(shiftId)
      // A stored "full" shift is open again once the provisional place is gone.
      const [shift, occupied] = await Promise.all([
        prisma.shift.findUnique({ where: { id: shiftId }, select: { capacity: true, status: true } }),
        prisma.registration.count({ where: { shiftId, status: { in: [...OCCUPYING_STATUSES] } } }),
      ])
      if (shift?.status === "full" && occupied < shift.capacity) {
        await prisma.shift.updateMany({ where: { id: shiftId }, data: { status: "open" } }).catch(reportError("signup_confirmation.reopen"))
      }
      if (freed.registrationIds.length > 0) {
        await logEvent({
          eventId: freed.eventId,
          actor: SYSTEM_ACTOR,
          action: "registration.confirmation_expired",
          entityType: "Registration",
          entityId: freed.registrationIds[0],
          changes: { status: { from: "unconfirmed", to: "cancelled" } },
        }).catch(reportError("signup_confirmation.expire_log"))
      }
    }
  }
  return { expired, shifts: [...shifts] }
}

/** Marks a pending request replaced and frees its held places, in the caller's transaction. */
export async function replacePendingSignupConfirmation(
  tx: ConfirmationTx,
  input: { eventId: string; email: string; now: Date; reason: "replaced" | "proven" },
): Promise<{ shiftIds: string[]; confirmationId: string | null }> {
  const previous = await tx.signupConfirmation.findFirst({
    where: { eventId: input.eventId, email: input.email, confirmedAt: null, cancelledAt: null },
    select: { id: true, registrations: { where: { status: "unconfirmed" }, select: { id: true, shiftId: true } } },
  })
  if (!previous) return { shiftIds: [], confirmationId: null }
  const updated = await tx.signupConfirmation.updateMany({
    where: { id: previous.id, confirmedAt: null, cancelledAt: null },
    data: { cancelledAt: input.now, cancelReason: input.reason },
  })
  if (updated.count === 0) return { shiftIds: [], confirmationId: null }
  const ids = previous.registrations.map((r) => r.id)
  if (ids.length > 0) await tx.registration.updateMany({ where: { id: { in: ids }, status: "unconfirmed" }, data: { status: "cancelled" } })
  return { shiftIds: previous.registrations.map((r) => r.shiftId), confirmationId: previous.id }
}

/** The shift ids a pending request holds, read before the sign-up's transaction to lock them. */
export async function pendingSignupConfirmationShiftIds(eventId: string, email: string): Promise<string[]> {
  const previous = await prisma.signupConfirmation.findFirst({
    where: { eventId, email, confirmedAt: null, cancelledAt: null },
    select: { registrations: { where: { status: "unconfirmed" }, select: { shiftId: true } }, waitlistShiftIds: true },
  })
  return previous ? [...new Set([...previous.registrations.map((r) => r.shiftId), ...previous.waitlistShiftIds])] : []
}
