// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A public page written in its page.tsx (the legal pages) as the Markdown of /llms-full.txt: the
 * route renders the page, so the text is the one the site shows, then this flattens the HTML.
 * Headings, paragraphs, list items and table cells keep their reading order; scripts (the page's
 * JSON-LD) and presentational markup don't. Pure: the route passes the rendered HTML.
 */
export function pageHtmlToMarkdown(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, content: string) => `[${inline(content)}](${href})`)
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_match, content: string) => `**${inline(content)}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_match, content: string) => `*${inline(content)}*`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, content: string) => `\`${inline(content)}\``)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, content: string) => `\n\n${"#".repeat(Number(level))} ${inline(content)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content: string) => `\n- ${inline(content)}`)
    .replace(/<\/t[dh]>/gi, " |")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|ul|ol|table|thead|tbody)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** The text of an inline fragment: its tags go, its entities become characters, its spaces one space. */
function inline(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

/** `&#x27;`, `&#233;`, `&amp;`… as the characters they stand for. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#x")) return codePoint(parseInt(code.slice(2), 16), match)
    if (code.startsWith("#")) return codePoint(Number(code.slice(1)), match)
    return NAMED_ENTITIES[code.toLowerCase()] ?? match
  })
}

function codePoint(value: number, fallback: string): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : fallback
}
