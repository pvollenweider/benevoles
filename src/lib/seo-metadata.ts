// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata, Viewport } from "next"

/**
 * The metadata of a public page of the apex site (features, documentation, legal pages): one
 * builder, so every page gives search engines and link previews (WhatsApp, X, Facebook, LinkedIn,
 * Slack, iMessage, Signal, Telegram) the same complete set: its own title and description, an
 * absolute canonical, Open Graph with its social card (1200 x 630, src/app/og-image.png/[...page]),
 * the large Twitter card, and indexing. Pure: the base URL is passed in, read per request by the
 * page (src/lib/urls.ts), never at build time.
 */

export const SITE_NAME = "benevol.app"

/** The site's locale for Open Graph: French, as written in Switzerland (the publisher's). */
export const OG_LOCALE = "fr_CH"

/** Size and type of every social card. */
export const SOCIAL_IMAGE = { width: 1200, height: 630, type: "image/png" } as const

/** « Title | benevol.app »: the site name after a vertical bar, never an em dash (copy rules). */
export function pageTitle(title: string): string {
  return `${title} | ${SITE_NAME}`
}

const rootOf = (base: string) => base.replace(/\/+$/, "")

/** Absolute URL of a page on the apex host: `/` stays `https://www.benevol.app/`. */
export function absoluteUrl(base: string, pagePath: string): string {
  return `${rootOf(base)}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`
}

/** Path of a page's own social card: `/doc/admin` has `/og-image.png/doc/admin`. */
export function socialImagePath(pagePath: string): string {
  return `/og-image.png${pagePath === "/" ? "" : pagePath}`
}

/** Search engines may show a large image preview and a full snippet of the public pages. */
export const INDEXABLE: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
}

export type SeoPage = {
  /** Base URL of the apex host, e.g. https://www.benevol.app. */
  base: string
  /** Path of the page, e.g. /doc/admin. */
  path: string
  /** The page's own title, without the site name (added here). */
  title: string
  /** Meta and social description. */
  description: string
  /** `article` for a documentation unit, `website` for every other page. */
  type: "website" | "article"
  /** Text alternative of the social card. */
  imageAlt: string
  /** An article's section (the unit's group). */
  section?: string
  /** An article's last change, when known. */
  modifiedTime?: Date | null
}

export function seoMetadata(page: SeoPage): Metadata {
  const url = absoluteUrl(page.base, page.path)
  const title = pageTitle(page.title)
  const description = page.description
  const image = { url: absoluteUrl(page.base, socialImagePath(page.path)), ...SOCIAL_IMAGE, alt: page.imageAlt }
  const common = { siteName: SITE_NAME, locale: OG_LOCALE, url, title, description, images: [image] }
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph:
      page.type === "article"
        ? {
            ...common,
            type: "article",
            ...(page.section ? { section: page.section } : {}),
            ...(page.modifiedTime ? { modifiedTime: page.modifiedTime.toISOString() } : {}),
          }
        : { ...common, type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    robots: INDEXABLE,
  }
}

/**
 * The browser bar of the content pages (features, documentation, accessibility) takes the colour
 * of their header: white, or the dark theme's gray-900 (src/components/public/ContentShell.tsx).
 */
export const CONTENT_VIEWPORT: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
}
