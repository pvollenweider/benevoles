import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { DOC_ROLE_INFO, docGroup, docGroupHref, docUnitMetadata, loadDocUnits, relatedDocUnits, resolveDocSlug } from "@/lib/doc-units"
import { renderDocUnit } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { env } from "@/lib/env"

// Rendered per request, like the guides (#645): the video link depends on VIDEO_MEDIA_BASE_URL,
// only set in the running container. The static pages of /doc (admin, benevole) win over this
// segment; their slugs are reserved (RESERVED_DOC_SLUGS in src/lib/doc-units.ts).
export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const found = resolveDocSlug(slug, loadDocUnits())
  return found && "unit" in found ? docUnitMetadata(found.unit, apexBaseUrl()) : {}
}

// One style for every link the page draws itself (breadcrumb, audience, « Voir aussi »): colour,
// underline and a visible focus outline, as in the content navigation.
const linkClass = "text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:decoration-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

// A documentation unit (#649), rendered from its own guide/<slug>.md (source of truth, also
// readable on GitHub): breadcrumb (its group links to the group on the /doc index), title, who it
// is for, content, then « Voir aussi ».
export default async function DocUnitPage({ params }: Props) {
  const { slug } = await params
  const units = loadDocUnits()
  const found = resolveDocSlug(slug, units)
  if (!found) notFound()
  if ("redirectTo" in found) permanentRedirect(found.redirectTo)
  const { unit } = found
  const group = docGroup(unit.group)
  const related = relatedDocUnits(unit, units)
  const html = renderDocUnit(unit, env.VIDEO_MEDIA_BASE_URL)

  return (
    <>
      <nav aria-label="Fil d'Ariane" className="not-prose mb-6 text-sm text-gray-600 dark:text-gray-400">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li>
            <Link href="/doc" className={linkClass}>Documentation</Link>
          </li>
          <li className="flex items-center gap-x-2">
            <span aria-hidden="true">›</span>
            <Link href={docGroupHref(group)} className={linkClass}>{group.title}</Link>
          </li>
          <li className="flex items-center gap-x-2">
            <span aria-hidden="true">›</span>
            <span aria-current="page" className="font-medium text-gray-900 dark:text-gray-100">{unit.title}</span>
          </li>
        </ol>
      </nav>

      <h1>{unit.title}</h1>

      <p>
        Pour&nbsp;:{" "}
        {unit.roles.map((role, i) => (
          <span key={role}>
            {i > 0 && ", "}
            {DOC_ROLE_INFO[role].label} (<Link href={DOC_ROLE_INFO[role].path} className={linkClass}>{DOC_ROLE_INFO[role].guideTitle}</Link>)
          </span>
        ))}
      </p>

      <div dangerouslySetInnerHTML={{ __html: html }} />

      {related.length > 0 && (
        <>
          <h2>Voir aussi</h2>
          <ul>
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/doc/${r.slug}`} className={linkClass}>{r.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
