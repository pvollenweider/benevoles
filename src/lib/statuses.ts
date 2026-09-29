// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Closed sets of values stored as strings (#321). The database enforces the same lists with
 * CHECK constraints (migration 20260929200000_status_check_constraints); a unit test keeps the
 * two in sync. Adding a value means updating both, in a migration that stays compatible with
 * the previous code (CONTRIBUTING, expand/contract): widen the constraint first, use the new
 * value in a later release.
 *
 * CHECK constraints rather than Postgres enum types: converting a column's type would break the
 * previous code during a rolling update, and a constraint can be widened without rewriting it.
 */

export const REGISTRATION_STATUSES = ["active", "waiting", "offered", "cancelled", "deleted"] as const
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number]

export const REGISTRATION_SOURCES = ["public_form", "admin_manual"] as const
export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number]

export const SHIFT_STATUSES = ["open", "full", "closed", "cancelled"] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

export const EVENT_PUBLIC_STATUSES = ["draft", "published", "archived"] as const
export type EventPublicStatus = (typeof EVENT_PUBLIC_STATUSES)[number]

export const ADMIN_ROLES = ["admin", "super_admin"] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export const OUTBOX_STATUSES = ["pending", "sending", "sent", "failed"] as const
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

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
} as const
