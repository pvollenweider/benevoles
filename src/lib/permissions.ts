// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Two admin levels per organisation (#469), no more: Propriétaire and Organisateur. The stored
 * role « admin » (every admin before #469) is the owner, so existing admins keep every right
 * without a data migration. Checked server-side in every route (requireOrgSession(level)), and
 * the matrix below lists every admin route and method, so a new one has to be classified.
 */

export type Level = "owner" | "organizer"

export const OWNER_ROLE = "admin"
export const ORGANIZER_ROLE = "organizer"
export const ORG_ROLES = [OWNER_ROLE, ORGANIZER_ROLE] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const ROLE_LABEL: Record<OrgRole, string> = { admin: "Propriétaire", organizer: "Organisateur" }

export const OWNER_ONLY_MESSAGE = "Réservé aux propriétaires de l'organisation. Demandez à un propriétaire de le faire."

/** Whether a session role reaches a level. The super admin has every right; unknown roles none. */
export function hasLevel(role: string | null | undefined, level: Level): boolean {
  if (role === "super_admin" || role === OWNER_ROLE) return true
  if (role === ORGANIZER_ROLE) return level === "organizer"
  return false
}

export const isOwnerRole = (role: string | null | undefined) => role === OWNER_ROLE

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

/**
 * Route × method → level, for every route under src/app/api/admin (a test checks it matches the
 * files). Owner only: the admin team, the organisation's sensitive settings, permanent deletion.
 * Everything else — events, shifts, registrations, members, messages, exports, logs — is open to
 * organisers too.
 */
export const PERMISSIONS: Record<string, Partial<Record<Method, Level>>> = {
  "events": { GET: "organizer", POST: "organizer" },
  "events/[id]": { GET: "organizer", PATCH: "organizer", DELETE: "owner" },
  "events/[id]/duplicate": { POST: "organizer" },
  "events/[id]/export/answers": { GET: "organizer" },
  "events/[id]/export/archive": { GET: "organizer" },
  "events/[id]/export/attendance": { GET: "organizer" },
  "events/[id]/export/badges": { GET: "organizer" },
  "events/[id]/export/pdf": { GET: "organizer" },
  "events/[id]/export/sheets/[view]": { GET: "organizer" },
  "events/[id]/invitations": { GET: "organizer", POST: "organizer" },
  "events/[id]/invitations/remind": { POST: "organizer" },
  "events/[id]/invitations/test-email": { POST: "organizer" },
  "events/[id]/log": { GET: "organizer" },
  "events/[id]/log/baseline": { POST: "organizer" },
  "events/[id]/log/candidates": { GET: "organizer" },
  "events/[id]/message": { POST: "organizer" },
  "events/[id]/messages/[messageId]/resend-failed": { POST: "organizer" },
  "events/[id]/milestones": { GET: "organizer", POST: "organizer" },
  "events/[id]/milestones/[milestoneId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/pages": { GET: "organizer", POST: "organizer" },
  "events/[id]/pages/[pageId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/pages/reorder": { POST: "organizer" },
  "events/[id]/preview": { GET: "organizer", POST: "organizer" },
  "events/[id]/qr": { GET: "organizer" },
  "events/[id]/questions": { GET: "organizer", POST: "organizer" },
  "events/[id]/questions/[questionId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/questions/reorder": { POST: "organizer" },
  "events/[id]/registrations/bulk": { POST: "organizer" },
  "events/[id]/reorder-roles": { POST: "organizer" },
  "events/[id]/roles/[roleName]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/sector-leaders": { GET: "organizer", POST: "organizer" },
  "events/[id]/sector-leaders/[leaderId]": { DELETE: "organizer" },
  "events/[id]/send-reminder": { POST: "organizer" },
  "events/from-template": { POST: "organizer" },
  "members": { GET: "organizer", POST: "organizer" },
  "members/[id]": { PATCH: "organizer", DELETE: "organizer" },
  "members/[id]/certificate": { POST: "organizer" },
  // Permanent deletion (#667) is organizer level like the rest of the members routes: unlike
  // merge below, it only ever applies to a record that was already inactive with no registration
  // at all, so it's a much smaller, local action — not owner-only.
  "members/[id]/delete": { POST: "organizer" },
  // Merge (#600) is irreversible and touches every event: owner only. Organizers can see
  // duplicates (#599, the members list) but not merge them.
  "members/[id]/merge-preview": { POST: "owner" },
  "members/[id]/merge": { POST: "owner" },
  // Possible duplicates (#601) are only suggestions, visible and dismissible at organizer level —
  // the merge link they point to stays owner-only (members/[id]/merge above).
  "members/duplicates/dismiss": { POST: "organizer" },
  "members/export": { GET: "organizer" },
  "members/export-hours": { GET: "organizer" },
  "members/import": { POST: "organizer" },
  "members/import/preview": { POST: "organizer" },
  "registrations": { POST: "organizer" },
  "registrations/[id]": { PATCH: "organizer", DELETE: "organizer" },
  "registrations/[id]/resend-link": { POST: "organizer" },
  "registrations/[id]/decision": { POST: "organizer" },
  "settings/activity": { GET: "organizer" },
  "settings/activity/export": { GET: "organizer" },
  "settings/admins": { GET: "organizer", POST: "owner" },
  "settings/admins/[id]": { PATCH: "owner", DELETE: "owner" },
  "settings/message-templates": { GET: "organizer", POST: "organizer" },
  "settings/message-templates/[id]": { PATCH: "organizer", DELETE: "organizer" },
  "settings/notifications": { GET: "organizer", PATCH: "owner" },
  "settings/notifications/[id]/retry": { POST: "organizer" },
  "settings/notifications/test": { POST: "organizer" },
  "settings/organization": { PATCH: "owner" },
  "settings/organization/slugs": { GET: "organizer", DELETE: "owner" },
  "settings/password": { POST: "organizer" },
  "shifts": { POST: "organizer" },
  "shifts/[id]": { PATCH: "organizer", DELETE: "organizer" },
  "shifts/[id]/duplicate": { POST: "organizer" },
  "shifts/series": { POST: "organizer" },
}

/** Routes that don't require an org session at all (the invitation acceptance). */
export const PUBLIC_ADMIN_ROUTES = ["accept-invite"]

/**
 * Why a change to the team can't be made: an organisation always keeps at least one active owner.
 * `owners` is the number of active owners now.
 */
export function lastOwnerProblem(change: { targetIsActiveOwner: boolean; nextRole: string | null; owners: number }): string | null {
  const stillOwner = change.nextRole === OWNER_ROLE
  if (change.targetIsActiveOwner && !stillOwner && change.owners <= 1) {
    return "L'organisation doit garder au moins un propriétaire actif. Nommez d'abord un autre propriétaire."
  }
  return null
}
