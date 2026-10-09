import type { Metadata } from "next"
import Link from "next/link"
import { DOC_GUIDES, publicPageMetadata } from "@/lib/doc-pages"
import { loadDocUnits } from "@/lib/doc-units"
import { docUnitHref } from "@/lib/doc-href"
import { docQuickstartUnit } from "@/lib/doc-quickstart"
import { apexBaseUrl } from "@/lib/urls"
import { publicPageJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import DocUnitIndex from "@/components/public/DocUnitIndex"
import DocFrame from "@/components/public/DocFrame"
import { SITE_NAME } from "@/lib/seo-metadata"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc", apexBaseUrl())
}

// The guides come from one registry (src/lib/doc-pages.ts), shared with the navigation and the
// sitemap: a new guide is added there once. Then every documentation unit (#649, guide/), by
// group; a group's heading is the target of a unit's breadcrumb (/doc#<group>).
export default function DocIndexPage() {
  const units = loadDocUnits()
  const quickstart = docQuickstartUnit(units)
  return (
    <DocFrame>
      <JsonLd data={publicPageJsonLd("/doc", apexBaseUrl())} />
      <h1>Documentation</h1>
      <p>{DOC_GUIDES.length > 1 ? `${DOC_GUIDES.length} guides` : "Un guide"}, selon ce que vous cherchez à faire sur {SITE_NAME}&nbsp;:</p>
      <ul>
        {DOC_GUIDES.map((g) => (
          <li key={g.path}>
            <Link href={g.path}>{g.title}</Link>&nbsp;: {g.summary}
          </li>
        ))}
      </ul>
      {quickstart && (
        <p>
          Vous organisez votre premier événement&nbsp;? Suivez <Link href={docUnitHref(quickstart.slug)}>{quickstart.title}</Link>.{" "}
          {quickstart.summary}
        </p>
      )}
      <p>
        Vous découvrez {SITE_NAME} ? La page <Link href="/fonctionnalites">Fonctionnalités</Link> présente ce que
        fait l&apos;outil, besoin par besoin. Pour voir chaque étape à l&apos;écran, les{" "}
        <Link href="/videos">tutoriels vidéo</Link> la montrent en quelques minutes, avec leur transcription.
        Ce qui a changé récemment est dans les <Link href="/nouveautes">nouveautés</Link>, version par version.
      </p>
      <DocUnitIndex units={units} />
    </DocFrame>
  )
}
