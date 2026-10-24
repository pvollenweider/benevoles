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
import { marked, Renderer, type Tokens } from "marked"
import DOMPurify from "isomorphic-dompurify"
import { createHeadingSlugger } from "@/lib/heading-anchors"
import { DOC_VIDEO_ATTRIBUTE, videoReferenceId } from "@/lib/doc-video-references"

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
//
// videoCard (#645) turns a `<!-- video: ID -->` line of the repo's own Markdown into the HTML the
// caller returns for that id (src/lib/doc-video-references.ts), "" to render nothing. Only block
// HTML on its own line counts; any other raw HTML is left to DOMPurify, as before.
//
// image (#759 F2) draws each Markdown image itself, given its index in the page (0 for the first):
// the repo's documentation gives its screenshots their size and lazy loading (src/lib/doc-images.ts).
// Admin-authored event pages keep marked's own <img>.
//
// exampleQuotes turns a blockquote of the repo's own documentation that ends with a caption marked
// by an asterisk (« Léa, bénévole occasionnelle* ») and the note « \\* Personnage et citation fictifs. »
// into a <figure>: the quote in its <blockquote>, the caption and the note together in its
// <figcaption>, so the figure's name says the person and the quote are invented (HTML's own pattern
// for a quote and its attribution). The asterisks only point the eye from the caption to the note:
// hidden from screen readers, which read the note as part of the caption. Any other blockquote is
// unchanged.
export type MarkdownImage = { src: string; alt: string; title?: string | null }

function makeRenderer(
  shiftHeadings: boolean,
  headingIds: boolean,
  videoCard?: (id: string) => string,
  image?: (img: MarkdownImage, index: number) => string,
  exampleQuotes = false,
): Renderer {
  const renderer = new Renderer()
  const slug = createHeadingSlugger()
  renderer.heading = function ({ tokens, depth }) {
    const level = Math.min(shiftHeadings ? depth + 1 : depth, 6)
    const text = this.parser.parseInline(tokens)
    const id = headingIds ? ` id="${slug(this.parser.parseInline(tokens, this.parser.textRenderer))}"` : ""
    return `<h${level}${id}>${text}</h${level}>\n`
  }
  if (videoCard) {
    renderer.html = ({ text, block }) => {
      const id = block ? videoReferenceId(text) : null
      return id ? videoCard(id) : text
    }
  }
  if (image) {
    let index = 0
    renderer.image = function ({ href, title, text, tokens }) {
      // Plain text for the caller to escape once: an entity written in the source (« &amp; ») is
      // decoded here, otherwise it would reach the alt attribute double-escaped.
      const alt = decodeBasicEntities(tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text)
      return image({ src: href, alt, title }, index++)
    }
  }
  if (exampleQuotes) {
    const defaultBlockquote = renderer.blockquote
    renderer.blockquote = function (token) {
      const blocks = token.tokens.filter((t) => t.type !== "space")
      const n = blocks.length
      const [caption, note] = [blocks[n - 2], blocks[n - 1]]
      if (n < 3 || caption?.type !== "paragraph" || note?.type !== "paragraph" || !isFictionNote(note.text) || !caption.text.trimEnd().endsWith("*")) {
        return defaultBlockquote.call(this, token)
      }
      const quote = this.parser.parse(blocks.slice(0, -2))
      const who = this.parser.parseInline((caption as Tokens.Paragraph).tokens).trimEnd().replace(/\*$/, "").trimEnd()
      const noteText = this.parser.parseInline((note as Tokens.Paragraph).tokens).replace(/^\*\s*/, "")
      return `<figure>\n<blockquote>\n${quote}</blockquote>\n<figcaption>\n<p>${who}<span aria-hidden="true">*</span></p>\n<p><span aria-hidden="true">* </span>${noteText}</p>\n</figcaption>\n</figure>\n`
    }
  }
  return renderer
}

/** The note under an example quote, « \\* Personnage et citation fictifs. » in the Markdown source. */
export function isFictionNote(text: string): boolean {
  return /^\\?\*\s*Personnage et citation fictifs\.?$/.test(text.trim())
}

/** The few entities marked can leave in plain text, back to their characters (&amp; last). */
function decodeBasicEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
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
// Only kept when the caller draws the images itself (`image`).
const IMAGE_LOADING_ATTR = ["loading", "decoding"]
// Only kept when the caller asks for example quotes (`exampleQuotes`).
const EXAMPLE_QUOTE_TAGS = ["figure", "figcaption", "span"]
const EXAMPLE_QUOTE_ATTR = ["aria-hidden"]

export function renderEventPageMarkdown(
  content: string,
  options: {
    shiftHeadings?: boolean
    headingIds?: boolean
    videoCard?: (id: string) => string
    image?: (img: MarkdownImage, index: number) => string
    exampleQuotes?: boolean
  } = {},
): string {
  const { shiftHeadings = true, headingIds = false, videoCard, image, exampleQuotes = false } = options
  const html = marked.parse(content, { async: false, gfm: true, breaks: true, renderer: makeRenderer(shiftHeadings, headingIds, videoCard, image, exampleQuotes) })
  const allowedAttr = [
    ...ALLOWED_ATTR,
    ...(headingIds ? ["id"] : []),
    ...(videoCard ? [DOC_VIDEO_ATTRIBUTE] : []),
    ...(image ? IMAGE_LOADING_ATTR : []),
    ...(exampleQuotes ? EXAMPLE_QUOTE_ATTR : []),
  ]
  const allowedTags = exampleQuotes ? [...ALLOWED_TAGS, ...EXAMPLE_QUOTE_TAGS] : ALLOWED_TAGS
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: allowedAttr })
}
