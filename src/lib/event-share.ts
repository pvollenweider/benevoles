// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { robotsFor, type Visibility } from "./event-visibility"
import { OG_IMAGE_ALT } from "./landing-seo"
import { OG_LOCALE, SOCIAL_IMAGE } from "./seo-metadata"

/**
 * The preview of a shared event link (#564): what WhatsApp, a newsletter or a social network shows
 * when an organizer pastes the event's public URL. Only a published event gets it; a draft or an
 * archived one keeps the minimal metadata (no title, noindex), so a guessed slug gives nothing
 * away. Everything here is already on the public page: title, description, dates. No remaining
 * places (stale in caches) and never a personal token: the URL is the event's public one.
 */

export const PREVIEW_DESCRIPTION_MAX = 200

export type EventForMetadata = Visibility & {
  title: string
  description: string | null
  /** Calendar days, stored at midnight UTC: the dates as the organization entered them. */
  startDate: Date
  endDate: Date
  organizationName: string
}

/**
 * The event's own description as one plain line: Markdown markers and line breaks removed,
 * whitespace collapsed, cut on a word boundary with « … » past `max` characters. Empty when
 * nothing readable is left.
 */
export function previewText(text: string | null | undefined, max = PREVIEW_DESCRIPTION_MAX): string {
  if (!text) return ""
  const plain = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images: keep the alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links: keep the label
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "") // headings, quotes, list items
    .replace(/(\*\*|__|\*|~~|`+)(?=\S)([^\n]*?\S)\1/g, "$2") // emphasis and inline code
    .replace(/^\s*([-*_]\s*){3,}$/gm, "") // horizontal rules
    .replace(/\s+/g, " ")
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?-]+$/, "")}…`
}

// « 1er juin », as written in French, not « 1 juin ».
const day = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("fr-FR", { timeZone: "UTC", ...opts }).replace(/^1(?=\s|$)/, "1er")

/**
 * « le 6 juin 2031 », « du 5 au 7 juin 2031 », « du 30 mai au 2 juin 2031 », « du 30 décembre 2031
 * au 2 janvier 2032 ». The dates are calendar days (midnight UTC, the day as entered in the
 * organization's time zone), so they are formatted in UTC: formatting them in a zone west of UTC
 * would give the day before.
 */
export function eventDateRange(start: Date, end: Date): string {
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }
  const s = start.toISOString().slice(0, 10)
  const e = end.toISOString().slice(0, 10)
  if (e <= s) return `le ${day(start, full)}`
  if (s.slice(0, 7) === e.slice(0, 7)) return `du ${day(start, { day: "numeric" })} au ${day(end, full)}`
  if (s.slice(0, 4) === e.slice(0, 4)) return `du ${day(start, { day: "numeric", month: "long" })} au ${day(end, full)}`
  return `du ${day(start, full)} au ${day(end, full)}`
}

/** The event description, else « {organisation} cherche des bénévoles pour {événement}, du … au … ». */
export function eventShareDescription(e: Pick<EventForMetadata, "title" | "description" | "startDate" | "endDate" | "organizationName">): string {
  return previewText(e.description) || `${e.organizationName} cherche des bénévoles pour ${e.title}, ${eventDateRange(e.startDate, e.endDate)}.`
}

/**
 * Metadata of a public event page. Published: title, description, canonical URL on the
 * organization's host, Open Graph and Twitter card with the platform's image; listed ones are
 * indexable, unlisted ones stay noindex with the same preview (their link is meant to be shared).
 * Draft and archived: noindex and nothing else. Unknown (deleted, wrong organization): nothing.
 */
export function eventPageMetadata(
  e: EventForMetadata | null,
  links: { canonicalUrl: string; imageUrl: string },
): Metadata {
  const robots = robotsFor(e)
  if (!e || e.publicStatus !== "published") return robots ? { robots } : {}
  const description = eventShareDescription(e)
  const image = { url: links.imageUrl, ...SOCIAL_IMAGE, alt: OG_IMAGE_ALT }
  return {
    title: e.title,
    description,
    alternates: { canonical: links.canonicalUrl },
    openGraph: {
      type: "website",
      siteName: e.organizationName,
      locale: OG_LOCALE,
      url: links.canonicalUrl,
      title: e.title,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: e.title, description, images: [image] },
    ...(robots ? { robots } : {}),
  }
}

/** The description of an organisation's public page, when it is shared or found in a search. */
export function orgHomeDescription(organizationName: string): string {
  return `${organizationName} cherche des bénévoles : choisissez vos créneaux et inscrivez-vous en ligne, sans créer de compte.`
}

/**
 * Metadata of an organisation's public page (<slug>.benevol.app): its own title, a description,
 * the canonical URL on its host and the same link preview as its events (the platform's card).
 */
export function orgHomeMetadata(org: { name: string; title: string }, links: { canonicalUrl: string; imageUrl: string }): Metadata {
  const description = orgHomeDescription(org.name)
  const image = { url: links.imageUrl, ...SOCIAL_IMAGE, alt: OG_IMAGE_ALT }
  return {
    title: org.title,
    description,
    alternates: { canonical: links.canonicalUrl },
    openGraph: { type: "website", siteName: org.name, locale: OG_LOCALE, url: links.canonicalUrl, title: org.title, description, images: [image] },
    twitter: { card: "summary_large_image", title: org.title, description, images: [image] },
  }
}
