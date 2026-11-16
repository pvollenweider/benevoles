// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { pageAvailable, publicPage } from "@/lib/doc-pages"
import { RESSOURCES_PATH, findRessource, loadRessources, ressourceMetadata } from "@/lib/ressources"
import { renderRessource } from "@/lib/public-content"
import { contactEmail } from "@/lib/site"
import { apexBaseUrl } from "@/lib/urls"
import { ressourceJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import { RessourceView } from "@/components/public/Ressources"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const guide = findRessource(slug, loadRessources())
  return guide ? ressourceMetadata(guide, apexBaseUrl()) : {}
}

// A practical guide (#1258), rendered from its own content/ressources/<slug>.md; an unknown slug is a
// 404, like the blog. Hosted service only, like the index.
export default async function RessourcePage({ params }: Props) {
  if (!pageAvailable(publicPage(RESSOURCES_PATH))) notFound()
  const { slug } = await params
  const guide = findRessource(slug, loadRessources())
  if (!guide) notFound()
  return (
    <>
      <JsonLd data={ressourceJsonLd(guide, apexBaseUrl())} />
      <RessourceView guide={guide} html={renderRessource(guide)} contact={contactEmail()} />
    </>
  )
}
