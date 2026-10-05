// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure planning for erasing a member's personal data (#516, owner decision 2026-10-05: anonymise,
 * not delete). The record stays, emptied: « Bénévole effacé », every other personal field cleared,
 * inactive. Its registrations stay too, without identity (comment and phone cleared, personal link
 * regenerated and never sent), so event counts, hours and history stay right. What only the person
 * gave or owns is deleted: invitations (with the « not available » answer, #558), question answers,
 * push subscriptions, sector leader entries with their address, outbox rows addressed to or naming
 * them, SMTP outcomes, duplicate dismissals, and the tombstones of records merged into theirs (#600).
 *
 * What points to a member, and what each operation does with it, is the shared inventory in
 * src/lib/member-inventory.ts, checked against the schema by member-erasure-schema-guard.test.ts.
 * The writes run in one locked transaction in src/lib/member-erasure-transaction.ts (server-only).
 *
 * Deliberately pure (no Prisma, no node:crypto): the recap is built here for the member page.
 */

import type { ActionRecap } from "./action-recap"
import { normalizeEmail } from "./email-address"

export const ERASED_FIRST_NAME = "Bénévole"
export const ERASED_LAST_NAME = "effacé"
export const ERASED_DISPLAY_NAME = `${ERASED_FIRST_NAME} ${ERASED_LAST_NAME}`

/** What the Volunteer row becomes. Keys must match the "clear" columns of VOLUNTEER_FIELDS_ON_ERASURE. */
export function erasedVolunteerData(now: Date) {
  return {
    firstName: ERASED_FIRST_NAME,
    lastName: ERASED_LAST_NAME,
    // null, like a merge tombstone (#600): never collides with the unique (organizationId, email)
    // indexes, and the person can sign up again later as a brand new record.
    email: null,
    phone: null,
    tags: [] as string[],
    active: false,
    notes: null,
    birthDate: null,
    availabilityPeriods: [] as string[],
    availabilityNote: null,
    erasedAt: now,
  }
}

/** Personal columns of each kept registration. Keys must match the "clear" columns of REGISTRATION_FIELDS_ON_ERASURE. */
export const ERASED_REGISTRATION_DATA = { comment: null, phone: null } as const

export const MEMBER_ERASURE_REASON = {
  tombstone: "C'est une fiche fusionnée dans une autre : effacez les données de la fiche conservée.",
  erased: "Les données personnelles de cette fiche ont déjà été effacées.",
} as const

export interface MemberErasureSubject {
  mergedIntoId: string | null
  erasedAt: Date | null
}

export type MemberErasureEligibility = { eligible: true } | { eligible: false; reason: string; alreadyErased: boolean }

/** Any member can be erased, active or not, with or without history; never a tombstone, never twice. */
export function memberErasureEligibility(member: MemberErasureSubject): MemberErasureEligibility {
  if (member.erasedAt) return { eligible: false, reason: MEMBER_ERASURE_REASON.erased, alreadyErased: true }
  if (member.mergedIntoId) return { eligible: false, reason: MEMBER_ERASURE_REASON.tombstone, alreadyErased: false }
  return { eligible: true }
}

// ── Plan ──────────────────────────────────────────────────────────────────────

export interface ErasureInput {
  member: { id: string; firstName: string; lastName: string; email: string | null; mergedIntoId: string | null; erasedAt: Date | null }
  registrations: { id: string; status: string; upcoming: boolean }[]
  inviteIds: string[]
  answerIds: string[]
  pushSubscriptionIds: string[]
  /** Sector leader entries (#186) of the organisation whose email is the member's, case-insensitive. */
  sectorLeaderIds: string[]
  duplicateDismissalIds: string[]
  /** Records merged into this one (#600), directly or through a chain of merges. */
  tombstoneIds: string[]
}

export interface ErasurePlan {
  volunteerId: string
  /** Registrations kept without identity: every one of them, every status. */
  registrationIdsToScrub: string[]
  /** Registrations whose personal link is replaced by a token nobody is sent. */
  registrationIdsToRetoken: string[]
  delete: {
    inviteIds: string[]
    answerIds: string[]
    pushSubscriptionIds: string[]
    sectorLeaderIds: string[]
    duplicateDismissalIds: string[]
    tombstoneIds: string[]
  }
  counts: {
    registrations: number
    upcomingLive: number
    invites: number
    answers: number
    pushSubscriptions: number
    sectorLeaders: number
    tombstones: number
  }
}

const LIVE = new Set(["active", "waiting", "offered", "requested"])

export class MemberErasureRefusedError extends Error {
  constructor(readonly eligibility: Extract<MemberErasureEligibility, { eligible: false }>) {
    super(eligibility.reason)
  }
}

export function buildErasurePlan(input: ErasureInput): ErasurePlan {
  const eligibility = memberErasureEligibility(input.member)
  if (!eligibility.eligible) throw new MemberErasureRefusedError(eligibility)
  const registrationIds = input.registrations.map((r) => r.id)
  return {
    volunteerId: input.member.id,
    registrationIdsToScrub: registrationIds,
    registrationIdsToRetoken: registrationIds,
    delete: {
      inviteIds: [...input.inviteIds],
      answerIds: [...input.answerIds],
      pushSubscriptionIds: [...input.pushSubscriptionIds],
      sectorLeaderIds: [...input.sectorLeaderIds],
      duplicateDismissalIds: [...input.duplicateDismissalIds],
      tombstoneIds: input.tombstoneIds.filter((id) => id !== input.member.id),
    },
    counts: {
      registrations: registrationIds.length,
      upcomingLive: input.registrations.filter((r) => r.upcoming && LIVE.has(r.status)).length,
      invites: input.inviteIds.length,
      answers: input.answerIds.length,
      pushSubscriptions: input.pushSubscriptionIds.length,
      sectorLeaders: input.sectorLeaderIds.length,
      tombstones: input.tombstoneIds.filter((id) => id !== input.member.id).length,
    },
  }
}

/**
 * Every record merged into `rootId`, directly or through a chain (A merged into B, B later merged
 * into the root). `rows` are the merged records of the organisation (id, mergedIntoId). Cycle-safe.
 */
export function tombstoneChain(rootId: string, rows: { id: string; mergedIntoId: string | null }[]): string[] {
  const children = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.mergedIntoId) continue
    const list = children.get(r.mergedIntoId) ?? []
    list.push(r.id)
    children.set(r.mergedIntoId, list)
  }
  const seen = new Set<string>([rootId])
  const out: string[] = []
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    for (const child of children.get(id) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      out.push(child)
      queue.push(child)
    }
  }
  return out
}

