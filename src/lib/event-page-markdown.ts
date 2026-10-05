// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Renders admin-authored Markdown for custom event pages (issue #188) to safe HTML for the
 * public page. Distinct from src/lib/markdown.ts's `renderMarkdown` (a minimal inline-styled
 * subset used for emails and the confirmation message, with {{variable}} interpolation) — event
 * pages are static, richer content (headings, tables, code blocks), not email bodies, and never
 * interpolate variables (see issue #188's decision: no visitor identity on the public page to
 * personalize with).
 *
 * Sanitized at render time, not on write, so a stricter allowlist can be adopted later without
 * needing to re-process already-stored content.
 *
 * Admins are trusted within their own org today (the charte and public instructions are already
 * admin-authored, unescaped free text) — but `marked` parses raw inline HTML in Markdown by
 * default, and a stored, unsanitized `<script>` here would run for every visitor of the public
 * page, not just admins. DOMPurify strips anything outside a plain-content allowlist regardless
 * of what an admin (or a compromised admin account) wrote.
 */
import { marked, Renderer } from "marked"
import DOMPurify from "isomorphic-dompurify"
import { createHeadingSlugger } from "@/lib/heading-anchors"

// Page title is already rendered as the page's own <h1> (see [eventSlug]/[pageSlug]/page.tsx).
// Shift every Markdown heading down one level so admin content can't produce a second/duplicate
// <h1>, capping at h6 since HTML has no deeper level. Only correct when the source's own
// top-level "# Title" is left in place (it becomes the shifted <h2>) — callers that strip that
// line themselves (see src/app/doc/*/page.tsx, whose *remaining* headings already start at ##
// and should render at their literal depth) must pass shiftHeadings: false, or every section
// loses a level (## → h3, ### → h4, ...) with no h2 ever appearing.
//
// headingIds (#568) gives each heading a stable id, the slug of its text (src/lib/heading-anchors.ts),
// so a link can point to a section: /doc/admin#configurer-les-creneaux. Only the public content
// pages rendered from the repo's own Markdown ask for it; admin-authored event pages don't get ids
// (nothing links into them, and their ids could collide with the page's own).
function makeRenderer(shiftHeadings: boolean, headingIds: boolean): Renderer {
  const renderer = new Renderer()
  const slug = createHeadingSlugger()
  renderer.heading = function ({ tokens, depth }) {
    const level = Math.min(shiftHeadings ? depth + 1 : depth, 6)
    const text = this.parser.parseInline(tokens)
    const id = headingIds ? ` id="${slug(this.parser.parseInline(tokens, this.parser.textRenderer))}"` : ""
    return `<h${level}${id}>${text}</h${level}>\n`
  }
  return renderer
}

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "del", "code", "pre",
  "ul", "ol", "li",
  "a", "blockquote", "img",
  "table", "thead", "tbody", "tr", "th", "td",
]
// img needs its own alt text (WCAG 1.1.1) — Markdown's ![alt](src) already forces authors to
// supply one syntactically, but DOMPurify still needs "alt" allowlisted for it to survive.
const ALLOWED_ATTR = ["href", "title", "src", "alt", "width", "height"]

export function renderEventPageMarkdown(content: string, options: { shiftHeadings?: boolean; headingIds?: boolean } = {}): string {
  const { shiftHeadings = true, headingIds = false } = options
  const html = marked.parse(content, { async: false, gfm: true, breaks: true, renderer: makeRenderer(shiftHeadings, headingIds) })
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: headingIds ? [...ALLOWED_ATTR, "id"] : ALLOWED_ATTR })
}
