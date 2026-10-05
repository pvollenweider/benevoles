// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure planning for merging two member (Volunteer) records confirmed as the same person (#600).
 * No Prisma import here on purpose (src/lib modules reachable from client components must stay
 * free of it, see CLAUDE.md): given both records and their relations as plain data, plus the
 * organizer's explicit choices, this returns the preview (what differs, what moves, every
 * conflict) and the plan (the concrete rows to touch). The actual writes run in one transaction
 * in src/lib/member-merge-transaction.ts (server-only).
 *
 * The inventory below is re-derived from prisma/schema.prisma; src/lib/__tests__/member-merge-schema-guard.test.ts
 * fails when a new relation to Volunteer appears without a corresponding entry here.
 *
 * Relations handled: Registration (reassign, same-shift conflict resolved by status rank,
 * attendance wins), MemberInvite (reassign, same-event conflict resolved by "used first"),
 * QuestionAnswer (reassign, same-question conflict needs an explicit choice), PushSubscription
 * (dropped, never moved — owner decision, #600), DeliveryOutcome (reassigned only when its
 * addressHash matches the kept member's address, otherwise left on the absorbed record for the
 * retention purge to cascade-delete). SectorLeader is matched by email, not volunteerId: never
 * moved, only reported. EventLog/OrgLog ids are never rewritten (history untouched); the merge
 * mapping (Volunteer.mergedIntoId) is how old ids resolve afterwards.
 */

import { shiftsOverlap } from "./utils"

export type FieldChoice = "keep" | "absorb"

export interface VolunteerLite {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  tags: string[]
  notes: string | null
  birthDate: Date | null
  availabilityPeriods: string[]
  availabilityNote: string | null
  active: boolean
  createdAt: Date
  organizationId: string | null
  /** Set when this record was itself already absorbed into another one. */
  mergedIntoId: string | null
  /** Set once its personal data was erased (#516): never merged. */
  erasedAt?: Date | null
}

export interface ShiftMeta {
  id: string
  eventId: string
  roleName: string
  label: string
  date: Date
  startTime: string
  endTime: string
  minAge: number | null
  maxPerVolunteer: number | null
  reservedTags: string[]
}

export interface RegistrationLite {
  id: string
  eventId: string
  shiftId: string
  status: string
  checkedInAt: Date | null
}

export interface InviteLite {
  id: string
  eventId: string
  usedAt: Date | null
}

export interface AnswerLite {
  id: string
  questionId: string
  eventId: string
  values: string[]
}

export interface PushSubscriptionLite {
  id: string
  endpoint: string
}

export interface DeliveryOutcomeLite {
  id: string
  addressHash: string | null
}

export interface SectorLeaderLite {
  id: string
  eventId: string
  roleName: string
  email: string
}

export interface MemberMergeInput {
  keep: VolunteerLite
  absorb: VolunteerLite
  shifts: ShiftMeta[]
  keepRegistrations: RegistrationLite[]
  absorbRegistrations: RegistrationLite[]
  keepInvites: InviteLite[]
  absorbInvites: InviteLite[]
  keepAnswers: AnswerLite[]
  absorbAnswers: AnswerLite[]
  absorbPushSubscriptions: PushSubscriptionLite[]
  absorbDeliveryOutcomes: DeliveryOutcomeLite[]
  /** Leader entries (#186) whose email matches the absorbed record's (not moved, only reported). */
  sectorLeadersMatchingAbsorbed: SectorLeaderLite[]
  /** HMAC-SHA256 of the kept record's normalized email, if any — for the DeliveryOutcome rule. */
  keepAddressHash: string | null
}

export const MERGEABLE_FIELDS = ["firstName", "lastName", "email", "phone", "birthDate", "availabilityNote"] as const
export type MergeableField = (typeof MERGEABLE_FIELDS)[number]

export interface MemberMergeChoices {
  fields?: Partial<Record<MergeableField, FieldChoice>>
  notesMode?: "keep" | "absorb" | "concatenate"
  /** shiftId -> which registration survives live, for a same-shift conflict not resolved by rank alone. */
  registrationConflicts?: Record<string, FieldChoice>
  /** questionId -> which answer is kept, for a same-question conflict (no default: always explicit). */
  answerConflicts?: Record<string, FieldChoice>
  /** eventId -> which invite is kept, for a same-event conflict not resolved by "used first". */
  inviteConflicts?: Record<string, FieldChoice>
  /** Also email the regenerated links to the kept address (#542 mechanism, owner decision). */
  sendLinksToKeptAddress?: boolean
}

