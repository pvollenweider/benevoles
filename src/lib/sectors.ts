// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sectors grouping several postes (#1147), available to every active organisation since #1311
 * (they left the beta programme). A sector groups postes of one event (« Parking » for « Parking
 * Nord » and « Parking Mairie »); a poste belongs to zero or one sector (Shift.sectorId, shared per
 * poste, src/lib/role-settings.ts). Only organisers see sectors, unless the event groups its shifts
 * by sector on the sign-up page (#1469, `publicSectorsOf`): then the page shows the sector names as
 * headings, and nothing else (emails, personal pages and leader links are unchanged).
 *
 * The event option « Organiser les postes par secteurs » (Event.sectorsEnabled):
 * - is offered to every active organisation, or while the event already has it on or adopted it
 *   (an event never loses what it uses, BE06);
 * - can be turned on only while the organisation's links are open (active, not suspended), and off
 *   as long as no sector was saved;
 * - adoption (Event.sectorsAdoptedAt) happens with the first saved sector, in the same transaction,
 *   under a row lock on the event (src/lib/sector-adoption.ts). From then on the structure stays,
 *   even with every sector archived, and the option can no longer be turned off.
 *
 * Archiving a sector that holds postes needs the organiser's confirmation: its postes then move to
 * « Autres postes » in the same transaction, so an archived sector never holds a poste. Sectors are
 * never deleted. Pure and Prisma-free: the client components read the texts and the grouping.
 */

export const SECTOR_NAME_MAX = 60

export const SECTORS_OPTION_LABEL = "Organiser les postes par secteurs"
export const SECTORS_OPTION_HINT = "Un secteur regroupe plusieurs postes, par exemple « Parking » pour « Parking Nord » et « Parking Mairie ». Les secteurs servent à l'organisation : les bénévoles ne les voient pas, sauf si vous choisissez de regrouper les créneaux par secteur sur la page d'inscription."
export const SECTORS_FIRST_SAVE_NOTICE = "En créant ce premier secteur, vous conservez l'organisation par secteurs pour cet événement."
export const SECTORS_ADOPTED_NOTICE = "Cet événement utilise des secteurs. Vous pouvez les réorganiser, mais vous ne pouvez plus désactiver cette organisation."
export const NO_SECTOR_LABEL = "Autres postes"
/** The « no sector » choice of the sector selects (« Déplacer… », the shift form): one wording for both. */
export const NO_SECTOR_OPTION = "Autres postes (aucun secteur)"
/** Under « Autres postes » while every poste is still there, right after the first sector is saved. */
export const SECTORS_EXISTING_POSTES_NOTICE = "Vos postes existants restent dans « Autres postes ». Utilisez « Déplacer… » pour les ranger dans vos secteurs."

export const SECTORS_CLOSED_ERROR = "Les secteurs ne sont pas disponibles pour cette organisation : son espace n'est pas actif."
export const SECTORS_NOT_ENABLED_ERROR = "Activez d'abord « Organiser les postes par secteurs » dans les informations de l'événement."
export const SECTORS_LOCKED_ERROR = "Cet événement utilise des secteurs depuis l'enregistrement du premier : cette organisation ne peut plus être désactivée."
export const SECTOR_NAME_TAKEN_ERROR = "Un secteur porte déjà ce nom dans cet événement."
export const SECTOR_NOT_FOUND_ERROR = "Secteur introuvable."
export const SECTOR_ARCHIVED_ERROR = "Ce secteur est archivé : rétablissez-le avant d'y placer un poste."

export type SectorsEventState = { sectorsEnabled: boolean; sectorsAdoptedAt: Date | string | null }

/** Whether the event uses sectors: a sector was saved once. The admin views group by sector from then on. */
export const sectorsAdopted = (event: SectorsEventState | null | undefined): boolean => !!event?.sectorsAdoptedAt

/**
 * Whether the event settings show the option: the organisation can adopt sectors now, or the event
 * already has it on or adopted it (the gate covers new adoptions only).
 */
export function sectorsOptionOffered(event: SectorsEventState, canAdopt: boolean): boolean {
  return canAdopt || event.sectorsEnabled || sectorsAdopted(event)
}

export const MANAGE_POSTES_LABEL = "Gérer les postes"
export const MANAGE_SECTORS_POSTES_LABEL = "Gérer les secteurs et postes"

/**
 * The name of the roles panel and of the button that opens it: « Gérer les secteurs et postes »
 * once the event adopted sectors (the panel then shows the sector → poste tree), else
 * « Gérer les postes », also while the option is on with no sector saved yet.
 */
export function managePostesLabel(event: SectorsEventState | null | undefined): string {
  return sectorsAdopted(event) ? MANAGE_SECTORS_POSTES_LABEL : MANAGE_POSTES_LABEL
}

/** Whether « Gérer les postes » shows the sectors: the option is on, or the event adopted them. */
export function sectorsManaged(event: SectorsEventState | null | undefined): boolean {
  return !!event && (event.sectorsEnabled || sectorsAdopted(event))
}

export type SectorsDecision = { ok: true; change: boolean } | { ok: false; status: 403 | 409; error: string }

/**
 * Turning the option on or off, read under the event's row lock. On needs the organisation to be
 * available (a new adoption), unless already on; off is refused once a sector was saved. Asking for
 * the current value again changes nothing.
 */
export function sectorsSwitchDecision(event: SectorsEventState, enabled: boolean, canAdopt: boolean): SectorsDecision {
  if (enabled === event.sectorsEnabled) return { ok: true, change: false }
  if (!enabled) return sectorsAdopted(event) ? { ok: false, status: 409, error: SECTORS_LOCKED_ERROR } : { ok: true, change: true }
  if (sectorsAdopted(event)) return { ok: true, change: true }
  return canAdopt ? { ok: true, change: true } : { ok: false, status: 403, error: SECTORS_CLOSED_ERROR }
}

/**
 * Saving a sector, read under the event's row lock. An event that adopted sectors keeps full use
 * (BE06). Otherwise this is the first sector: the option must be on and the organisation available;
 * the caller then sets `sectorsAdoptedAt` in the same transaction (`adopt: true`).
 */
export function firstSectorDecision(event: SectorsEventState, canAdopt: boolean): { ok: true; adopt: boolean } | { ok: false; status: 403 | 409; error: string } {
  if (sectorsAdopted(event)) return { ok: true, adopt: false }
  if (!event.sectorsEnabled) return { ok: false, status: 409, error: SECTORS_NOT_ENABLED_ERROR }
  if (!canAdopt) return { ok: false, status: 403, error: SECTORS_CLOSED_ERROR }
  return { ok: true, adopt: true }
}

/** A sector name as stored: trimmed, inner spaces collapsed. Null when empty or too long. */
export function sectorName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw.replace(/\s+/g, " ").trim()
  return name.length >= 1 && name.length <= SECTOR_NAME_MAX ? name : null
}

