import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc/benevole", apexBaseUrl())
}

// Rendered from the repo's own GUIDE_BENEVOLE.md (source of truth, also readable on GitHub).
export default function DocBenevolePage() {
  const { title, html } = renderPublicSource("GUIDE_BENEVOLE.md", "Guide bénévole")
  return (
    <>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