// ── Field diffs ───────────────────────────────────────────────────────────────

export interface FieldDiff {
  field: MergeableField
  keepValue: string | number | null
  absorbValue: string | number | null
  differs: boolean
  chosen: FieldChoice
}

function fieldValue(v: VolunteerLite, field: MergeableField): string | number | null {
  if (field === "birthDate") return v.birthDate ? v.birthDate.getTime() : null
  return (v[field] as string | null) ?? null
}

export function fieldDiffs(input: MemberMergeInput, choices: MemberMergeChoices): FieldDiff[] {
  return MERGEABLE_FIELDS.map((field) => {
    const keepValue = fieldValue(input.keep, field)
    const absorbValue = fieldValue(input.absorb, field)
    const differs = keepValue !== absorbValue
    const chosen = choices.fields?.[field] ?? "keep"
    return { field, keepValue, absorbValue, differs, chosen }
  })
}

/** The actual final values after applying the chosen field values, tag union and notes mode. */
export function resolvedFields(input: MemberMergeInput, choices: MemberMergeChoices): {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  birthDate: Date | null
  availabilityNote: string | null
  notes: string | null
  tags: string[]
  availabilityPeriods: string[]
} {
  const pick = <T,>(field: MergeableField, keepVal: T, absorbVal: T): T => ((choices.fields?.[field] ?? "keep") === "absorb" ? absorbVal : keepVal)
  const notesMode = choices.notesMode ?? "keep"
  const notes =
    notesMode === "concatenate"
      ? [input.keep.notes, input.absorb.notes].filter((n): n is string => !!n?.trim()).join("\n\n") || null
      : notesMode === "absorb"
        ? input.absorb.notes
        : input.keep.notes

  return {
    firstName: pick("firstName", input.keep.firstName, input.absorb.firstName),
    lastName: pick("lastName", input.keep.lastName, input.absorb.lastName),
    email: pick("email", input.keep.email, input.absorb.email),
    phone: pick("phone", input.keep.phone, input.absorb.phone),
    birthDate: pick("birthDate", input.keep.birthDate, input.absorb.birthDate),
    availabilityNote: pick("availabilityNote", input.keep.availabilityNote, input.absorb.availabilityNote),
    notes,
    tags: Array.from(new Set([...input.keep.tags, ...input.absorb.tags])),
    availabilityPeriods: Array.from(new Set([...input.keep.availabilityPeriods, ...input.absorb.availabilityPeriods])),
  }
}

// ── Conflicts ─────────────────────────────────────────────────────────────────

export type MergeConflict =
  | { kind: "same_shift"; shiftId: string; shiftLabel: string; blocking: boolean; resolvedBy: "rank" | "choice" | null }
  | { kind: "overlap"; shiftIds: [string, string]; labels: [string, string] }
  | { kind: "role_limit"; roleName: string; limit: number; count: number }
  | { kind: "min_age"; shiftId: string; shiftLabel: string; minAge: number; birthDate: Date | null }
  | { kind: "reserved_role"; shiftId: string; shiftLabel: string; reservedTags: string[]; memberTags: string[] }
  | { kind: "same_question"; questionId: string; eventId: string; blocking: boolean }
  | { kind: "same_event_invite"; eventId: string; blocking: boolean; resolvedBy: "used_first" | "choice" | null }

const LIVE_REGISTRATION_STATUSES = new Set(["active", "waiting", "offered", "requested"])

/** Rank of a live registration for "who wins a same-shift conflict": attendance beats everything. */
function registrationRank(r: RegistrationLite): number {
  const base: Record<string, number> = { active: 3, offered: 2, requested: 1, waiting: 0 }
  const rank = base[r.status] ?? -1
  return r.checkedInAt ? rank + 10 : rank
}

const shiftById = (shifts: ShiftMeta[]) => new Map(shifts.map((s) => [s.id, s]))

