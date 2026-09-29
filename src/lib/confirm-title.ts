// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Loose comparison used to confirm a destructive action by typing an event
 * title: case, accents, repeated spaces and surrounding spaces are ignored, so
 * a title with accents is not painful to retype. Shared by the UI and the API.
 */
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export function titlesMatch(typed: string, actual: string): boolean {
  const expected = normalizeTitle(actual)
  return expected.length > 0 && normalizeTitle(typed) === expected
}
