// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The operator's decisions (#810): validating, refusing, suspending, deactivating, deleting a
 * space, and the sign-up block list. Kept apart from the organisation's own log (OrgLog), which
 * is deleted with the organisation: a refused or deleted space must still leave a trace, and the
 * block list belongs to no organisation. Labels are copied at the time of the decision, so an
 * entry stays readable after its space or its author is gone. Pure, Prisma-free.
 */

export const OPERATOR_ACTIONS = [
  "organization.approved",
  "organization.refused",
  "organization.suspended",
  "organization.suspension_lifted",
  "organization.deactivated",
  "organization.reactivated",
  "organization.deleted",
  "blocklist.added",
  "blocklist.removed",
] as const

export type OperatorAction = (typeof OPERATOR_ACTIONS)[number]

export const OPERATOR_ACTION_LABELS: Record<OperatorAction, string> = {
  "organization.approved": "Espace validé",
  "organization.refused": "Espace refusé et supprimé",
  "organization.suspended": "Organisation suspendue",
  "organization.suspension_lifted": "Suspension levée",
  "organization.deactivated": "Organisation désactivée",
  "organization.reactivated": "Organisation réactivée",
  "organization.deleted": "Organisation supprimée",
  "blocklist.added": "Ajout à la liste de blocage",
  "blocklist.removed": "Retrait de la liste de blocage",
}

/** The label of an action, or the raw action for an unknown one (an entry older than this list). */
export function operatorActionLabel(action: string): string {
  return (OPERATOR_ACTION_LABELS as Record<string, string>)[action] ?? action
}

export type OperatorLogInput = {
  action: OperatorAction
  actor: { id?: string | null; name?: string | null; email?: string | null } | null | undefined
  entityType: "Organization" | "SignupBlock"
  entityId: string
  /** What the decision was about, readable on its own: « Fête du village (fete-du-village) », « spam@example.org ». */
  target: string
  /** The reason given, when there is one (suspension, block). */
  detail?: string | null
}

/** The row to store. */
export function operatorLogData(input: OperatorLogInput) {
  return {
    action: input.action,
    actorId: input.actor?.id ?? null,
    actorLabel: input.actor?.name?.trim() || input.actor?.email?.trim() || null,
    entityType: input.entityType,
    entityId: input.entityId,
    target: input.target,
    detail: input.detail?.trim() || null,
  }
}

/** An organisation as a target: its name and identifier, as they were at the decision. */
export function organizationTarget(org: { name: string; slug: string }): string {
  return `${org.name} (${org.slug})`
}

type Db = { operatorLog: { create(args: { data: ReturnType<typeof operatorLogData> }): Promise<unknown> } }

export async function logOperator(db: Db, input: OperatorLogInput): Promise<void> {
  await db.operatorLog.create({ data: operatorLogData(input) })
}
