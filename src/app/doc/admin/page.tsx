import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc/admin", apexBaseUrl())
}

// Rendered from the repo's own GUIDE_ADMIN.md (source of truth, also readable on GitHub).
export default function DocAdminPage() {
  const { title, html } = renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur")
  return (
    <>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
