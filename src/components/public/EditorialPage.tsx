// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ContentShell from "@/components/public/ContentShell"
import FeaturesPage from "@/components/public/FeaturesPage"
import JsonLd from "@/components/public/JsonLd"
import { pageAvailable, publicPage, publicPageMetadata } from "@/lib/doc-pages"
import { env } from "@/lib/env"
import { featuresPageFaq, renderFeaturesPage } from "@/lib/public-content"
import { publicPageJsonLd } from "@/lib/structured-data"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"
import { apexBaseUrl } from "@/lib/urls"

/**
 * An editorial page of the apex site (#767, #872, #950): /logiciel-planning-benevoles, the
 * audience pages, /pour-qui and /tarifs. Rendered from its Markdown source (src/lib/doc-pages.ts),
 * the only copy of its content, with the layout of /fonctionnalites (src/lib/features-page.ts);
 * its FAQPage structured data is built from the questions the page renders, so the two cannot
 * drift. Absent (404) on an instance that is not the hosted service (#760).
 *
 * Each route is three lines (its page.tsx and layout.tsx); rendered per request, like
 * /fonctionnalites: the stills and players of its videos need VIDEO_MEDIA_BASE_URL, only set in
 * the running container.
 */
export default function EditorialPage({ path, eyebrow }: { path: string; eyebrow: string }) {
  const page = publicPage(path)
  if (!pageAvailable(page) || !page.source) notFound()
  const rendered = renderFeaturesPage(env.VIDEO_MEDIA_BASE_URL, page.source, page.title)
  return (
    <>
      <JsonLd data={publicPageJsonLd(path, apexBaseUrl(), featuresPageFaq(rendered))} />
      <FeaturesPage page={rendered} eyebrow={eyebrow} />
    </>
  )
}

/** The page's metadata, from its registry entry: title, description, canonical, social card. */
export function editorialPageMetadata(path: string): Metadata {
  return publicPageMetadata(path, apexBaseUrl())
}

export const EDITORIAL_VIEWPORT = CONTENT_VIEWPORT

/** The frame of an editorial page: the wide layout, the page draws its own <main> (FeaturesPage). */
export function EditorialLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell layout="doc">{children}</ContentShell>
}
