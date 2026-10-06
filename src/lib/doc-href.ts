// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** A documentation unit slug: lower case letters and digits, separated by single hyphens. */
export const DOC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The path of a documentation unit. Slugs come from file names in `guide/` and are already
 * validated when the units load; checking again here keeps every link built from them a plain
 * `/doc/<slug>` path, whatever ends up in the value (no other scheme, no other path).
 */
export function docUnitHref(slug: string): string {
  if (!DOC_SLUG_RE.test(slug)) throw new Error(`Invalid documentation slug: ${JSON.stringify(slug)}`)
  return `/doc/${encodeURIComponent(slug)}`
}
