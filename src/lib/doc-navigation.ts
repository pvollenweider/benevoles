// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { docUnitsByGroup, sortDocUnits, type DocGroup, type DocRole, type DocUnit } from "@/lib/doc-units"

/**
 * The navigation around a documentation unit (#649, src/app/doc/[slug]/page.tsx): the side menu
 * of every group, the units of its own group, the previous and next unit of that group, and the
 * jump links of a unit shared by both audiences. Pure: the page passes the units it loaded.
 */

/** A group of the side menu: its units in reading order, and whether the current unit is one of them. */
export type DocMenuGroup = { group: DocGroup; units: DocUnit[]; current: boolean }

/**
 * The side menu of a unit's page: every group with units, for every audience, in DOC_GROUPS order
 * (the order of /doc); only the current unit's group is marked `current` (the menu opens it).
 */
export function docMenuGroups(units: readonly DocUnit[], currentSlug: string): DocMenuGroup[] {
  return docUnitsByGroup(units).map(({ group, units: inGroup }) => ({
    group,
    units: inGroup,
    current: inGroup.some((u) => u.slug === currentSlug),
  }))
}

/** Who a section of the side menu speaks to: one audience, or both (« Commun »). */
export type DocMenuAudience = DocRole | "commun"

/** A section of the side menu: its visible <h2>, then its groups, in DOC_GROUPS order. */
export type DocMenuSection = { audience: DocMenuAudience; title: string; groups: DocMenuGroup[] }

/**
 * The sections of the side menu, in this order on every page: what volunteers read, what
 * organisers read, then what both read. Fixed, so the menu never moves from one page to the next
 * (WCAG 3.2.3, consistent navigation).
 */
export const DOC_MENU_SECTIONS: readonly { audience: DocMenuAudience; title: string }[] = [
  { audience: "benevole", title: "Bénévoles" },
  { audience: "admin", title: "Organisateurs" },
  { audience: "commun", title: "Commun" },
]

/**
 * The audience of a group in the side menu: « commun » as soon as one of its units is for both
 * roles, or its units together cover both; else the one role all its units share.
 */
export function docMenuGroupAudience(units: readonly DocUnit[]): DocMenuAudience {
  const roles = new Set(units.flatMap((u) => u.roles))
  if (roles.size !== 1 || units.some((u) => u.roles.length > 1)) return "commun"
  return [...roles][0]
}

/**
 * The side menu of a unit's page, by audience (DOC_MENU_SECTIONS): each group once, in the section
 * of its audience (docMenuGroupAudience), in DOC_GROUPS order within it; a section without any
 * group is left out. The current unit only decides which group is open (`current`), never the
 * order of the sections or of the groups.
 */
export function docMenuSections(units: readonly DocUnit[], currentSlug: string): DocMenuSection[] {
  const groups = docMenuGroups(units, currentSlug)
  return DOC_MENU_SECTIONS.map(({ audience, title }) => ({
    audience,
    title,
    groups: groups.filter((g) => docMenuGroupAudience(g.units) === audience),
  })).filter((s) => s.groups.length > 0)
}

/** The units of a unit's group, itself included, in reading order (`order`, then slug). */
export function docGroupUnits(unit: DocUnit, units: readonly DocUnit[]): DocUnit[] {
  return sortDocUnits(units.filter((u) => u.group === unit.group))
}

/** The other units of a unit's group, in reading order: « Dans ce thème ». */
export function docGroupSiblings(unit: DocUnit, units: readonly DocUnit[]): DocUnit[] {
  return docGroupUnits(unit, units).filter((u) => u.slug !== unit.slug)
}

/**
 * The unit before and after this one in its group, by reading order; null at either end. Never
 * crosses into another group: the last unit of a group has no next one.
 */
export function docUnitNeighbours(unit: DocUnit, units: readonly DocUnit[]): { previous: DocUnit | null; next: DocUnit | null } {
  const inGroup = docGroupUnits(unit, units)
  const i = inGroup.findIndex((u) => u.slug === unit.slug)
  if (i === -1) return { previous: null, next: null }
  return { previous: inGroup[i - 1] ?? null, next: inGroup[i + 1] ?? null }
}

/**
 * The two halves of a unit shared by both audiences, as its « ## Côté bénévole » and
 * « ## Côté organisation » headings render them: the volunteer half first, as the page offers it.
 */
export const DOC_SIDE_SECTIONS: readonly { id: string; label: string }[] = [
  { id: "cote-benevole", label: "Côté bénévole" },
  { id: "cote-organisation", label: "Côté organisation" },
]

/**
 * The jump links under « Pour : … » of a unit shared by both audiences: one per half the page
 * actually has (its heading ids, in any order), volunteer first. None unless both halves exist: a
 * unit for one audience has nothing to jump between.
 */
export function docJumpLinks(headingIds: readonly string[]): { href: string; label: string }[] {
  const present = DOC_SIDE_SECTIONS.filter((s) => headingIds.includes(s.id))
  if (present.length < DOC_SIDE_SECTIONS.length) return []
  return present.map((s) => ({ href: `#${s.id}`, label: s.label }))
}
