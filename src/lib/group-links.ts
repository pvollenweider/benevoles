// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Share links per group (#947): a festival run by several clubs gives each club its own link and QR
 * code, `/<event>?groupe=<code>`, which opens the sign-up page on that club's roles only, and counts
 * the sign-ups it brought. Pure (no Prisma, no Node crypto): the public page and the admin
 * components import it.
 *
 * Roles have no table: a role is the roleName shared by shifts. A link stores role names, kept in
 * step by the role rename and delete route; on top of that, a name no live shift carries any more is
 * dropped when the page is shown, so a link never shows an empty schedule. When none of its roles
 * is left, the page shows the whole event with a short notice instead.
 */

/** URL parameter of a group link: `/<event>?groupe=<code>`. */
export const GROUP_PARAM = "groupe"
export const GROUP_LINK_NAME_MAX = 60
export const GROUP_LINK_NAME_REQUIRED = "Donnez un nom au lien, par exemple celui du club."
export const GROUP_LINK_NAME_TOO_LONG = `Le nom fait ${GROUP_LINK_NAME_MAX} caractères au plus.`
export const GROUP_LINK_ROLES_REQUIRED = "Choisissez au moins un poste."
export const GROUP_LINK_NAME_TAKEN = "Un autre lien de cet événement porte déjà ce nom : choisissez-en un autre."
/** The refusals about the name field; any other refusal of the form is about the roles. */
export const GROUP_LINK_NAME_ERRORS = [GROUP_LINK_NAME_REQUIRED, GROUP_LINK_NAME_TOO_LONG, GROUP_LINK_NAME_TAKEN]

/** Two links of one event never share a name (case and accents of the comparison aside): the
 * volunteers' line, the admin actions and the registrations filter are told apart by it. */
export function sameGroupName(a: string, b: string): boolean {
  const k = (s: string) => s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
  return k(a) === k(b)
}

/** No 0/o, 1/l/i: a code copied by hand from a poster stays readable. */
export const GROUP_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
export const GROUP_CODE_LENGTH = 8

/**
 * A random code, never derived from the name or a counter (not guessable from another link).
 * `randomInt(n)` returns an integer in [0, n): `crypto.randomInt` on the server.
 */
export function generateGroupCode(randomInt: (max: number) => number): string {
  let code = ""
  for (let i = 0; i < GROUP_CODE_LENGTH; i++) code += GROUP_CODE_ALPHABET[randomInt(GROUP_CODE_ALPHABET.length)]
  return code
}

/** The code of a URL parameter, or null when it can't be one (nothing is looked up then). */
export function parseGroupCode(raw: string | string[] | null | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase()
  if (!value || value.length !== GROUP_CODE_LENGTH) return null
  return [...value].every((c) => GROUP_CODE_ALPHABET.includes(c)) ? value : null
}

/** A public event URL with the group's code, whatever query it already has (`?org=` locally). */
export function groupLinkUrl(publicUrl: string, code: string): string {
  const url = new URL(publicUrl)
  url.searchParams.set(GROUP_PARAM, code)
  return url.toString()
}