export function mergeConflicts(input: MemberMergeInput, choices: MemberMergeChoices): MergeConflict[] {
  const conflicts: MergeConflict[] = []
  const shifts = shiftById(input.shifts)

  // Every registration as it would be after reassignment (absorb's rows now under `keep`).
  const allLive = [...input.keepRegistrations, ...input.absorbRegistrations].filter((r) => LIVE_REGISTRATION_STATUSES.has(r.status))
  const byShift = new Map<string, RegistrationLite[]>()
  for (const r of allLive) {
    const list = byShift.get(r.shiftId) ?? []
    list.push(r)
    byShift.set(r.shiftId, list)
  }
  for (const [shiftId, rows] of byShift) {
    if (rows.length < 2) continue
    const shift = shifts.get(shiftId)
    const choice = choices.registrationConflicts?.[shiftId]
    const ranked = [...rows].sort((a, b) => registrationRank(b) - registrationRank(a))
    const tie = registrationRank(ranked[0]) === registrationRank(ranked[1])
    conflicts.push({
      kind: "same_shift",
      shiftId,
      shiftLabel: shift?.label ?? shiftId,
      blocking: false,
      resolvedBy: choice ? "choice" : tie ? null : "rank",
    })
  }

  // Overlap between a kept-record live registration's shift and an absorbed-record live
  // registration's shift (not already on the same shift, that's the case above). Informational
  // only: the organizer already placed both.
  for (const a of input.keepRegistrations.filter((r) => LIVE_REGISTRATION_STATUSES.has(r.status))) {
    const shiftA = shifts.get(a.shiftId)
    if (!shiftA) continue
    for (const b of input.absorbRegistrations.filter((r) => LIVE_REGISTRATION_STATUSES.has(r.status))) {
      if (b.shiftId === a.shiftId) continue
      const shiftB = shifts.get(b.shiftId)
      if (!shiftB) continue
      if (shiftsOverlap(shiftA, shiftB)) {
        conflicts.push({ kind: "overlap", shiftIds: [shiftA.id, shiftB.id], labels: [shiftA.label, shiftB.label] })
      }
    }
  }

  // Role limit (#466): shifts per volunteer per role, counted across the merged registrations.
  const roleCounts = new Map<string, { count: number; limit: number }>()
  for (const r of allLive) {
    const shift = shifts.get(r.shiftId)
    if (!shift || shift.maxPerVolunteer == null) continue
    const key = `${shift.eventId}:${shift.roleName}`
    const entry = roleCounts.get(key) ?? { count: 0, limit: shift.maxPerVolunteer }
    entry.count++
    roleCounts.set(key, entry)
  }
  for (const [key, entry] of roleCounts) {
    if (entry.count > entry.limit) {
      conflicts.push({ kind: "role_limit", roleName: key.split(":")[1], limit: entry.limit, count: entry.count })
    }
  }

  // Minimum age vs the kept record's (post-merge) birth date.
  const finalBirthDate = resolvedFields(input, choices).birthDate
  for (const r of allLive) {
    const shift = shifts.get(r.shiftId)
    if (!shift?.minAge) continue
    if (!finalBirthDate) {
      conflicts.push({ kind: "min_age", shiftId: shift.id, shiftLabel: shift.label, minAge: shift.minAge, birthDate: null })
      continue
    }
    const ageYears = (Date.now() - finalBirthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    if (ageYears < shift.minAge) {
      conflicts.push({ kind: "min_age", shiftId: shift.id, shiftLabel: shift.label, minAge: shift.minAge, birthDate: finalBirthDate })
    }
  }

  // Reserved roles (#470) vs the merged tag set.
  const finalTags = new Set(resolvedFields(input, choices).tags)
  for (const r of allLive) {
    const shift = shifts.get(r.shiftId)
    if (!shift || shift.reservedTags.length === 0) continue
    if (!shift.reservedTags.some((t) => finalTags.has(t))) {
      conflicts.push({ kind: "reserved_role", shiftId: shift.id, shiftLabel: shift.label, reservedTags: shift.reservedTags, memberTags: [...finalTags] })
    }
  }

  // Same question answered differently.
  const absorbAnswerByQ = new Map(input.absorbAnswers.map((a) => [a.questionId, a]))
  for (const keepAnswer of input.keepAnswers) {
    const other = absorbAnswerByQ.get(keepAnswer.questionId)
    if (!other) continue
    const same = JSON.stringify([...keepAnswer.values].sort()) === JSON.stringify([...other.values].sort())
    if (same) continue
    conflicts.push({ kind: "same_question", questionId: keepAnswer.questionId, eventId: keepAnswer.eventId, blocking: !choices.answerConflicts?.[keepAnswer.questionId] })
  }

  // Same event invitation on both sides.
  const keepInviteByEvent = new Map(input.keepInvites.map((i) => [i.eventId, i]))
  for (const absorbInvite of input.absorbInvites) {
    const keepInvite = keepInviteByEvent.get(absorbInvite.eventId)
    if (!keepInvite) continue
    const choice = choices.inviteConflicts?.[absorbInvite.eventId]
    const oneUsed = !!keepInvite.usedAt !== !!absorbInvite.usedAt
    conflicts.push({ kind: "same_event_invite", eventId: absorbInvite.eventId, blocking: !choice && !oneUsed, resolvedBy: choice ? "choice" : oneUsed ? "used_first" : null })
  }

  return conflicts
}

/** Conflicts that must be resolved (an explicit choice given) before the merge can be confirmed. */
export function blockingConflicts(conflicts: MergeConflict[]): MergeConflict[] {
  return conflicts.filter((c) => (c.kind === "same_question" || c.kind === "same_event_invite") && c.blocking)
}

// ── Preview ───────────────────────────────────────────────────────────────────

export interface MergePreview {
  fieldDiffs: FieldDiff[]
  resolved: ReturnType<typeof resolvedFields>
  conflicts: MergeConflict[]
  blocking: MergeConflict[]
  counts: {
    registrationsByStatus: Record<string, number>
    invites: number
    answers: number
    pushSubscriptionsDropped: number
    deliveryOutcomesReassigned: number
    deliveryOutcomesLeft: number
    sectorLeadersToReview: number
  }
}

export function buildMergePreview(input: MemberMergeInput, choices: MemberMergeChoices = {}): MergePreview {
  const conflicts = mergeConflicts(input, choices)
  const registrationsByStatus: Record<string, number> = {}
  for (const r of input.absorbRegistrations) registrationsByStatus[r.status] = (registrationsByStatus[r.status] ?? 0) + 1
  const deliveryOutcomesReassigned = input.absorbDeliveryOutcomes.filter((d) => d.addressHash && d.addressHash === input.keepAddressHash).length

  return {
    fieldDiffs: fieldDiffs(input, choices),
    resolved: resolvedFields(input, choices),
    conflicts,
    blocking: blockingConflicts(conflicts),
    counts: {
      registrationsByStatus,
      invites: input.absorbInvites.length,
      answers: input.absorbAnswers.length,
      pushSubscriptionsDropped: input.absorbPushSubscriptions.length,
      deliveryOutcomesReassigned,
      deliveryOutcomesLeft: input.absorbDeliveryOutcomes.length - deliveryOutcomesReassigned,
      sectorLeadersToReview: input.sectorLeadersMatchingAbsorbed.length,
    },
  }
}

// ── Plan ──────────────────────────────────────────────────────────────────────

export interface MergePlan {
  keepId: string
  absorbId: string
  fields: ReturnType<typeof resolvedFields>
  /** Registration ids moving from the absorbed record to the kept one (every status). */
  registrationsToReassign: string[]
  /** Registration ids to set to "cancelled" (the losing side of a same-shift conflict). */
  registrationsToCancel: { id: string; shiftLabel: string }[]
  inviteIdsToReassign: string[]
  /** The losing invite of a same-event conflict, deleted outright (its token stops resolving at once). */
  inviteIdsToDelete: string[]
  answerIdsToReassign: string[]
  /** The losing answer of a same-question conflict, deleted outright (its row would otherwise collide with the winner once reassigned). */
  answerIdsToDrop: string[]
  pushSubscriptionIdsToDelete: string[]
  deliveryOutcomeIdsToReassign: string[]
  /** Rows whose tokens must be regenerated after reassignment (#542 mechanism): every registration/invite moved. */
  tokenRegeneration: { registrationIds: string[]; inviteIds: string[] }
  sendLinksToKeptAddress: boolean
}

export class UnresolvedConflictsError extends Error {
  constructor(readonly conflicts: MergeConflict[]) {
    super("Merge has unresolved conflicts that need an explicit choice")
  }
}

export function buildMergePlan(input: MemberMergeInput, choices: MemberMergeChoices = {}): MergePlan {
  const conflicts = mergeConflicts(input, choices)
  const blocking = blockingConflicts(conflicts)
  if (blocking.length > 0) throw new UnresolvedConflictsError(blocking)

  const shifts = shiftById(input.shifts)
  const fields = resolvedFields(input, choices)

  // Same-shift conflicts: decide the winner among the merged live registrations of each shift.
  const allLive = [...input.keepRegistrations, ...input.absorbRegistrations].filter((r) => LIVE_REGISTRATION_STATUSES.has(r.status))
  const byShift = new Map<string, RegistrationLite[]>()
  for (const r of allLive) {
    const list = byShift.get(r.shiftId) ?? []
    list.push(r)
    byShift.set(r.shiftId, list)
  }
  const registrationsToCancel: { id: string; shiftLabel: string }[] = []
  for (const [shiftId, rows] of byShift) {
    if (rows.length < 2) continue
    const choice = choices.registrationConflicts?.[shiftId]
    let winnerId: string
    if (choice) {
      const fromKeep = input.keepRegistrations.find((r) => r.shiftId === shiftId)
      const fromAbsorb = input.absorbRegistrations.find((r) => r.shiftId === shiftId)
      winnerId = (choice === "keep" ? fromKeep?.id : fromAbsorb?.id) ?? rows[0].id
    } else {
      winnerId = [...rows].sort((a, b) => registrationRank(b) - registrationRank(a))[0].id
    }
    for (const r of rows) {
      if (r.id !== winnerId) registrationsToCancel.push({ id: r.id, shiftLabel: shifts.get(shiftId)?.label ?? shiftId })
    }
  }

  // Same-event invite conflicts: decide which invite row survives; the other is dropped (its
  // token revoked by being left behind on the absorbed record, purged with the tombstone).
  const inviteIdsToDrop = new Set<string>()
  const keepInviteByEvent = new Map(input.keepInvites.map((i) => [i.eventId, i]))
  for (const absorbInvite of input.absorbInvites) {
    const keepInvite = keepInviteByEvent.get(absorbInvite.eventId)
    if (!keepInvite) continue
    const choice = choices.inviteConflicts?.[absorbInvite.eventId]
    const absorbWins = choice ? choice === "absorb" : !!absorbInvite.usedAt && !keepInvite.usedAt
    inviteIdsToDrop.add(absorbWins ? keepInvite.id : absorbInvite.id)
  }
  const inviteIdsToReassign = input.absorbInvites.filter((i) => !inviteIdsToDrop.has(i.id)).map((i) => i.id)
  const inviteIdsToDelete = [...inviteIdsToDrop]

  // Same-question answer conflicts: the loser is dropped (left on the absorbed record).
  const answerIdsToDrop: string[] = []
  const absorbAnswerByQ = new Map(input.absorbAnswers.map((a) => [a.questionId, a]))
  for (const keepAnswer of input.keepAnswers) {
    const other = absorbAnswerByQ.get(keepAnswer.questionId)
    if (!other) continue
    const choice = choices.answerConflicts?.[keepAnswer.questionId] ?? "keep"
    answerIdsToDrop.push(choice === "absorb" ? keepAnswer.id : other.id)
  }
  const answerIdsToReassign = input.absorbAnswers.filter((a) => !answerIdsToDrop.includes(a.id)).map((a) => a.id)

  const deliveryOutcomeIdsToReassign = input.absorbDeliveryOutcomes.filter((d) => d.addressHash && d.addressHash === input.keepAddressHash).map((d) => d.id)

  const registrationIdsMoving = input.absorbRegistrations.map((r) => r.id)

  return {
    keepId: input.keep.id,
    absorbId: input.absorb.id,
    fields,
    registrationsToReassign: registrationIdsMoving,
    registrationsToCancel,
    inviteIdsToReassign,
    inviteIdsToDelete,
    answerIdsToReassign,
    answerIdsToDrop,
    pushSubscriptionIdsToDelete: input.absorbPushSubscriptions.map((p) => p.id),
    deliveryOutcomeIdsToReassign,
    tokenRegeneration: { registrationIds: registrationIdsMoving, inviteIds: inviteIdsToReassign },
    sendLinksToKeptAddress: !!choices.sendLinksToKeptAddress,
  }
}

/** Guard refusals, checked before building any preview or plan. */
export function refuseMerge(input: { keep: VolunteerLite; absorb: VolunteerLite }): string | null {
  if (input.keep.id === input.absorb.id) return "Impossible de fusionner une fiche avec elle-même."
  if (input.keep.organizationId !== input.absorb.organizationId) return "Non trouvé"
  if (input.absorb.mergedIntoId) return "Cette fiche a déjà été fusionnée dans une autre."
  if (input.keep.mergedIntoId) return "Cette fiche a déjà été fusionnée dans une autre."
  if (input.keep.erasedAt || input.absorb.erasedAt) return "Les données personnelles de cette fiche ont été effacées : elle ne peut pas être fusionnée."
  return null
}
