// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Everything in the schema that points to a member (Volunteer), and what each member operation
 * does with it: merge (#600, src/lib/member-merge.ts), permanent deletion (#667,
 * src/lib/member-deletion-transaction.ts) and erasure of personal data (#516,
 * src/lib/member-erasure.ts). One inventory shared by the three, re-derived from
 * prisma/schema.prisma by the schema guard tests (member-merge-schema-guard, member-deletion-schema-guard,
 * member-erasure-schema-guard): a new model referencing Volunteer, or a new column on Volunteer or
 * Registration, fails them until it's classified here for every operation.
 *
 * Pure data, no Prisma import (see CLAUDE.md: src/lib modules may be reached by client components).
 */

/** What a merge does with the absorbed record's rows. */
export type MergeHandling = "reassign" | "drop" | "out_of_scope"
/** How a permanent deletion of the Volunteer row treats them (database level). */
export type DeletionHandling = "cascade" | "blocks" | "no_fk"
/** What an erasure does with them: delete the rows, scrub their personal columns, or keep them. */
export type ErasureHandling = "delete" | "scrub" | "keep"

export interface VolunteerRelation {
  merge: MergeHandling
  deletion: DeletionHandling
  erasure: ErasureHandling
  why: string
}

/** Models with a `Volunteer` relation or a `volunteerId` column. */
export const VOLUNTEER_RELATIONS: Record<string, VolunteerRelation> = {
  Registration: {
    merge: "reassign",
    deletion: "blocks",
    erasure: "scrub",
    why: "history of the events: kept without identity on erasure (comment, phone cleared, token regenerated) so counts, hours and history stay right",
  },
  MemberInvite: {
    merge: "reassign",
    deletion: "cascade",
    erasure: "delete",
    why: "a personal link, and the « not available » answer (#558) is the person's own",
  },
  QuestionAnswer: {
    merge: "reassign",
    deletion: "cascade",
    erasure: "delete",
    why: "free answers given by the person",
  },
  PushSubscription: {
    merge: "drop",
    deletion: "cascade",
    erasure: "delete",
    why: "a device of the person",
  },
  DeliveryOutcome: {
    merge: "reassign",
    deletion: "cascade",
    erasure: "delete",
    why: "per-recipient SMTP outcome (#598), with a hash of the address",
  },
  DuplicateDismissal: {
    merge: "out_of_scope",
    deletion: "cascade",
    erasure: "delete",
    why: "pair-specific (#601): an erased record is never suggested again, so the dismissal is useless",
  },
  ErasureRecord: {
    merge: "out_of_scope",
    deletion: "no_fk",
    erasure: "keep",
    why: "the erasure register itself (#516): no personal data, must outlive the record to replay erasures after a restore",
  },
}

/**
 * References to a member without a foreign key: never reached by a cascade, each one handled
 * explicitly by the erasure (and noted for the merge, which only reports SectorLeader).
 */
export const VOLUNTEER_REFERENCES_WITHOUT_FK: Record<string, { erasure: ErasureHandling; why: string }> = {
  SectorLeader: { erasure: "delete", why: "matched by email (case-insensitive), not volunteerId: entries with the person's address are deleted" },
  NotificationOutbox: { erasure: "delete", why: "the sealed payload holds the recipient: rows addressed to or naming the person are deleted, except one being sent right now" },
  EventLog: { erasure: "keep", why: "actorId / entityId only, no personal data in `changes`: the actor resolves to « Bénévole effacé » at read time" },
  OrgLog: { erasure: "keep", why: "same as EventLog; the erasure itself is logged without saying who" },
}

/** Every column of Volunteer, and what an erasure writes there. "clear" = emptied or reset. */
export const VOLUNTEER_FIELDS_ON_ERASURE: Record<string, "clear" | "keep"> = {
  id: "keep",
  organizationId: "keep",
  firstName: "clear",
  lastName: "clear",
  email: "clear",
  phone: "clear",
  tags: "clear",
  active: "clear",
  notes: "clear",
  birthDate: "clear",
  availabilityPeriods: "clear",
  availabilityNote: "clear",
  mergedIntoId: "keep",
  mergedAt: "keep",
  erasedAt: "clear",
  createdAt: "keep",
  updatedAt: "keep",
}

/**
 * Every column of Registration, and what an erasure does with it. "regenerate" = a fresh token
 * nobody is ever sent, so every personal link of the person stops working.
 *
 * The charter acceptance proof (#569, hash of the text shown and date) is kept: it identifies a
 * text version, not a person, and once the registration no longer points to anyone it says only
 * "this anonymous registration accepted that version" — the same as the registration's own date.
 */
export const REGISTRATION_FIELDS_ON_ERASURE: Record<string, "clear" | "keep" | "regenerate"> = {
  id: "keep",
  eventId: "keep",
  shiftId: "keep",
  volunteerId: "keep",
  status: "keep",
  source: "keep",
  comment: "clear",
  phone: "clear",
  editTokenLegacy: "regenerate",
  editTokenHash: "regenerate",
  editTokenEnc: "regenerate",
  reminderJ2Sent: "keep",
  reminderJ1Sent: "keep",
  reminderDdSent: "keep",
  waitingPosition: "keep",
  waitingOfferedAt: "keep",
  waitingExpiresAt: "keep",
  checkedInAt: "keep",
  linkEmailedAt: "keep",
  charterAcceptedHash: "keep",
  charterAcceptedAt: "keep",
  createdAt: "keep",
  updatedAt: "keep",
}

export const modelsWith = <K extends keyof VolunteerRelation>(key: K, value: VolunteerRelation[K]): string[] =>
  Object.entries(VOLUNTEER_RELATIONS).filter(([, r]) => r[key] === value).map(([name]) => name)
