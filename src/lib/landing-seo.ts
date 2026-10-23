// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { CONTACT_EMAIL, REPOSITORY_URL, faqPageNode, jsonLdGraph, organizationNode, softwareApplicationNode, softwareSourceCodeNode, websiteNode, type FaqItem } from "@/lib/structured-data"
import { INDEXABLE, OG_LOCALE, SITE_NAME, SOCIAL_IMAGE } from "@/lib/seo-metadata"

export { CONTACT_EMAIL, REPOSITORY_URL }
export { jsonLdScript } from "@/lib/structured-data"

/**
 * The apex home (www.benevol.app): its metadata and its structured data, in one place. The visible
 * FAQ and the FAQPage JSON-LD both come from LANDING_FAQ_SOURCE, so they cannot drift (search
 * engines ignore, or penalise, structured data that the page does not show). Everything here is
 * a fact the product or the legal pages already state: free (price 0), and no rating or review is
 * published, so none is declared.
 */

export const LANDING_TITLE = "Planning et inscription des bénévoles | benevol.app"
export const LANDING_DESCRIPTION =
  "Organisez vos bénévoles par postes et créneaux. Inscription depuis le téléphone, sans compte, rappels automatiques et feuilles du jour J. Gratuit."
export const OG_IMAGE_ALT = "benevol.app : le planning des bénévoles, inscription sans compte"

/**
 * The source of the home's FAQ (#951): questions written in Markdown, rendered by the page and
 * copied into its FAQPage structured data (src/lib/public-content.ts `renderFaqSource`), so the
 * two cannot drift. Read at runtime: copied into the image by the Dockerfile.
 */
export const LANDING_FAQ_SOURCE = "content/pages/FAQ-ACCUEIL.md"

/** Metadata of the apex home: canonical, Open Graph and Twitter card, fully indexable. */
export function landingMetadata(base: string): Metadata {
  const url = `${base.replace(/\/+$/, "")}/`
  const image = { url: "/og-image.png", ...SOCIAL_IMAGE, alt: OG_IMAGE_ALT }
  return {
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    applicationName: SITE_NAME,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      url,
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: LANDING_TITLE, description: LANDING_DESCRIPTION, images: [image] },
    robots: INDEXABLE,
    category: "software",
  }
}

/**
 * The home's structured data: the site, its publisher, the application, its code and the FAQ the
 * page renders (`faq`, from LANDING_FAQ_SOURCE); no FAQPage when it shows none.
 */
export function landingJsonLd(base: string, faq: readonly FaqItem[]): Record<string, unknown> {
  return jsonLdGraph([
    websiteNode(base),
    organizationNode(base),
    softwareApplicationNode(base, LANDING_DESCRIPTION),
    softwareSourceCodeNode(base),
    ...(faq.length > 0 ? [faqPageNode(base, "/", faq)] : []),
  ])
}
