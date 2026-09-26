/**
 * Markdown renderer for emails and other raw-HTML contexts (product-update broadcasts,
 * confirmation messages) — inline styles throughout, never CSS classes or a <style> block, since
 * most email clients strip or ignore both.
 *
 * Built on `marked` (already used by src/lib/event-page-markdown.ts for public event pages) with
 * a custom Renderer, rather than the previous hand-rolled regex parser, which only covered
 * **bold**, [links](url) and `- ` bullets. Now covers CommonMark ("basic syntax") in full, plus
 * the GFM extensions marked ships with ("extended syntax": tables, ~~strikethrough~~, task lists,
 * autolinks) — see https://www.markdownguide.org/basic-syntax/ and /extended-syntax/. Footnotes
 * and definition lists (also "extended syntax") aren't part of CommonMark/GFM and would need a
 * separate marked extension; not added here.
 *
 * Sanitized with the same DOMPurify approach as event-page-markdown.ts: this renders
 * admin-authored content (an event's confirmation message, or a super-admin's product-update
 * broadcast sent to every org's admins) that isn't visitor input, but `marked` still parses raw
 * inline HTML in the Markdown source by default, so unsanitized admin-authored HTML could still
 * carry a stored XSS payload into every recipient's inbox. `style` is allowlisted so this
 * renderer's own hardcoded inline styles survive — DOMPurify still strips dangerous CSS
 * constructs (expression(), javascript: urls, etc.) from any style attribute an admin typed
 * directly, the same way it already does for href.
 */
import { marked, Renderer, type Tokens } from "marked"
import DOMPurify from "isomorphic-dompurify"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const HEADING_SIZES: Record<number, string> = {
  1: "1.5em", 2: "1.3em", 3: "1.15em", 4: "1em", 5: "0.9em", 6: "0.85em",
}

function makeRenderer(): Renderer {
  const r = new Renderer()

  // Raw HTML written directly in the Markdown source (e.g. an admin typing <p style="..."> by
  // hand) is rendered as literal escaped text, never live markup. Without this, DOMPurify seeing
  // `style` in ALLOWED_ATTR (needed below for this renderer's own hardcoded styles) would let an
  // admin-authored style attribute through too — and DOMPurify does not deeply sanitize CSS
  // property values inside a style attribute the way it does href. Every element this renderer
  // actually emits (heading, paragraph, table, ...) sets its own style from a fixed string
  // literal here, never from admin-supplied text, so this doesn't remove any real capability —
  // only raw HTML embedding, which was never advertised as supported syntax anyway.
  r.html = function ({ text }: Tokens.HTML | Tokens.Tag) {
    return escapeHtml(text)
  }

  r.heading = function ({ tokens, depth }: Tokens.Heading) {
    const size = HEADING_SIZES[depth] ?? "1em"
    return `<h${depth} style="font-size:${size};font-weight:600;margin:0.75em 0 0.35em;line-height:1.3">${this.parser.parseInline(tokens)}</h${depth}>\n`
  }

  r.paragraph = function ({ tokens }: Tokens.Paragraph) {
    return `<p style="margin:0.5em 0">${this.parser.parseInline(tokens)}</p>\n`
  }

  r.strong = function ({ tokens }: Tokens.Strong) {
    return `<strong>${this.parser.parseInline(tokens)}</strong>`
  }

  r.em = function ({ tokens }: Tokens.Em) {
    return `<em>${this.parser.parseInline(tokens)}</em>`
  }

  r.del = function ({ tokens }: Tokens.Del) {
    return `<del>${this.parser.parseInline(tokens)}</del>`
  }

  r.codespan = function ({ text }: Tokens.Codespan) {
    return `<code style="background:#f3f4f6;padding:0.15em 0.35em;border-radius:4px;font-family:ui-monospace,monospace;font-size:0.9em">${escapeHtml(text)}</code>`
  }

  r.code = function ({ text, lang }: Tokens.Code) {
    return `<pre style="background:#f3f4f6;border-radius:8px;padding:0.75em 1em;overflow-x:auto;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:0.85em"><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}>${escapeHtml(text)}</code></pre>\n`
  }

  r.blockquote = function ({ tokens }: Tokens.Blockquote) {
    return `<blockquote style="margin:0.5em 0;padding:0.25em 1em;border-left:3px solid #d1d5db;color:#4b5563">${this.parser.parse(tokens)}</blockquote>\n`
  }

  r.hr = function () {
    return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:1em 0">\n`
  }

  r.list = function (token: Tokens.List) {
    const tag = token.ordered ? "ol" : "ul"
    const items = token.items.map((item) => this.listitem(item)).join("")
    return `<${tag} style="margin:0.5em 0;padding-left:1.4em">${items}</${tag}>\n`
  }

  r.listitem = function (item: Tokens.ListItem) {
    // Matches marked's own default listitem exactly (just adds the inline style): parser.parse()
    // already handles tight-vs-loose spacing per item, and dispatches a leading "checkbox" token
    // (inserted by the tokenizer for GFM task-list items) to renderer.checkbox() on its own — no
    // need to special-case item.task/item.checked here.
    return `<li style="margin:0.2em 0">${this.parser.parse(item.tokens)}</li>\n`
  }

  r.checkbox = function ({ checked }: Tokens.Checkbox) {
    return `<input type="checkbox" disabled ${checked ? "checked" : ""} style="margin-right:0.4em"> `
  }

  r.link = function ({ href, title, tokens }: Tokens.Link) {
    return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""} style="color:#2563eb;text-decoration:underline">${this.parser.parseInline(tokens)}</a>`
  }

  r.image = function ({ href, title, text }: Tokens.Image) {
    return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""} style="max-width:100%;border-radius:8px">`
  }

  r.table = function (token: Tokens.Table) {
    const alignStyle = (align: "center" | "left" | "right" | null) => align ? `text-align:${align};` : ""
    const headerCells = token.header.map((cell) =>
      `<th style="${alignStyle(cell.align)}border:1px solid #e5e7eb;padding:0.4em 0.7em;background:#f9fafb;font-weight:600">${this.parser.parseInline(cell.tokens)}</th>`
    ).join("")
    const bodyRows = token.rows.map((row) =>
      `<tr>${row.map((cell) =>
        `<td style="${alignStyle(cell.align)}border:1px solid #e5e7eb;padding:0.4em 0.7em">${this.parser.parseInline(cell.tokens)}</td>`
      ).join("")}</tr>`
    ).join("")
    return `<table style="border-collapse:collapse;margin:0.5em 0;width:100%"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>\n`
  }

  return r
}

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "del", "code", "pre",
  "ul", "ol", "li", "input",
  "a", "blockquote", "img",
  "table", "thead", "tbody", "tr", "th", "td",
]
const ALLOWED_ATTR = ["href", "title", "src", "alt", "style", "type", "checked", "disabled", "data-lang"]

/**
 * Renders Markdown (CommonMark + GFM tables/strikethrough/task-lists/autolinks) to HTML with
 * inline styles, for use in emails and other raw-HTML contexts. Sanitized with DOMPurify.
 */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false, gfm: true, breaks: true, renderer: makeRenderer() })
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

/**
 * Replaces {{prenom}}, {{créneau}}, {{date}}, {{heure}} in text with provided values.
 * Unknown keys are left as-is.
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  })
}
