// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * French typography for rendered text (#1341): the space after « and before », and before
 * : ; ! ?, becomes a non-breaking space, so a quotation mark or a colon never starts a line on
 * its own. Authors keep typing ordinary spaces in the Markdown sources; the renderer applies this
 * to plain text only (src/lib/event-page-markdown.ts), never to code or link addresses.
 *
 * U+00A0, the non-breaking space the interface already used for its own quotation marks,
 * rather than the narrow U+202F, which some fonts and older systems draw as a missing glyph.
 */
export const NBSP = "\u00a0"

/** French quotes keep their words on the same line: « x » with non-breaking spaces inside. */
export function nbspQuotes(text: string): string {
  return text.replace(/« +/g, `«${NBSP}`).replace(/ +»/g, `${NBSP}»`)
}

export function frenchSpacing(text: string): string {
  return nbspQuotes(text)
    // Only a space between a word (or a closing quote/bracket) and the mark: « 10 : 30 » in a
    // time stays, a smiley « :) » or a URL-like « a ://b » does not exist in prose anyway.
    .replace(/([^\s]) +([:;!?])(?=\s|$|[»)\].,])/g, `$1${NBSP}$2`)
    // A text piece that starts with the space: the word before it is a link or emphasis, a
    // separate token (« [Publier](…) : c'est tout »).
    .replace(/^ +([:;!?])(?=\s|$)/, `${NBSP}$1`)
}
