// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Accent and case folding for the admin's client-side filters (#390): « zoe » matches « Zoé »,
 * « francois » matches « François ». The server-side global search does the same with Postgres
 * `unaccent`, see admin-search.ts.
 */
export function fold(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/** True when the folded haystack contains the folded needle; an empty needle matches everything. */
export function foldedIncludes(haystack: string | null | undefined, needle: string): boolean {
  return fold(haystack).includes(fold(needle))
}
