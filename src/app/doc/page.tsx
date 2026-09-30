import type { Metadata } from "next"
import Link from "next/link"
import { DOC_GUIDES, publicPageMetadata } from "@/lib/doc-pages"
import { apexBaseUrl } from "@/lib/urls"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc", apexBaseUrl())
}

// The guides come from one registry (src/lib/doc-pages.ts), shared with the navigation and the
// sitemap: a new guide is added there once.
export default function DocIndexPage() {
  return (
    <>
      <h1>Documentation</h1>
      <p>{DOC_GUIDES.length > 1 ? `${DOC_GUIDES.length} guides` : "Un guide"}, selon ce que vous cherchez à faire sur benevol.app :</p>
      <ul>
        {DOC_GUIDES.map((g) => (
          <li key={g.path}>
            <Link href={g.path}>{g.title}</Link> — {g.summary}
          </li>
        ))}
      </ul>
      <p>
        Vous découvrez benevol.app ? La page <Link href="/fonctionnalites">Fonctionnalités</Link> présente ce que
        fait l&apos;outil, besoin par besoin.
      </p>
    </>
  )
}