/** Role names typed or ticked by the organiser → trimmed, distinct, in their order. */
export function cleanRoleNames(names: string[]): string[] {
  const out: string[] = []
  for (const n of names) {
    const v = n.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/** A role renamed (#218): every link that showed it shows the new name. */
export function renameRoleInLink(roleNames: string[], from: string, to: string): string[] {
  return cleanRoleNames(roleNames.map((n) => (n === from ? to : n)))
}

/** A role deleted: it leaves the links; the other roles stay. */
export function removeRoleFromLink(roleNames: string[], role: string): string[] {
  return roleNames.filter((n) => n !== role)
}

/** A link as the admin list shows it: its URL, the roles no longer on the planning, its sign-ups. */
export type AdminGroupLink = {
  id: string
  code: string
  name: string
  roleNames: string[]
  missingRoles: string[]
  hideFull: boolean
  url: string
  registrations: number
  people: number
}

export type GroupLinkRecord = { code: string; name: string; roleNames: string[]; hideFull: boolean }

/**
 * What the public page does with `?groupe=` (#947). `requested` is the parameter's code ("" when
 * present but malformed), null without the parameter:
 * - none: no parameter, the whole event;
 * - unknown: a code that matches no link of this event (deleted, mistyped), the whole event;
 * - empty: the link exists but none of its roles has a live shift, the whole event;
 * - filtered: only `roleNames` (those still on the schedule, in the link's order).
 */
export type GroupFilter =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "empty"; code: string; name: string }
  | { kind: "filtered"; code: string; name: string; roleNames: string[]; hideFull: boolean }

export function resolveGroupFilter(
  requested: string | null,
  link: GroupLinkRecord | null,
  liveRoleNames: string[],
): GroupFilter {
  if (requested === null) return { kind: "none" }
  if (!link || link.code !== requested) return { kind: "unknown" }
  const live = new Set(liveRoleNames)
  const roleNames = link.roleNames.filter((n) => live.has(n))
  if (roleNames.length === 0) return { kind: "empty", code: link.code, name: link.name }
  return { kind: "filtered", code: link.code, name: link.name, roleNames, hideFull: link.hideFull }
}

/** The code to send with a sign-up: the link exists (even if its roles are gone), else none. */
export function attributionCode(filter: GroupFilter): string | null {
  return filter.kind === "empty" || filter.kind === "filtered" ? filter.code : null
}

type FilterableShift = { id: string; roleName: string; status: string }

/**
 * The shifts the page shows for a filter. `keep` (held or selected by the visitor) are always shown,
 * even of another role or full: a visitor never loses sight of their own shifts.
 */
export function shiftsForGroup<S extends FilterableShift>(shifts: S[], filter: GroupFilter, keep: Set<string> = new Set()): S[] {
  if (filter.kind !== "filtered") return shifts
  const roles = new Set(filter.roleNames)
  return shifts.filter((s) => keep.has(s.id) || (roles.has(s.roleName) && !(filter.hideFull && s.status === "full")))
}

/** The visible line of a filtered page, e.g. « Lien de l'Amicale des pompiers : seuls ses postes sont affichés. » */
export function groupFilterLine(name: string, roleCount: number): string {
  return roleCount > 1
    ? `Lien « ${name} » : seuls ses ${roleCount} postes sont affichés.`
    : `Lien « ${name} » : seul son poste est affiché.`
}

/** Said when the filter can't apply: a short notice, never an error page. */
export function groupFilterNotice(filter: GroupFilter): string | null {
  if (filter.kind === "unknown") return "Ce lien de groupe n'existe plus : tous les postes de l'événement sont affichés."
  if (filter.kind === "empty") return `Les postes du lien « ${filter.name} » ne sont plus au planning : tous les postes de l'événement sont affichés.`
  return null
}

/**
 * Announced after « Voir tous les postes » or « Revenir aux postes du lien ». No count: past days
 * and the month view of long events make any total differ from what is on screen.
 */
export function groupToggleAnnouncement(showAll: boolean, name: string): string {
  return showAll ? "Tous les postes de l'événement sont affichés." : `Seuls les postes du lien « ${name} » sont affichés.`
}

/** Sign-ups a link brought: live registrations and distinct people. */
export function groupLinkStats(registrations: { groupLinkId: string | null; volunteerId: string }[]): Map<string, { registrations: number; people: number }> {
  const people = new Map<string, Set<string>>()
  const count = new Map<string, number>()
  for (const r of registrations) {
    if (!r.groupLinkId) continue
    count.set(r.groupLinkId, (count.get(r.groupLinkId) ?? 0) + 1)
    const set = people.get(r.groupLinkId) ?? new Set<string>()
    set.add(r.volunteerId)
    people.set(r.groupLinkId, set)
  }
  return new Map([...count].map(([id, n]) => [id, { registrations: n, people: people.get(id)!.size }]))
}

/** « 3 personnes inscrites, 5 créneaux », « Aucune inscription pour l'instant ». */
export function groupLinkStatsText(stats: { registrations: number; people: number } | undefined): string {
  if (!stats || stats.registrations === 0) return "Aucune inscription pour l'instant"
  const p = stats.people
  const r = stats.registrations
  return `${p} personne${p > 1 ? "s" : ""} inscrite${p > 1 ? "s" : ""}, ${r} créneau${r > 1 ? "x" : ""}`
}

/** Which roles of the link are no longer on the schedule (said in the admin list). */
export function missingRoles(roleNames: string[], liveRoleNames: string[]): string[] {
  const live = new Set(liveRoleNames)
  return roleNames.filter((n) => !live.has(n))
}

/** A file name for the QR code: `fete-du-village-amicale-des-pompiers-qr`. */
export function groupQrFileStem(eventSlug: string, name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return slug ? `${eventSlug}-${slug}-qr` : `${eventSlug}-qr`
}

export type RegistrationGroupFilter = "" | "none" | string

/** Registrations page filter « Par lien de groupe »: "" all, "none" without a group link, else a link id. */
export function matchesGroupFilter(groupLinkId: string | null | undefined, filter: RegistrationGroupFilter): boolean {
  if (!filter) return true
  if (filter === "none") return !groupLinkId
  return groupLinkId === filter
}
