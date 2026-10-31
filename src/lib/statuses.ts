// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Closed sets of values stored as strings (#321). The database enforces the same lists with
 * CHECK constraints (migration 20260929200000_status_check_constraints, widened by later ones); a unit test keeps the
 * two in sync. Adding a value means updating both, in a migration that stays compatible with
 * the previous code (CONTRIBUTING, expand/contract): widen the constraint first, use the new
 * value in a later release.
 *
 * CHECK constraints rather than Postgres enum types: converting a column's type would break the
 * previous code during a rolling update, and a constraint can be widened without rewriting it.
 */

import { QUESTION_TYPES } from "./event-questions"

export const REGISTRATION_STATUSES = ["active", "waiting", "offered", "requested", "cancelled", "refused", "deleted"] as const
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number]

// « admin_draft » (#1146, lot C): created by publishing draft assignments (src/lib/draft-assignments.ts).
export const REGISTRATION_SOURCES = ["public_form", "admin_manual", "admin_draft"] as const
export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number]

export const SHIFT_STATUSES = ["open", "full", "closed", "cancelled"] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

export const EVENT_PUBLIC_STATUSES = ["draft", "published", "archived"] as const
export type EventPublicStatus = (typeof EVENT_PUBLIC_STATUSES)[number]

/** Owner (« admin »), organiser (#469) and platform super admin. */
export const ADMIN_ROLES = ["admin", "organizer", "super_admin"] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export const OUTBOX_STATUSES = ["pending", "sending", "sent", "failed", "cancelled"] as const
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

// Scheduled messages (#1019), see src/lib/scheduled-message.ts.
export const SCHEDULED_MESSAGE_STATUSES = ["scheduled", "sending", "sent", "cancelled", "skipped"] as const

// Draft assignments (#1146, lot C), see src/lib/draft-assignments.ts.
export const DRAFT_ASSIGNMENT_STATUSES = ["draft", "published", "discarded"] as const
export type DraftAssignmentStatus = (typeof DRAFT_ASSIGNMENT_STATUSES)[number]
export const DRAFT_ASSIGNMENT_SOURCES = ["manual", "proposal"] as const
export type DraftAssignmentSource = (typeof DRAFT_ASSIGNMENT_SOURCES)[number]

// Generated assignment proposals (#1172), see src/lib/proposal-runs-server.ts.
export const PROPOSAL_RUN_STATUSES = ["queued", "running", "finished", "interrupted", "failed"] as const
export type ProposalRunStatus = (typeof PROPOSAL_RUN_STATUSES)[number]
export const PROPOSAL_STOP_REASONS = ["budget", "iterations", "deadline", "cancelled", "lease_expired", "error", "no_other"] as const
export type ProposalStopReason = (typeof PROPOSAL_STOP_REASONS)[number]
export const PROPOSAL_OUTCOMES = ["complete", "incomplete", "proven_impossible"] as const
export type ProposalOutcomeValue = (typeof PROPOSAL_OUTCOMES)[number]

export const EVENT_LOG_ACTOR_TYPES = ["admin", "volunteer", "system"] as const
export const ORG_LOG_ACTOR_TYPES = ["admin", "system"] as const

/** Table.column → allowed values, as enforced by the CHECK constraints. */
export const CHECKED_COLUMNS = {
  "Registration.status": REGISTRATION_STATUSES,
  "Registration.source": REGISTRATION_SOURCES,
  "Shift.status": SHIFT_STATUSES,
  "Event.publicStatus": EVENT_PUBLIC_STATUSES,
  "AdminUser.role": ADMIN_ROLES,
  "NotificationOutbox.status": OUTBOX_STATUSES,
  "EventLog.actorType": EVENT_LOG_ACTOR_TYPES,
  "OrgLog.actorType": ORG_LOG_ACTOR_TYPES,
  // Question types (#483), widened for « Nombre » (#1015).
  "EventQuestion.type": QUESTION_TYPES,
  "ScheduledMessage.status": SCHEDULED_MESSAGE_STATUSES,
  "DraftAssignment.status": DRAFT_ASSIGNMENT_STATUSES,
  "DraftAssignment.source": DRAFT_ASSIGNMENT_SOURCES,
  "ProposalRun.status": PROPOSAL_RUN_STATUSES,
  "ProposalRun.stopReason": PROPOSAL_STOP_REASONS,
  "ProposalRun.outcome": PROPOSAL_OUTCOMES,
} as const