// ── Outbox ────────────────────────────────────────────────────────────────────

export interface ErasedMemberIdentity {
  volunteerId: string
  email: string | null
  firstName: string
  lastName: string
}

/**
 * Whether an outbox payload (opened) concerns the member: addressed to them (the #598
 * `volunteerId`, or their address), or naming them anywhere in its data (an organizer's
 * withdrawal notice, the daily « addresses to verify » summary…). Their address or their full
 * name, compared case-insensitively; a name alone of under 3 characters on either side is too weak
 * to match on and is ignored.
 */
export function outboxPayloadConcernsMember(payload: unknown, member: ErasedMemberIdentity): boolean {
  if (!payload || typeof payload !== "object") return false
  const p = payload as { volunteerId?: unknown; recipient?: { email?: unknown } }
  if (typeof p.volunteerId === "string" && p.volunteerId === member.volunteerId) return true
  const email = member.email ? normalizeEmail(member.email) : null
  if (email && typeof p.recipient?.email === "string" && normalizeEmail(p.recipient.email) === email) return true
  const text = JSON.stringify(payload).toLowerCase()
  if (email && text.includes(email)) return true
  const first = member.firstName.trim().toLowerCase()
  const last = member.lastName.trim().toLowerCase()
  if (first.length >= 3 && last.length >= 3 && text.includes(`${first} ${last}`)) return true
  return false
}

// ── Recap ─────────────────────────────────────────────────────────────────────

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

export type ErasureCounts = ErasurePlan["counts"]

/** The confirmation's recap of what is removed and what is kept (#379 pattern, grouped). */
export function eraseMemberRecap(name: string, c: ErasureCounts): ActionRecap {
  const erased = [
    "nom et prénom : la fiche s'appellera « Bénévole effacé » et sera désactivée",
    "email et téléphone",
    "date de naissance",
    "notes, étiquettes et disponibilités",
    ...(c.registrations > 0 ? ["commentaires et téléphones laissés à ses inscriptions ; ses liens personnels ne fonctionneront plus"] : []),
    ...(c.invites > 0 ? [n(c.invites, "invitation (et sa réponse « pas disponible » éventuelle)", "invitations (et leurs réponses « pas disponible » éventuelles)")] : []),
    ...(c.answers > 0 ? [n(c.answers, "réponse aux questions des événements", "réponses aux questions des événements")] : []),
    ...(c.pushSubscriptions > 0 ? [n(c.pushSubscriptions, "abonnement aux notifications", "abonnements aux notifications")] : []),
    ...(c.sectorLeaders > 0 ? [n(c.sectorLeaders, "désignation comme responsable de secteur", "désignations comme responsable de secteur")] : []),
    ...(c.tombstones > 0 ? [n(c.tombstones, "ancienne fiche fusionnée dans la sienne", "anciennes fiches fusionnées dans la sienne")] : []),
    "emails en attente ou envoyés qui la concernent, et suivis d'envoi",
  ]
  const kept = [
    c.registrations > 0
      ? `${n(c.registrations, "inscription", "inscriptions")} (créneau, statut, présence), sans identité, pour que les effectifs, les heures et l'historique restent justes`
      : "aucune inscription à conserver",
    "les journaux d'activité, où elle apparaît comme « Bénévole effacé »",
  ]
  return {
    title: `Effacer les données personnelles de ${name} ?`,
    lead: "Cette action est irréversible : rien ne pourra être récupéré.",
    ...(c.upcomingLive > 0
      ? { warning: `${n(c.upcomingLive, "inscription à venir reste comptée", "inscriptions à venir restent comptées")} dans les effectifs. ${c.upcomingLive > 1 ? "Retirez-les" : "Retirez-la"} d'abord si la personne ne viendra pas.` }
      : {}),
    groups: [
      { heading: "Effacé :", items: erased },
      { heading: "Conservé :", items: kept },
    ],
    lines: [
      "Les attestations de bénévolat et les exports d'heures ne la nommeront plus.",
      "Aucun email n'est envoyé.",
      "Le journal d'activité de l'organisation indiquera qu'un effacement a eu lieu, sans dire qui.",
    ],
    confirmLabel: "Effacer les données",
    danger: true,
  }
}

/** What the person types to confirm. */
export const ERASURE_CHALLENGE = "effacer"
