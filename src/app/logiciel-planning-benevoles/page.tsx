import type { Metadata } from "next"
import { pageAvailable, publicPage, publicPageMetadata } from "@/lib/doc-pages"
import { publicPageJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import FeaturesPage from "@/components/public/FeaturesPage"
import { renderFeaturesPage } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { env } from "@/lib/env"
import { notFound } from "next/navigation"

const PATH = "/logiciel-planning-benevoles"

// Rendered per request, like /fonctionnalites: its stills and players need VIDEO_MEDIA_BASE_URL,
// only set in the running container.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata(PATH, apexBaseUrl())
}

// An editorial page (#767) rendered from LOGICIEL-PLANNING-BENEVOLES.md, the only copy of its
// content, with the layout of /fonctionnalites (src/lib/features-page.ts). Its FAQPage structured
// data is built from the questions the page renders, so the two cannot drift.
export default function Page() {
  // The hosted service's own page (#760): absent on another instance, which has /legal/exploitant.
  if (!pageAvailable(publicPage("/logiciel-planning-benevoles"))) notFound()
  const page = renderFeaturesPage(env.VIDEO_MEDIA_BASE_URL, publicPage(PATH).source!, publicPage(PATH).title)
  const faq = page.sections.flatMap((s) => s.faq ?? []).map((q) => ({ question: q.question, answer: q.text }))
  return (
    <>
      <JsonLd data={publicPageJsonLd(PATH, apexBaseUrl(), faq)} />
      <FeaturesPage page={page} eyebrow="Pour les associations" />
    </>
  )
}
