// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The « Secteur » filter of the organiser views and exports (#1170): the registrations list,
 * « Où manque-t-il du monde ? », « Jour J », « Documents à imprimer » and the documents it opens.
 *
 * - Offered only once the event adopted sectors (sectorsAdopted): without sectors there is no
 *   filter and every view is unchanged, whatever the URL says.
 * - It sits in the URL (`?secteur=<sectorId>` or `?secteur=autres`), so a view can be shared.
 *   Anything else (unknown id, another event's, an archived sector, a malformed value) is treated
 *   as « Tous les secteurs »: never an error that would tell a foreign id exists.
 * - Membership is per poste, the rule of the grouped timeline, the PDF and the leader scope:
 *   a poste's CURRENT sector is roleSectorOf over the event's live shifts (src/lib/leader-scope.ts
 *   posteSectorsOf), read at each request, so a poste moved since is not included. A poste whose
 *   sector is archived or unknown is in « Autres postes » (as in groupRolesBySector). The caller
 *   then narrows its query with `roleName in postes`: never filtered on the client only.
 * - A filter narrows what is shown; it never changes rights.
 *
 * Pure and Prisma-free: the client filter control reads the options and the texts.
 */

import { slugify } from "./utils"
import { NO_SECTOR_LABEL, activeSectors, sectorsAdopted, type SectorLike, type SectorsEventState } from "./sectors"

export const SECTOR_FILTER_PARAM = "secteur"
/** The URL value of « Autres postes ». */
export const SECTOR_FILTER_OTHERS = "autres"
export const SECTOR_FILTER_LABEL = "Secteur"
export const SECTOR_FILTER_ALL_LABEL = "Tous les secteurs"

export type SectorFilter =
  | { kind: "all" }
  | { kind: "sector"; id: string; name: string }
  | { kind: "others" }

export const ALL_SECTORS: SectorFilter = { kind: "all" }

export type SectorFilterOption = { value: string; label: string }

/** The first value of a search param (Next gives a string, an array or nothing). */
function firstValue(raw: string | string[] | null | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw ?? undefined
}

/**
 * The filter a request asks for. « Tous les secteurs » when the event did not adopt sectors, or
 * for any value that is not « autres » or one of the event's active sectors.
 */
export function parseSectorFilter(raw: string | string[] | null | undefined, event: SectorsEventState | null | undefined, sectors: SectorLike[]): SectorFilter {
  if (!sectorsAdopted(event)) return ALL_SECTORS
  const value = firstValue(raw)?.trim()
  if (!value) return ALL_SECTORS
  if (value === SECTOR_FILTER_OTHERS) return { kind: "others" }
  const sector = activeSectors(sectors).find((s) => s.id === value)
  return sector ? { kind: "sector", id: sector.id, name: sector.name } : ALL_SECTORS
}

/** The URL value of a filter: "" for all sectors. */
export function sectorFilterValue(filter: SectorFilter): string {
  return filter.kind === "sector" ? filter.id : filter.kind === "others" ? SECTOR_FILTER_OTHERS : ""
}

/** The choices of the select: all sectors, each active sector in its order, then « Autres postes ». */
export function sectorFilterOptions(sectors: SectorLike[]): SectorFilterOption[] {
  return [
    { value: "", label: SECTOR_FILTER_ALL_LABEL },
    ...activeSectors(sectors).map((s) => ({ value: s.id, label: s.name })),
    { value: SECTOR_FILTER_OTHERS, label: NO_SECTOR_LABEL },
  ]
}

/** Where a filter looks, in a sentence's words: « dans le secteur « Parking » », « dans « Autres postes » », « tous secteurs ». */
export function sectorFilterScope(filter: SectorFilter): string {
  if (filter.kind === "sector") return `dans le secteur « ${filter.name} »`
  if (filter.kind === "others") return `dans « ${NO_SECTOR_LABEL} »`
  return "tous secteurs"
}

/** The line under a filtered document's title: « Secteur : Parking », « Secteur : Autres postes ». Null when not filtered. */
export function sectorFilterCaption(filter: SectorFilter): string | null {
  if (filter.kind === "sector") return `${SECTOR_FILTER_LABEL} : ${filter.name}`
  if (filter.kind === "others") return `${SECTOR_FILTER_LABEL} : ${NO_SECTOR_LABEL}`
  return null
}

/**
 * The postes a filter keeps, from each poste's current sector (`sectorOf`, posteSectorsOf) and the
 * active sectors. Null for « Tous les secteurs » (nothing to narrow). Every poste lands in exactly
 * one choice, so no shift is counted under two sectors.
 */
export function postesInSectorFilter(filter: SectorFilter, sectorOf: Map<string, string | null>, activeSectorIds: Set<string>): string[] | null {
  if (filter.kind === "all") return null
  const kept: string[] = []
  for (const [role, sectorId] of sectorOf) {
    const inActive = !!sectorId && activeSectorIds.has(sectorId)
    if (filter.kind === "sector" ? inActive && sectorId === filter.id : !inActive) kept.push(role)
  }
  return kept.sort((a, b) => a.localeCompare(b, "fr"))
}

/** The end of a filtered export's file name: « -secteur-parking », « -autres-postes », "" when not filtered. */
export function sectorFileSuffix(filter: SectorFilter): string {
  if (filter.kind === "sector") return `-secteur-${slugify(filter.name) || "sans-nom"}`
  if (filter.kind === "others") return `-${slugify(NO_SECTOR_LABEL)}`
  return ""
}

/** Whether a poste is kept: every poste for « Tous les secteurs ». */
export function roleInSectorFilter(postes: string[] | null, roleName: string): boolean {
  return postes === null || postes.includes(roleName)
}

/** The Prisma condition on Shift for the kept postes: {} when not filtered, never an empty `in` that would read as « all ». */
export function shiftSectorWhere(postes: string[] | null): { roleName?: { in: string[] } } {
  return postes === null ? {} : { roleName: { in: postes } }
}

/** The Prisma condition on Registration (through its shift): {} when not filtered. */
export function registrationSectorWhere(postes: string[] | null): { shift?: { roleName: { in: string[] } } } {
  return postes === null ? {} : { shift: { roleName: { in: postes } } }
}

/**
 * `href` with the filter's param set (or removed for « Tous les secteurs »), its other params and
 * hash kept. Relative hrefs stay relative.
 */
export function withSectorFilter(href: string, filter: SectorFilter): string {
  const hashAt = href.indexOf("#")
  const hash = hashAt >= 0 ? href.slice(hashAt) : ""
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href
  const queryAt = beforeHash.indexOf("?")
  const path = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash
  const params = new URLSearchParams(queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "")
  const value = sectorFilterValue(filter)
  if (value) params.set(SECTOR_FILTER_PARAM, value)
  else params.delete(SECTOR_FILTER_PARAM)
  const query = params.toString()
  return `${path}${query ? `?${query}` : ""}${hash}`
}

/** The search string after choosing `value` in the select, the page's other params kept except `clear`. */
export function sectorFilterSearch(current: string, value: string, clear: string[] = []): string {
  const params = new URLSearchParams(current.startsWith("?") ? current.slice(1) : current)
  for (const name of clear) params.delete(name)
  if (value) params.set(SECTOR_FILTER_PARAM, value)
  else params.delete(SECTOR_FILTER_PARAM)
  const query = params.toString()
  return query ? `?${query}` : ""
}

/** What a page counts, in its three forms: « Aucune inscription », « inscription », « inscriptions ». */
export type CountWords = { none: string; one: string; many: string }

export const REGISTRATION_WORDS: CountWords = { none: "Aucune inscription", one: "inscription", many: "inscriptions" }
export const SHIFT_WORDS: CountWords = { none: "Aucun créneau", one: "créneau", many: "créneaux" }
/** « Jour J » counts what it shows first: the shifts running now or starting in the next hours. */
export const CURRENT_SHIFT_WORDS: CountWords = { none: "Aucun créneau en cours ou à venir", one: "créneau en cours ou à venir", many: "créneaux en cours ou à venir" }

/**
 * What the filter announces once the chosen view is shown: « Aucune inscription dans le secteur
 * « Parking ». », « 1 inscription dans « Autres postes ». », « 40 inscriptions, tous secteurs. ».
 */
export function sectorFilterAnnouncement(filter: SectorFilter, count: number, words: CountWords): string {
  const counted = count === 0 ? words.none : `${count} ${count > 1 ? words.many : words.one}`
  return filter.kind === "all" ? `${counted}, ${sectorFilterScope(filter)}.` : `${counted} ${sectorFilterScope(filter)}.`
}

/** What « Documents à imprimer » announces: no count, the documents' scope. */
export function documentsScopeAnnouncement(filter: SectorFilter): string {
  return filter.kind === "all" ? "Documents pour tous les secteurs." : `Documents limités ${filter.kind === "sector" ? `au secteur « ${filter.name} »` : `à « ${NO_SECTOR_LABEL} »`}.`
}
