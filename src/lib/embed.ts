// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The sign-up embedded on the association's own website (#948): the public page of an event with
 * `?embed=1`, in an iframe of any site. Pure and client-safe (no Prisma, no Node API): the proxy,
 * the public pages and the admin panel import it.
 *
 * Only that variant may be framed (src/lib/security-headers.ts); it keeps the organisation's
 * branding and the whole sign-up, drops the site's header and footer, and opens what leaves the
 * flow (personal link, legal pages, event pages) in a new tab.
 */

/** Said after a link that opens in a new tab, masked visually (DESIGN.md, « Pied de page public »). */
export const NEW_TAB_HINT = "(ouvre dans un nouvel onglet)"

/** URL parameter of the embeddable variant: `/<event>?embed=1`. */
export const EMBED_PARAM = "embed"

/** Whether a URL parameter asks for the embeddable variant: exactly `1`, nothing else. */
export function isEmbedMode(raw: string | string[] | null | undefined): boolean {
  return (Array.isArray(raw) ? raw[0] : raw) === "1"
}

/**
 * `postMessage` type of the height the embedded page sends to the site around it, for the
 * optional auto-resize. Namespaced, and the payload is a number only: nothing about the volunteer
 * or the event ever leaves the frame that way, so any target origin may receive it.
 */
export const EMBED_HEIGHT_MESSAGE = "benevol:embed-height"

/** Below and above these heights, the snippet's listener ignores the message. */
export const EMBED_MIN_HEIGHT = 200
export const EMBED_MAX_HEIGHT = 20_000

/** The fixed height of the snippet, in CSS pixels, when the auto-resize is not used. */
export const EMBED_DEFAULT_HEIGHT = 900

/** The message the embedded page posts to its parent: its type and its height, rounded up. */
export function embedHeightMessage(height: number): { type: typeof EMBED_HEIGHT_MESSAGE; height: number } {
  return { type: EMBED_HEIGHT_MESSAGE, height: Math.ceil(height) }
}

/** The height an incoming message carries, or null when it is not ours or out of bounds. */
export function readEmbedHeight(data: unknown): number | null {
  if (!data || typeof data !== "object") return null
  const { type, height } = data as { type?: unknown; height?: unknown }
  if (type !== EMBED_HEIGHT_MESSAGE || typeof height !== "number" || !Number.isFinite(height)) return null
  if (height < EMBED_MIN_HEIGHT || height > EMBED_MAX_HEIGHT) return null
  return Math.ceil(height)
}

/**
 * CSS variables of the part of the embedded page the visitor sees (EmbedFrame): ModalShell opens
 * its dialogs in that band. Absent outside a frame, where the dialogs fill the window as usual.
 */
export const EMBED_VIEW_TOP_VAR = "--embed-view-top"
export const EMBED_VIEW_HEIGHT_VAR = "--embed-view-height"

/** Below this visible height, the band grows (within the frame) so that a dialog still fits. */
export const EMBED_MIN_BAND = 320

/**
 * The band where a dialog opens: the visible part of the frame, from its intersection with the
 * visitor's screen, at least EMBED_MIN_BAND tall (or the frame's height when smaller), never
 * outside the frame. Rounded to whole pixels.
 */
export function visibleBand(rect: { top: number; height: number }, frameHeight: number): { top: number; height: number } {
  const minimum = Math.min(EMBED_MIN_BAND, frameHeight)
  if (rect.height <= 0) return { top: 0, height: Math.round(frameHeight) }
  const height = Math.max(rect.height, minimum)
  const top = Math.min(Math.max(0, rect.top), Math.max(0, frameHeight - height))
  return { top: Math.round(top), height: Math.round(height) }
}

/** The element EmbedFrame measures: the content of the embedded page. */
export const EMBED_ROOT_ATTRIBUTE = "data-embed-root"

function writeBand(rect: { top: number; height: number }) {
  const band = visibleBand(rect, window.innerHeight)
  document.documentElement.style.setProperty(EMBED_VIEW_TOP_VAR, `${band.top}px`)
  document.documentElement.style.setProperty(EMBED_VIEW_HEIGHT_VAR, `${band.height}px`)
}

/**
 * Measures the visible band again, once: a dialog opening in the embedded page calls it
 * (ModalShell). The observer of EmbedFrame only hears of a change of the visible share, and
 * scrolling the site around a tall frame can move the band without changing its share. Does
 * nothing outside the embedded page.
 */