/** The key the database compares names with (lower(trim(name)), Sector_eventId_name_ci_key). */
export const sectorNameKey = (name: string) => name.trim().toLowerCase()

export type SectorLike = { id: string; name: string; displayOrder: number; archivedAt?: Date | string | null }

/** Active sectors in their order (displayOrder, then name), archived ones left out. */
export function activeSectors<S extends SectorLike>(sectors: S[]): S[] {
  return sectors.filter((s) => !s.archivedAt).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "fr"))
}

/** Archived sectors, most recently archived first. */
export function archivedSectors<S extends SectorLike>(sectors: S[]): S[] {
  return sectors.filter((s) => !!s.archivedAt).sort((a, b) => new Date(b.archivedAt!).getTime() - new Date(a.archivedAt!).getTime())
}

/** Whether `name` is taken by another active sector of the event (case and spaces ignored). */
export function sectorNameTaken(sectors: SectorLike[], name: string, exceptId?: string): boolean {
  const key = sectorNameKey(name)
  return sectors.some((s) => !s.archivedAt && s.id !== exceptId && sectorNameKey(s.name) === key)
}

/** The order to store after moving one sector up or down: ids in the new order, or null at an end. */
export function moveSector(ids: string[], id: string, dir: "up" | "down"): string[] | null {
  const i = ids.indexOf(id)
  const j = dir === "up" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= ids.length) return null
  const next = [...ids]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/**
 * Whether a reorder request is a permutation of the event's active sectors: every id once, none
 * missing, none foreign (another event's or an archived one).
 */
export function isSectorPermutation(requested: string[], active: string[]): boolean {
  if (requested.length !== active.length) return false
  const wanted = new Set(active)
  return new Set(requested).size === requested.length && requested.every((id) => wanted.has(id))
}

export type SectorGroup = {
  /** The sector's id, or null for « Autres postes ». */
  id: string | null
  name: string
  roles: string[]
}

/**
 * Postes grouped by sector, for the admin timeline and the PDF (#1147): the active sectors in
 * their order, each with its postes in `roles`' order (the event's poste order), then
 * « Autres postes » last. A poste whose sector is archived or unknown goes to « Autres postes »;
 * an empty group is left out, except an active sector with `keepEmptySectors` (« Gérer les postes »
 * shows empty sectors: a poste is created from its sector). `sectorOf` gives each poste's sector (roleSectorOf, read over the
 * whole event, not one day, so a poste never changes group from one day to the next).
 */
export function groupRolesBySector(roles: string[], sectorOf: (role: string) => string | null | undefined, sectors: SectorLike[], { keepEmptySectors = false }: { keepEmptySectors?: boolean } = {}): SectorGroup[] {
  const ordered = activeSectors(sectors)
  const known = new Set(ordered.map((s) => s.id))
  const byId = new Map<string, string[]>()
  const none: string[] = []
  for (const role of roles) {
    const id = sectorOf(role)
    if (id && known.has(id)) {
      const list = byId.get(id) ?? []
      list.push(role)
      byId.set(id, list)
    } else none.push(role)
  }
  const groups: SectorGroup[] = ordered.filter((s) => keepEmptySectors || byId.has(s.id)).map((s) => ({ id: s.id, name: s.name, roles: byId.get(s.id) ?? [] }))
  if (none.length > 0) groups.push({ id: null, name: NO_SECTOR_LABEL, roles: none })
  return groups
}

