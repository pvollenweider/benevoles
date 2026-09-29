/**
 * Pure logic of the event log explorer (EventLogExplorer, #291): labels, list filters as query
 * parameters, live region texts, tab keyboard navigation. Kept out of the component so it can be
 * tested on its own.
 */

/** A log entry as the log API returns it (JSON: dates are ISO strings). */
export type ExplorerEntry = {
  id: string
  eventId: string
  actorType: string
  actorId: string | null
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  causedByLogId: string | null
  createdAt: string
}

export const ENTITY_LABELS: Record<string, string> = {
  Shift: "Créneau",
  Registration: "Inscription",
  Event: "Événement",
  MemberInvite: "Invitation",
  EventPage: "Page",
  SectorLeader: "Responsable de secteur",
  EventMilestone: "Jalon",
}

export const ACTOR_TYPE_LABELS: Record<string, string> = {
  admin: "Admin",
  volunteer: "Bénévole",
  system: "Système",
}

export const ACTION_PREFIXES = [
  { value: "", label: "Toutes les actions" },
  { value: "shift", label: "Créneaux" },
  { value: "registration", label: "Inscriptions" },
  { value: "event", label: "Événement" },
  { value: "memberinvite", label: "Invitations" },
  { value: "eventpage", label: "Pages" },
  { value: "sectorleader", label: "Responsables de secteur" },
  { value: "eventmilestone", label: "Jalons" },
]

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

export function entityBadgeClass(entityType: string) {
  switch (entityType) {
    case "Shift": return "bg-indigo-100 text-indigo-700"
    case "Registration": return "bg-emerald-100 text-emerald-700"
    case "Event": return "bg-blue-100 text-blue-700"
    default: return "bg-gray-100 text-gray-600"
  }
}

/** A "*.baseline" entry is a synthetic snapshot (see the baseline endpoint), not a real logged
 *  action — visually distinct (grey, not colored) so it never reads as something that happened. */
export function isBaseline(action: string) {
  return action.endsWith(".baseline")
}

export type LogFilters = { entityType: string; actorType: string; action: string; since: string; until: string }

/** Query string of the log API for the filters (empty ones left out) and an optional page cursor. */
export function logQueryParams(filters: LogFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.entityType) params.set("entityType", filters.entityType)
  if (filters.actorType) params.set("actorType", filters.actorType)
  if (filters.action) params.set("action", filters.action)
  if (filters.since) params.set("since", new Date(filters.since).toISOString())
  if (filters.until) params.set("until", new Date(filters.until).toISOString())
  if (cursor) params.set("cursor", cursor)
  return params
}

/** Live region text after a page of entries loaded: the first page, or one more. */
export function loadedAnnouncement(count: number, more: boolean): string {
  const s = count > 1 ? "s" : ""
  return more
    ? `${count} entrée${s} supplémentaire${s} chargée${s}.`
    : `${count} entrée${s} trouvée${s}.`
}

/** Live region text after generating the initial state. */
export function baselineAnnouncement(created: number): string {
  if (created === 0) return "Rien à générer : tout est déjà suivi."
  const plural = created > 1
  return `${created} état${plural ? "s initiaux" : " initial"} généré${plural ? "s" : ""}.`
}

export type Tab = "explore" | "replay" | "story"
const TAB_ORDER: Tab[] = ["explore", "replay", "story"]

/** Tab reached with Arrow/Home/End from the current one (wrapping), or null for any other key. */
export function tabForKey(current: Tab, key: string): Tab | null {
  const i = TAB_ORDER.indexOf(current)
  if (key === "ArrowRight") return TAB_ORDER[(i + 1) % TAB_ORDER.length]
  if (key === "ArrowLeft") return TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length]
  if (key === "Home") return TAB_ORDER[0]
  if (key === "End") return TAB_ORDER[TAB_ORDER.length - 1]
  return null
}

/**
 * Loaded entries per entity. "Rejouer" steps through an entity's history — pointless with a single
 * step. Counted from what's actually loaded: an accurate lower bound (a paginated-away entry could
 * make the real total higher), never wrong in the direction that would offer a scrubber with
 * nothing to scrub through.
 */
export function entryCountByEntity(entries: Pick<ExplorerEntry, "entityId">[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.entityId, (counts.get(e.entityId) ?? 0) + 1)
  return counts
}
