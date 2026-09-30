import Link from "next/link"
import { DOC_GUIDES } from "@/lib/doc-pages"

export const metadata = { title: "Documentation — benevol.app" }

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
            <Link href={g.path}>{g.title}</Link> — {g.description}
          </li>
        ))}
      </ul>
    </>
  )
}
