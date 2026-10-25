// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Which clicks on a plain link of a content page (the Markdown of the guides, the features page,
 * the blog…, rendered to HTML, so never a next/link) the content shell turns into a client
 * navigation (ContentShellRoot, src/components/public/ContentShellRoot.tsx), instead of a full
 * page load that loses the page's state and repaints the whole page.
 *
 * Only an ordinary activation: primary button, no modifier key (Ctrl/Cmd/Shift/Alt keep opening a
 * new tab or window, or downloading), no `target` other than `_self`, no `download`, no
 * `rel="external"`, not already handled (a next/link calls preventDefault first). Only a link to another public content page of
 * this site: same origin, a public page's path or a page of a content section (/doc, /blog,
 * /videos), never a file (feed.xml, og-image.png: a route handler, not a page). A link to the page
 * itself, with or without a #fragment, stays native: the browser jumps to the anchor, moves the
 * focus starting point and fires `hashchange` (LegacyAnchorRedirect, src/app/doc).
 */

/** Sections whose every page (not file) is a content page: the guides and their units, the blog, the video library. */
export const CONTENT_SECTIONS = ["/doc", "/blog", "/videos"] as const

export type LinkClick = {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}

export type LinkAttributes = {
  /** The raw href attribute (relative or absolute). */
  href: string | null
  target: string | null
  download: boolean
  /** The rel attribute: `external` keeps the browser's own navigation. */
  rel: string | null
}

/** Whether a pathname is a public content page: one of `pages`, or a page of a content section. */
export function isContentPath(pathname: string, pages: readonly string[]): boolean {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1)
  if (last.includes(".")) return false
  if (pages.includes(pathname)) return true
  return CONTENT_SECTIONS.some((section) => pathname === section || pathname.startsWith(`${section}/`))
}

/**
 * The URL (path, query and fragment) to push for this click, or null to let the browser follow
 * the link itself. `current` is the page's own URL (location.href).
 */
export function clientNavigationTarget(click: LinkClick, link: LinkAttributes, current: string, pages: readonly string[]): string | null {
  if (click.defaultPrevented || click.button !== 0) return null
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null
  if (link.download || link.href === null) return null
  if (link.rel && link.rel.toLowerCase().split(/\s+/).includes("external")) return null
  if (link.target && link.target.toLowerCase() !== "_self") return null
  let url: URL
  let here: URL
  try {
    here = new URL(current)
    url = new URL(link.href, here)
  } catch {
    return null
  }
  if (url.origin !== here.origin || (url.protocol !== "http:" && url.protocol !== "https:")) return null
  if (url.pathname === here.pathname && url.search === here.search) return null
  if (!isContentPath(url.pathname, pages)) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Where the focus goes once a client navigation between content pages has rendered the new page
 * (a full load starts from the top of the document; a client navigation would otherwise leave it on
 * <body>, near the removed link): the element the URL's #fragment names, if the page has it, else
 * the page's <main> (`mainId`, the skip link's target). `exists` tells whether an id is on the page.
 */
export function navigationFocusTarget(hash: string, exists: (id: string) => boolean, mainId: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  if (!raw) return mainId
  let id: string
  try {
    id = decodeURIComponent(raw)
  } catch {
    id = raw
  }
  return exists(id) ? id : mainId
}
