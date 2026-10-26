// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { KNOWN_ROLES } from "./roles"
import { eventPostes, posteKey, posteSettingsHint, type PosteShift } from "./poste-suggestions"
import { roleSectorOf } from "./role-settings"
import { NO_SECTOR_LABEL } from "./sectors"

/**
 * Sector first, then poste (#1147): the shift form of an event that adopted sectors asks for the
 * sector before the poste. A poste has no table (its shifts carry it, src/lib/role-settings.ts),
 * so a new poste is created with its first shift, in the sector chosen in the form; an existing
 * poste keeps its sector: typing its name in another sector never moves it, the form says where
 * it is and offers to switch the form's sector, and the server refuses the disagreement (409).
 *
 * A poste's name is compared like everywhere in the shift forms (posteKey: case and spaces
 * aside). Its sector is the one most of its live shifts carry (roleSectorOf); an archived or
 * unknown sector counts as « Autres postes » (null), as the grouped views draw it.
 * Pure, no Prisma import: the shift editor uses it, and the create route uses the same rules.
 */

export type PosteSectorShift = PosteShift & { sectorId?: string | null; updatedAt?: Date | string | null }

/** The sector of the poste `poste` (any spelling), from its live shifts; null = « Autres postes ». */
export function posteSectorOf(shifts: readonly PosteSectorShift[], poste: string, activeIds?: ReadonlySet<string>): string | null {
  const k = posteKey(poste)
  const own = shifts.filter((s) => s.status !== "cancelled" && posteKey(s.roleName) === k)
  const id = roleSectorOf(own.map((s) => ({ roleName: s.roleName, sectorId: s.sectorId ?? null, updatedAt: s.updatedAt ?? null })))
  return id && (!activeIds || activeIds.has(id)) ? id : null
}

/**
 * The poste suggestions once a sector is chosen: the event's postes in that sector (null =
 * « Autres postes »), in the event's poste order, then the examples the event does not use yet.
 * A poste of another sector is left out: picking it would only bring the « est dans le secteur »
 * message.
 */
export function posteSuggestionsInSector(
  shifts: readonly PosteSectorShift[], sectorId: string | null, activeIds: ReadonlySet<string>, examples: readonly string[] = KNOWN_ROLES,
): string[] {
  const all = eventPostes(shifts)
  const used = new Set(all.map(posteKey))
  const own = all.filter((p) => posteSectorOf(shifts, p, activeIds) === sectorId)
  return [...own, ...examples.filter((e) => !used.has(posteKey(e)))]
}

export type PosteSectorMismatch = { poste: string; sectorId: string | null }

/**
 * The existing poste typed in the form when it is in another sector than the one chosen: its
 * stored spelling and its sector. Null for a new poste, an empty field, or the right sector.
 */
export function posteSectorMismatch(
  shifts: readonly PosteSectorShift[], typed: string, chosen: string | null, activeIds: ReadonlySet<string>,
): PosteSectorMismatch | null {
  const k = posteKey(typed)
  if (!k) return null
  const poste = eventPostes(shifts).find((p) => posteKey(p) === k)
  if (!poste) return null
  const sectorId = posteSectorOf(shifts, poste, activeIds)
  return sectorId === chosen ? null : { poste, sectorId }
}

const where = (sectorName: string | null) => (sectorName ? `le secteur « ${sectorName} »` : `« ${NO_SECTOR_LABEL} »`)

/** Under the poste field: « Le poste « Accueil » est dans le secteur « Entrées ». » */
export function posteSectorMessage(poste: string, sectorName: string | null): string {
  return `Le poste « ${poste} » est dans ${where(sectorName)}.`
}

/** The button that switches the form's sector to the poste's: « Utiliser ce poste dans « Entrées » ». */
export function switchSectorLabel(sectorName: string | null): string {
  return `Utiliser ce poste dans « ${sectorName ?? NO_SECTOR_LABEL} »`
}

/** The server's refusal (409) of a shift whose sector disagrees with its existing poste. */
export function posteSectorConflictError(poste: string, sectorName: string | null): string {
  return `Le poste « ${poste} » est dans ${where(sectorName)} : choisissez ce secteur, ou un autre nom pour créer un nouveau poste.`
}

export type NewShiftSectorDecision =
  | { ok: true; sectorId: string | null }
  | { ok: false; status: 409; posteSectorId: string | null }

/**
 * The sector of a shift created with a sector (POST /api/admin/shifts with `sectorId`): an
 * existing poste (its sector, `existing`) keeps it, and a differing request is refused; a new
 * poste (`existing` undefined) takes the requested one.
 */
export function newShiftSectorDecision(existing: string | null | undefined, requested: string | null): NewShiftSectorDecision {
  if (existing === undefined) return { ok: true, sectorId: requested }
  return existing === requested ? { ok: true, sectorId: existing } : { ok: false, status: 409, posteSectorId: existing }
}

/**
 * The sector of the existing poste typed (any spelling), for the form's « Secteur » select:
 * undefined for a new name or an empty field, null for « Autres postes ».
 */
export function typedPosteSector(shifts: readonly PosteSectorShift[], typed: string, activeIds: ReadonlySet<string>): string | null | undefined {
  const k = posteKey(typed)
  if (!k) return undefined
  const poste = eventPostes(shifts).find((p) => posteKey(p) === k)
  return poste === undefined ? undefined : posteSectorOf(shifts, poste, activeIds)
}

/**
 * The value of the form's « Secteur » select once the poste field changed: until the organiser
 * chose a sector (preset by « Ajouter un poste dans « S » » or changed by hand), it follows the
 * existing poste typed; a chosen sector, or a new name, keeps the current value.
 */
export function effectiveSector(chosen: boolean, typedSector: string | null | undefined, current: string | null): string | null {
  return !chosen && typedSector !== undefined ? typedSector : current
}

/** Under the poste field while the select follows the poste: where it is, then its settings. */
export function posteFollowHint(poste: string, sectorName: string | null): string {
  return `Secteur du poste : « ${sectorName ?? NO_SECTOR_LABEL} ». ${posteSettingsHint(poste)}`
}

/**
 * What saving creates while the poste typed is new: « Le poste sera créé dans « Bar » avec son
 * premier créneau. » (one shift) or « … avec ses créneaux. » (a series or a weekly permanence).
 */
export function newPosteSectorHint(sectorName: string | null, many = false): string {
  return `Le poste sera créé dans « ${sectorName ?? NO_SECTOR_LABEL} » avec ${many ? "ses créneaux" : "son premier créneau"}.`
}
