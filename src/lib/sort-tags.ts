// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The tags offered in a filter, once each, in French alphabetical order. A bare `.sort()` orders by
 * code unit: « Électricien » came after « zone » and « buvette » after « Sécurité ».
 */
export function sortTags(tags: Iterable<string>): string[] {
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b, "fr"))
}