/** The postes in grouped order (sector by sector, « Autres postes » last): the order the grouped views draw them in. */
export function groupedRoleOrder(groups: SectorGroup[]): string[] {
  return groups.flatMap((g) => g.roles)
}

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/** « 3 postes », for a sector's header and the archive confirmation. */
export const postesCount = (count: number) => n(count, "poste", "postes")

/** What the archive confirmation says for a sector that holds postes. */
export function archiveSectorSentence(name: string, postes: number): string {
  return postes === 0
    ? `Le secteur « ${name} » sera archivé. Vous pourrez le rétablir.`
    : `Le secteur « ${name} » sera archivé et ses ${postesCount(postes)} passeront dans « ${NO_SECTOR_LABEL} ». Vous pourrez rétablir le secteur, mais pas y remettre automatiquement ses postes.`
}

/** The key of a group in the timeline's collapsed set: the sector's id, or « none ». */
export const sectorGroupKey = (group: Pick<SectorGroup, "id">) => group.id ?? "none"

export const PUBLIC_GROUPING_LABEL = "Regrouper les créneaux par secteur sur la page d'inscription"
export const PUBLIC_GROUPING_HINT = "Les bénévoles voient alors le nom de vos secteurs, en titre au-dessus de leurs postes. Désactivé, la page d'inscription reste sans secteurs."

export const PUBLIC_GROUPING_NOT_ADOPTED_ERROR = "Créez d'abord un secteur dans « Gérer les postes » : il n'y a encore rien à regrouper."

export type PublicSector = { id: string; name: string }

/**
 * What the sign-up page may know of the sectors (#1469): the active sectors in their order, and
 * each shift's sector, only when the event adopted sectors AND chose to group its shifts by sector.
 * Otherwise nothing: no name and no sector id leaves the server, so the promise « les bénévoles ne
 * les voient pas » holds for every event that did not choose otherwise. A shift whose sector is
 * archived or unknown has none (« Autres postes »).
 */
export function publicSectorsOf(
  event: SectorsEventState & { publicSectorGrouping?: boolean | null; sectors?: SectorLike[] | null },
): { sectors: PublicSector[]; sectorOf: (sectorId: string | null | undefined) => string | null } {
  if (!event.publicSectorGrouping || !sectorsAdopted(event)) return { sectors: [], sectorOf: () => null }
  const sectors = activeSectors(event.sectors ?? []).map((s) => ({ id: s.id, name: s.name }))
  const known = new Set(sectors.map((s) => s.id))
  return { sectors, sectorOf: (id) => (id && known.has(id) ? id : null) }
}

export type SectorShiftGroup<T> = { id: string | null; name: string; shifts: T[] }

/**
 * A day's shifts grouped for the sign-up page (#1469), in the order the page reads them: the
 * sectors in their order, « Autres postes » last, empty groups left out, each group keeping the
 * order of `shifts`. Null when no shift of the day has a sector: the day is not grouped.
 */
export function groupShiftsBySector<T extends { sectorId?: string | null }>(shifts: T[], sectors: PublicSector[]): SectorShiftGroup<T>[] | null {
  if (sectors.length === 0 || !shifts.some((s) => s.sectorId)) return null
  const byId = new Map<string, T[]>()
  const none: T[] = []
  const known = new Set(sectors.map((s) => s.id))
  for (const shift of shifts) {
    if (shift.sectorId && known.has(shift.sectorId)) {
      const list = byId.get(shift.sectorId) ?? []
      list.push(shift)
      byId.set(shift.sectorId, list)
    } else none.push(shift)
  }
  const groups: SectorShiftGroup<T>[] = sectors.filter((s) => byId.has(s.id)).map((s) => ({ id: s.id, name: s.name, shifts: byId.get(s.id)! }))
  if (none.length > 0) groups.push({ id: null, name: NO_SECTOR_LABEL, shifts: none })
  return groups
}

export type SectorRows = { id: string | null; name: string; roles: string[] }

/**
 * The day's postes grouped by sector for the frise (#1469): the sectors in their order, each with
 * its postes in `postes`' order, « Autres postes » last, empty groups left out. Null when no poste
 * of the day has a sector, or when « Autres postes » would be the only group: no bands at all.
 */
export function sectorRowGroups(postes: string[], sectorOf: (role: string) => string | null | undefined, sectors: PublicSector[]): SectorRows[] | null {
  if (sectors.length === 0) return null
  const known = new Set(sectors.map((s) => s.id))
  const byId = new Map<string, string[]>()
  const none: string[] = []
  for (const role of postes) {
    const id = sectorOf(role)
    if (id && known.has(id)) byId.set(id, [...(byId.get(id) ?? []), role])
    else none.push(role)
  }
  if (byId.size === 0) return null
  const groups: SectorRows[] = sectors.filter((s) => byId.has(s.id)).map((s) => ({ id: s.id, name: s.name, roles: byId.get(s.id)! }))
  if (none.length > 0) groups.push({ id: null, name: NO_SECTOR_LABEL, roles: none })
  return groups
}
