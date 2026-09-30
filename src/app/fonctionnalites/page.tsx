import type { Metadata } from "next"
import { publicPage, publicPageMetadata, SITE_NAME } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/fonctionnalites", apexBaseUrl())
}

// Rendered from the repo's FEATURES.md, the only copy of this content (AGENTS.md): editing that
// file changes this page, nothing here duplicates it.
export default function FeaturesPage() {
  const { title, html } = renderPublicSource("FEATURES.md", "Fonctionnalités")
  const page = publicPage("/fonctionnalites")
  // Minimal and exact: what the product is, where it lives, its language. No price, rating or
  // review (none is published). "<" escaped so the JSON can't close the script element.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: `${apexBaseUrl()}/`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "fr",
    description: page.metaDescription,
  }).replace(/</g, "\\u003c")
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