export function measureEmbedBand(): void {
  if (typeof document === "undefined" || typeof IntersectionObserver === "undefined") return
  const root = document.querySelector(`[${EMBED_ROOT_ATTRIBUTE}]`)
  if (!root || window.parent === window) return
  const once = new IntersectionObserver(([entry]) => {
    once.disconnect()
    if (entry) writeBand(entry.intersectionRect)
  })
  once.observe(root)
}

/** Keeps the band of EmbedFrame's own observer. */
export function updateEmbedBand(rect: { top: number; height: number }): void {
  writeBand(rect)
}

// « Revenir au planning » from the embedded confirmation (#948): a client-side navigation, the
// event page then puts the focus on its title (the link that had it is gone). Module state, not
// storage: the frame may have none.
let returnToSchedule = false
export function markReturnToSchedule(): void {
  returnToSchedule = true
}
export function takeReturnToSchedule(): boolean {
  const pending = returnToSchedule
  returnToSchedule = false
  return pending
}

/** The embeddable address of an event: its public URL with `embed=1`, and a group link's code. */
export function embedUrl(publicUrl: string, groupCode?: string | null): string {
  const url = new URL(publicUrl)
  if (groupCode) url.searchParams.set("groupe", groupCode)
  url.searchParams.set(EMBED_PARAM, "1")
  return url.toString()
}

/**
 * The parameters the embedded flow carries from page to page (event → confirmation → back to the
 * schedule): the group link (#947), the organisation when it is not in the host (`?org=`, local
 * runs), and `embed=1`. Nothing else of the current address (an invitation token stays out).
 */
export function embedFlowParams(current: URLSearchParams): URLSearchParams {
  const kept = new URLSearchParams()
  for (const key of ["org", "groupe"]) {
    const value = current.get(key)
    if (value) kept.set(key, value)
  }
  kept.set(EMBED_PARAM, "1")
  return kept
}

/** Said on the embedded confirmation: the personal link is in the email, outside the frame too. */
export const EMBED_PERSONAL_LINK_NOTE =
  "L'email de confirmation contient ton lien personnel : garde-le pour modifier ou annuler ton inscription."

/** The iframe's accessible name, as the snippet sets it: what the frame holds, for a screen reader. */
export function embedFrameTitle(eventTitle: string): string {
  return `Inscription bénévoles – ${eventTitle}`
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** An element id for the snippet's iframe: letters, digits and hyphens of the event slug. */
export function embedFrameId(eventSlug: string, groupCode?: string | null): string {
  const base = `benevol-${eventSlug}${groupCode ? `-${groupCode}` : ""}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
  return base.replace(/-+$/, "")
}

/**
 * The HTML the association pastes into its site: an iframe with a fixed height by default, the
 * whole width, lazy-loaded, named for screen readers. With `autoResize`, a few lines of inline
 * script follow it: they listen for the page's height (EMBED_HEIGHT_MESSAGE), only from that
 * iframe, and set it on the frame. No third-party script is loaded.
 */
export function embedSnippet({ url, eventTitle, frameId, height = EMBED_DEFAULT_HEIGHT, autoResize = false }: {
  url: string
  eventTitle: string
  frameId: string
  height?: number
  autoResize?: boolean
}): string {
  const iframe =
    `<iframe id="${escapeAttribute(frameId)}" src="${escapeAttribute(url)}" title="${escapeAttribute(embedFrameTitle(eventTitle))}" ` +
    `width="100%" height="${Math.round(height)}" loading="lazy" style="border:0;width:100%;max-width:100%"></iframe>`
  if (!autoResize) return iframe
  const id = JSON.stringify(frameId)
  const script = [
    "<script>",
    "window.addEventListener(\"message\", function (e) {",
    `  var f = document.getElementById(${id});`,
    "  var d = e.data;",
    `  if (!f || e.source !== f.contentWindow || !d || d.type !== "${EMBED_HEIGHT_MESSAGE}") return;`,
    `  if (typeof d.height === "number" && d.height >= ${EMBED_MIN_HEIGHT} && d.height <= ${EMBED_MAX_HEIGHT}) f.style.height = Math.ceil(d.height) + "px";`,
    "});",
    "</script>",
  ].join("\n")
  return `${iframe}\n${script}`
}
