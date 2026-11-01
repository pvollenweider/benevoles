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
  "events/[id]/day-of": { GET: "organizer" },
  "events/[id]/duplicate": { POST: "organizer" },
  "events/[id]/export/answers": { GET: "organizer" },
  "events/[id]/export/archive": { GET: "organizer" },
  "events/[id]/export/attendance": { GET: "organizer" },
  "events/[id]/export/badges": { GET: "organizer" },
  "events/[id]/export/pdf": { GET: "organizer" },
  "events/[id]/export/sheets/[view]": { GET: "organizer" },
  // Share links per group (#947), like the event's pages: organiser level.
  "events/[id]/group-links": { GET: "organizer", POST: "organizer" },
  "events/[id]/group-links/[linkId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/invitations": { GET: "organizer", POST: "organizer" },
  "events/[id]/invitations/remind": { POST: "organizer" },
  "events/[id]/invitations/test-email": { POST: "organizer" },
  "events/[id]/log": { GET: "organizer" },
  "events/[id]/log/baseline": { POST: "organizer" },
  "events/[id]/log/candidates": { GET: "organizer" },
  "events/[id]/message": { POST: "organizer" },
  "events/[id]/messages/[messageId]/resend-failed": { POST: "organizer" },
  "events/[id]/scheduled-messages": { POST: "organizer" },
  "events/[id]/scheduled-messages/[scheduledId]/cancel": { POST: "organizer" },
  "events/[id]/open-shifts": { POST: "organizer" },
  "events/[id]/milestones": { GET: "organizer", POST: "organizer" },
  "events/[id]/milestones/[milestoneId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/pages": { GET: "organizer", POST: "organizer" },
  "events/[id]/pages/[pageId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/pages/reorder": { POST: "organizer" },
  "events/[id]/preview": { GET: "organizer", POST: "organizer" },
  "events/[id]/publication-request": { POST: "organizer" },
  "events/[id]/qr": { GET: "organizer" },
  "events/[id]/questions": { GET: "organizer", POST: "organizer" },
  "events/[id]/questions/[questionId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/questions/reorder": { POST: "organizer" },
  "events/[id]/registrations/bulk": { POST: "organizer" },
  "events/[id]/reorder-roles": { POST: "organizer" },
  "events/[id]/roles/[roleName]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/sector-leaders": { GET: "organizer", POST: "organizer" },
  // Sectors grouping postes (#1147, beta), like the postes: organiser level. Joining the beta stays owner-only.
  // Places of an event (#1171, lot 2): where missions happen, for the travel margin.
  "events/[id]/places": { GET: "organizer", POST: "organizer" },
  // Personal workload limits (#1171, lot 2): one person's own, stricter limits on an event.
  "events/[id]/workload-limits": { GET: "organizer" },
  "events/[id]/workload-limits/[volunteerId]": { PUT: "organizer", DELETE: "organizer" },
  "events/[id]/places/[placeId]": { PATCH: "organizer" },
  "events/[id]/sectors": { GET: "organizer", POST: "organizer" },
  "events/[id]/sectors/[sectorId]": { PATCH: "organizer" },
  "events/[id]/sectors/mode": { PUT: "organizer" },
  "events/[id]/sectors/reorder": { POST: "organizer" },
  "events/[id]/sector-leaders/[leaderId]": { DELETE: "organizer" },
  // Shift swaps between volunteers (#1174, beta): the event's option and the approvals, organiser level.
  "events/[id]/swaps": { GET: "organizer" },
  "events/[id]/swaps/[requestId]": { POST: "organizer" },
  "events/[id]/swaps/mode": { PUT: "organizer" },
  // Breaks and workload protection (#1171, beta): the event's policy and its preview, like the swaps option.
  "events/[id]/workload-policy": { GET: "organizer", PUT: "organizer" },
  "events/[id]/workload-policy/preview": { POST: "organizer" },
  // Dated availability (#1146, beta): the option, the requests, who answered and corrections, organiser level.
  "events/[id]/availability": { GET: "organizer", POST: "organizer" },
  "events/[id]/availability/mode": { PUT: "organizer" },
  "events/[id]/availability/remind": { POST: "organizer" },
  "events/[id]/availability/[volunteerId]": { GET: "organizer", PUT: "organizer" },
  // Assisted manual assignment (#1146, lot B): one person's fit for the shifts of the add form.
  "events/[id]/availability/fit": { GET: "organizer" },
  // Draft assignments and their publication (#1146, lot C): organisers, like the manual add.
  "events/[id]/availability/[volunteerId]/review": { POST: "organizer" },
  "events/[id]/drafts": { POST: "organizer" },
  "events/[id]/drafts/[draftId]": { PATCH: "organizer", DELETE: "organizer" },
  "events/[id]/drafts/options": { GET: "organizer" },
  "events/[id]/drafts/publish": { POST: "organizer" },
  // Generated assignment proposals (#1172): organisers, like the drafts they write.
  "events/[id]/drafts/[draftId]/lock": { POST: "organizer" },
  "events/[id]/proposals": { GET: "organizer", POST: "organizer" },
  "events/[id]/proposals/[runId]": { GET: "organizer" },
  "events/[id]/proposals/[runId]/cancel": { POST: "organizer" },
  "events/[id]/proposals/[runId]/write": { POST: "organizer" },
  "events/[id]/proposal-targets": { GET: "organizer", PUT: "organizer" },
  "events/[id]/send-reminder": { POST: "organizer" },
  "events/from-template": { POST: "organizer" },
  "members": { GET: "organizer", POST: "organizer" },
  "members/[id]": { PATCH: "organizer", DELETE: "organizer" },
  "members/[id]/certificate": { POST: "organizer" },
  // Permanent deletion (#667) is organizer level like the rest of the members routes: unlike
  // merge below, it only ever applies to a record that was already inactive with no registration
  // at all, so it's a much smaller, local action — not owner-only.
  "members/[id]/delete": { POST: "organizer" },
  // Erasure of personal data (#516): owners and organizers (owner decision), like deletion above:
  // answering a person's erasure request is part of managing the members.
  "members/[id]/erase": { POST: "organizer" },
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
  "registrations/[id]/restore": { POST: "organizer" },
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
  // The organization's logo (#300): one of its settings, like its name and address.
  "settings/organization/logo": { PUT: "owner", DELETE: "owner" },
  // Joining or leaving the beta (#1168) commits the whole organisation: owner only.
  "settings/organization/beta": { PUT: "owner" },
  "settings/organization/slugs": { GET: "organizer", DELETE: "owner" },
  "settings/password": { POST: "organizer" },
  "shifts": { POST: "organizer" },
  "shifts/[id]": { PATCH: "organizer", DELETE: "organizer" },
  "shifts/[id]/duplicate": { POST: "organizer" },
  "shifts/series": { POST: "organizer" },
  "shifts/recurrence": { POST: "organizer" },
  "shifts/recurrence/[id]/change": { POST: "organizer" },
  "shifts/recurrence/[id]/stop": { POST: "organizer" },
}

/**
 * Routes that don't require an org session at all: the invitation acceptance, and the super admin's
 * second step at sign-in (pentest F6), which checks its own session (requireSecondFactorStep).
 */
export const PUBLIC_ADMIN_ROUTES = ["accept-invite", "two-factor"]

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
