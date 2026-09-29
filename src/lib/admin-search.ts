// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Admin global search (#377): what a query matches, as Prisma `where` clauses. Every word must
 * match (AND), each in any of the searched fields (OR), case-insensitively. Accents aren't folded
 * yet: « Zoe » doesn't find « Zoé ».
 */

export const SEARCH_MAX_LENGTH = 100
export const SEARCH_MAX_TERMS = 5
/** Results shown per group; one more is read to know whether there are others. */
export const SEARCH_GROUP_LIMIT = 20

/** Words of a query: trimmed, capped in length and count, duplicates removed. */
export function searchTerms(query: string | null | undefined): string[] {
  const words = (query ?? "").slice(0, SEARCH_MAX_LENGTH).trim().split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  const terms: string[] = []
  for (const w of words) {
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    terms.push(w)
    if (terms.length === SEARCH_MAX_TERMS) break
  }
  return terms
}

type Contains = { contains: string; mode: "insensitive" }
const contains = (term: string): Contains => ({ contains: term, mode: "insensitive" })

/** AND over terms of an OR over fields. */
function everyTermInSomeField(terms: string[], fields: string[]) {
  return { AND: terms.map((t) => ({ OR: fields.map((f) => ({ [f]: contains(t) })) })) }
}

export const VOLUNTEER_FIELDS = ["firstName", "lastName", "email", "phone"]
export const EVENT_FIELDS = ["title", "location", "slug"]
export const SHIFT_FIELDS = ["roleName", "label"]

export function volunteerWhere(terms: string[]) {
  return everyTermInSomeField(terms, VOLUNTEER_FIELDS)
}

export function eventWhere(terms: string[]) {
  return everyTermInSomeField(terms, EVENT_FIELDS)
}

/** Shifts of a non-cancelled status; a word may also match the event title (« Fête bar »). */
export function shiftWhere(terms: string[]) {
  return {
    status: { not: "cancelled" },
    AND: terms.map((t) => ({ OR: [...SHIFT_FIELDS.map((f) => ({ [f]: contains(t) })), { event: { title: contains(t) } }] })),
  }
}

/** Live registrations (active, waitlist, offered) of the volunteers matching the query. */
export function registrationWhere(terms: string[]) {
  return { status: { in: ["active", "waiting", "offered"] }, volunteer: volunteerWhere(terms) }
}

/** Value for the members page `?q=` that singles out this volunteer. */
export function memberQuery(v: { firstName: string; lastName: string; email: string | null }): string {
  return v.email ?? `${v.firstName} ${v.lastName}`
}

export function membersHref(v: { firstName: string; lastName: string; email: string | null }): string {
  return `/admin/members?q=${encodeURIComponent(memberQuery(v))}`
}

export function registrationsHref(eventId: string, v: { firstName: string; lastName: string; email: string | null }): string {
  return `/admin/events/${eventId}/registrations?q=${encodeURIComponent(memberQuery(v))}`
}

export function shiftHref(eventId: string, shiftId: string): string {
  return `/admin/events/${eventId}/registrations?shift=${encodeURIComponent(shiftId)}`
}

/** First `limit` rows, and whether more were found (the query reads `limit + 1`). */
export function capped<T>(rows: T[], limit: number = SEARCH_GROUP_LIMIT): { items: T[]; more: boolean } {
  return { items: rows.slice(0, limit), more: rows.length > limit }
}
