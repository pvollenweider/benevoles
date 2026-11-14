// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Information pages attached to postes (#1324). A page can be read before a shift by the
 * volunteers who hold a confirmed place on one of its postes; a page attached to no poste stays
 * the general information page it was. Postes have no table: they are the `roleName` shared by
 * an event's shifts, so an attachment is a list of names, kept in step like
 * EventGroupLink.roleNames and EventQuestion.displayRoleNames when a poste is renamed or
 * deleted (src/app/api/admin/events/[id]/roles/[roleName]/route.ts).
 *
 * Pure: no Prisma import. The public surfaces must never read `roleNames`; the rule below is for
 * the surfaces reached with a personal or leader link, and for emails.
 */

/** The sentence naming the link everywhere a volunteer reads it. */
export const READ_BEFORE_LABEL = "À lire avant ton créneau"

/** A page as the attachment rule needs it, ordered as the event's pages are. */
export type AttachablePage = {
  title: string
  slug: string
  displayOrder?: number
  roleNames?: string[] | null
}

/** A registration's place: only a confirmed one (`active`) opens the pages of its poste. */
export type ConfirmedPlace = { status: string; roleName: string }

const pageOrder = (a: AttachablePage, b: AttachablePage) =>
  (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.title.localeCompare(b.title, "fr") || a.slug.localeCompare(b.slug)

const attachedTo = (page: AttachablePage, roleNames: ReadonlySet<string>) =>
  (page.roleNames ?? []).some((name) => roleNames.has(name))

/**
 * « Pages to show for these registrations »: the pages attached to the poste of a confirmed
 * place, once each, in the event's page order. A waiting-list place, a request awaiting
 * validation or a cancelled place counts nothing; a page attached to no poste is never « to read
 * before your shift »; a name no confirmed place carries (a deleted poste) matches nothing.
 */
export function pagesToReadBeforeShift<T extends AttachablePage>(pages: readonly T[], places: readonly ConfirmedPlace[]): T[] {
  const confirmedPostes = new Set(places.filter((p) => p.status === "active").map((p) => p.roleName))
  if (confirmedPostes.size === 0) return []
  return pages.filter((page) => attachedTo(page, confirmedPostes)).sort(pageOrder)
}

/**
 * The pages attached to at least one of `roleNames`, once each: what a poste leader or a sector
 * leader sees on their page, for the postes they cover.
 */
export function pagesForPostes<T extends AttachablePage>(pages: readonly T[], roleNames: readonly string[]): T[] {
  const wanted = new Set(roleNames)
  if (wanted.size === 0) return []
  return pages.filter((page) => attachedTo(page, wanted)).sort(pageOrder)
}

/**
 * The names an admin form may store: trimmed, distinct, and only those a live poste still
 * carries. An empty list is valid (the page stays general), unlike a group link's roles.
 */
export function cleanPageRoleNames(requested: readonly string[], livePosteNames: readonly string[]): string[] {
  const live = new Set(livePosteNames)
  const out: string[] = []
  for (const raw of requested) {
    const name = raw.trim()
    if (name && live.has(name) && !out.includes(name)) out.push(name)
  }
  return out
}

/** The third line of the admin page list: « Pour le poste Bar », « Pour 3 postes : … », or nothing. */
export function pagePostesLine(roleNames: readonly string[]): string | null {
  const names = roleNames.map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) return null
  if (names.length === 1) return `Pour le poste ${names[0]}`
  return `Pour ${names.length} postes : ${names.join(", ")}`
}

/** A stored name no live poste carries is kept ticked and listed last, marked as such. */
export const DELETED_POSTE_SUFFIX = " (poste supprimé)"

/** The checkbox label of a stored name: its live name, or the deleted-postes marker. */
export function posteChoiceLabel(name: string, livePosteNames: readonly string[]): string {
  return livePosteNames.includes(name) ? name : `${name}${DELETED_POSTE_SUFFIX}`
}

/** A poste renamed (#218): every page that named it follows, like a group link. */
export function renameRoleInPage(roleNames: readonly string[], from: string, to: string): string[] {
  const out: string[] = []
  for (const name of roleNames) {
    const next = name === from ? to : name
    if (next.trim() && !out.includes(next)) out.push(next)
  }
  return out
}

/** A poste deleted: it leaves the pages, the other postes stay attached. */
export function removeRoleFromPage(roleNames: readonly string[], role: string): string[] {
  return roleNames.filter((name) => name !== role)
}
