// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Length limits of the public pages' <title> and meta description. Search engines cut a snippet
 * around 160 characters and a title around 65; under 70 characters a description says too little
 * to be shown as is.
 *
 * SEO audit tools (AIOSEO among them) do not count characters: they count the bytes of the
 * attribute as served, after HTML escaping (React writes `'` as `&#x27;`, six bytes) and in
 * UTF-8 (`é` and `’` are two and three bytes). A French description of 160 characters can so be
 * reported at 171. `auditedLength` measures it their way, so a description that passes here
 * passes both.
 */

export const META_TITLE_MAX = 65
export const META_DESCRIPTION_MIN = 70
export const META_DESCRIPTION_MAX = 160

/** The text as React escapes it in an attribute. */
function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")
}

/** Length of a meta content as SEO audit tools measure it: UTF-8 bytes of the escaped attribute. */
export function auditedLength(text: string): number {
  return new TextEncoder().encode(escapeAttribute(text)).length
}

/** What is wrong with a page's title and description, empty when both fit. */
export function metaLengthProblems(title: string, description: string): string[] {
  const problems: string[] = []
  if (title.length > META_TITLE_MAX) problems.push(`title: ${title.length} characters (max ${META_TITLE_MAX})`)
  if (description.length < META_DESCRIPTION_MIN) problems.push(`description: ${description.length} characters (min ${META_DESCRIPTION_MIN})`)
  if (description.length > META_DESCRIPTION_MAX) problems.push(`description: ${description.length} characters (max ${META_DESCRIPTION_MAX})`)
  const audited = auditedLength(description)
  if (audited > META_DESCRIPTION_MAX) problems.push(`description: ${audited} as audited, escaped UTF-8 bytes (max ${META_DESCRIPTION_MAX})`)
  return problems
}
