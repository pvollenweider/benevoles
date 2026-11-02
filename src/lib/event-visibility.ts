// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Event visibility (#414). Two independent axes: the lifecycle (`publicStatus`: draft, published,
 * archived) and the listing (`isListed`). An unlisted published event opens by its link and takes
 * sign-ups, but is absent from the organization's public page, the public list API and the
 * sitemap. Discretion, not access control.
 */

export type Visibility = { publicStatus: string; isListed: boolean }

/** Prisma filter for every public discovery surface (home page, list API, sitemap). */
export const PUBLIC_LIST_WHERE = { publicStatus: "published", isListed: true } as const

/** Direct access (event page, its pages, sign-up): published is enough, listed or not. */
export const PUBLIC_ACCESS_WHERE = { publicStatus: "published" } as const

/** Midnight today on the server's clock: an event whose end date falls before it is over. */
export function startOfToday(now: Date = new Date()): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

/**
 * Prisma filter for the events an organisation's public page shows (src/app/page.tsx): published,
 * listed and not over yet (an event already over would read « N places à pourvoir »). The same
 * filter decides whether that page is worth indexing (`orgHomeRobots`) and whether the apex
 * sitemap index lists the organisation (src/lib/sitemap-index.ts).
 */
export function orgHomeEventsWhere(now: Date = new Date()) {
  return { ...PUBLIC_LIST_WHERE, endDate: { gte: startOfToday(now) } }
}

/**
 * Robots metadata for an organisation's public page: out of search engines while it shows no event
 * (« Aucun événement en cours. », a page Google reports as a soft 404), back in as soon as one is
 * published and listed. Links stay followed.
 */
export function orgHomeRobots(shownEvents: number): { index: boolean; follow: boolean } | undefined {
  return shownEvents > 0 ? undefined : { index: false, follow: true }
}

export function isUnlistedPublic(e: Visibility): boolean {
  return e.publicStatus === "published" && !e.isListed
}

/** « Publié, non répertorié » where the plain status badge isn't enough. */
export function visibilityLabel(e: Visibility): string {
  switch (e.publicStatus) {
    case "published": return e.isListed ? "Publié" : "Publié, non répertorié"
    case "archived": return "Archivé"
    default: return "Brouillon"
  }
}

export const UNLISTED_HINT = "Accessible uniquement par lien direct. Ce mode ne protège pas l'événement par mot de passe : toute personne qui a le lien peut l'ouvrir."

export const LISTED_FIELD_LABEL = "Afficher cet événement sur la page publique de l'organisation"
export const LISTED_FIELD_HELP =
  "Si cette option est désactivée, l'événement reste accessible aux personnes disposant de son lien, mais il n'apparaît pas sur la page publique de l'organisation, dans sa liste publique ni dans le sitemap."

/** How a listing change reads in the event log. */
export function listingChangeLabel(v: unknown): string {
  return v === true ? "répertorié" : v === false ? "non répertorié" : String(v)
}

/**
 * Robots metadata for a public event page: only published and listed events are indexed. An
 * unlisted one opens by its link but stays out of search engines; a draft or an archived one is
 * not public at all, so its URL is never indexed either.
 */
export function robotsFor(e: Visibility | null): { index: boolean; follow: boolean } | undefined {
  if (!e) return undefined
  return e.publicStatus === "published" && e.isListed ? undefined : { index: false, follow: false }
}

