// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Admin global search (#377): what a query matches. Every word must match (AND), each in any of
 * the searched fields (OR), regardless of case and accents (#390): « zoe » finds « Zoé ».
 *
 * Accent folding needs Postgres `unaccent`, which Prisma's `contains` can't express, so the
 * matching runs as raw SQL that selects ids (admin-search-sql.ts, server only: this module is
 * also imported by client components), with the organization filter written explicitly. The
 * rows themselves are then read by the organization-scoped client, which applies the same
 * filter a second time.
 */

export const SEARCH_MAX_LENGTH = 100
export const SEARCH_MAX_TERMS = 5
/** Results shown per group; one more is read to know whether there are others. */
export const SEARCH_GROUP_LIMIT = 20
/** Ids read by the raw match before the scoped read orders and caps them. */
export const SEARCH_ID_LIMIT = 500

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

/** `%term%` with LIKE's own wildcards escaped (the queries use `ESCAPE '\'`). */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** Live registrations (active, waitlist, offered) of the matched volunteers. */
export function registrationWhere(volunteerIds: string[]) {
  return { status: { in: ["active", "waiting", "offered"] }, volunteerId: { in: volunteerIds } }
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
