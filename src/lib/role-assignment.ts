// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Roles « Attribué par l'organisation uniquement » (#1145), e.g. the stage crew or the cash desk,
 * staffed by the organisers alone. Such a role is never offered publicly: its shifts are left out
 * of the public page and its API (so of the group links, the embeddable page and the admin preview,
 * which read the same data), of the totals of the organisation's event list, of the reserved roles
 * an invitation opens and of « Chercher des bénévoles ». The public sign-up refuses its shifts
 * even with a known id, as an unknown shift, so the answer does not reveal the role either.
 *
 * Organisers still manage the role and add people by hand (capacity and overlap rules kept);
 * people placed there see the assignment on their personal page; the role's sector leaders see its
 * roster as for any role. Registrations made before the option was set are kept.
 *
 * The setting is stored on every shift of the role (like `overlapAllowed`); a role is assigned-only
 * as soon as one of its shifts is, so a shift left without it never opens a way in. Pure, no Prisma.
 */

export type AssignableShift = { roleName: string; assignedOnly?: boolean | null }

/** The roles of these shifts that only the organisation assigns: any of their shifts says so. */
export function assignedOnlyRoles(shifts: AssignableShift[]): Set<string> {
  return new Set(shifts.filter((s) => s.assignedOnly).map((s) => s.roleName))
}

/** Whether the role `roleName` is assigned by the organisation only, from its shifts. */
export function roleAssignedOnly(shifts: AssignableShift[], roleName: string): boolean {
  return shifts.some((s) => s.roleName === roleName && !!s.assignedOnly)
}

/**
 * The shifts the public sees: every shift except those of a role assigned by the organisation
 * only. `shifts` should hold all the live shifts of the event, so the rule reads the whole role.
 */
export function publicShifts<S extends AssignableShift>(shifts: S[]): S[] {
  const hidden = assignedOnlyRoles(shifts)
  return hidden.size === 0 ? shifts : shifts.filter((s) => !hidden.has(s.roleName))
}

/**
 * The shifts a volunteer's roster (#1068) may show: the public ones, plus the shifts of an
 * assigned-only role this volunteer is on (`ownShiftIds`), where they see who they work with.
 */
export function rosterShifts<S extends AssignableShift & { id: string }>(shifts: S[], ownShiftIds: Set<string>): S[] {
  const hidden = assignedOnlyRoles(shifts)
  return hidden.size === 0 ? shifts : shifts.filter((s) => !hidden.has(s.roleName) || ownShiftIds.has(s.id))
}

/** Whether a public sign-up asks for a shift of a role in `hidden` (from `assignedOnlyRoles`). */
export function asksAssignedOnly(asked: { roleName: string }[], hidden: Set<string>): boolean {
  return asked.some((s) => hidden.has(s.roleName))
}

/** What the option does, under it in the role editor. */
export const ASSIGNED_ONLY_HELP =
  "Le poste n'apparaît pas sur la page d'inscription, ni dans les liens de groupe ou la page intégrée, et personne ne peut s'y inscrire, même avec un lien d'invitation. Vous y ajoutez les personnes à la main ; elles le voient sur leur page « Mes inscriptions ». Les inscriptions déjà faites sont conservées."
