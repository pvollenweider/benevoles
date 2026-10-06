import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { DOC_ROLE_INFO, docGroup, docGroupHref, docUnitMetadata, loadDocUnits, relatedDocUnits, resolveDocSlug } from "@/lib/doc-units"
import { docJumpLinks, docMenuGroups, docGroupSiblings, docUnitNeighbours } from "@/lib/doc-navigation"
import { headingIdsOf, renderDocUnit } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { env } from "@/lib/env"
import DocFrame from "@/components/public/DocFrame"
import DocSideMenu from "../DocSideMenu"
import { docUnitHref } from "@/lib/doc-href"

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

// The previous and next unit of the group: a bordered block, the whole block is the link.
const pagerClass = "flex h-full flex-col gap-1 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

// A documentation unit (#649), rendered from its own guide/<slug>.md (source of truth, also
// readable on GitHub): breadcrumb (its group links to the group on the /doc index), title, who it
// is for (and, on a unit for both audiences, a link to each half), content, « Voir aussi », the
// previous and next unit of its group (src/lib/doc-navigation.ts). Beside it from `lg`, the menu
// of every group (DocSideMenu); below `lg`, the other units of its group at the bottom instead.
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
  const jumps = docJumpLinks(headingIdsOf(html))
  const { previous, next } = docUnitNeighbours(unit, units)
  const siblings = docGroupSiblings(unit, units)

  return (
    <DocFrame menu={<DocSideMenu groups={docMenuGroups(units, unit.slug)} currentSlug={unit.slug} />}>
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
      {jumps.length > 0 && (
        <ul aria-label="Sur cette page" className="not-prose flex flex-wrap gap-x-6 gap-y-2 text-base">
          {jumps.map((jump) => (
            <li key={jump.href}>
              <a href={jump.href} className={linkClass}>
                {jump.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div dangerouslySetInnerHTML={{ __html: html }} />

      {related.length > 0 && (
        <>
          <h2>Voir aussi</h2>
          <ul>
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={docUnitHref(r.slug)} className={linkClass}>{r.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {(previous || next) && (
        <nav aria-label="Pages du thème" className="not-prose mt-10 grid gap-3 sm:grid-cols-2">
          {previous && (
            <Link href={docUnitHref(previous.slug)} className={pagerClass}>
              <span className="text-sm text-gray-600 dark:text-gray-400">Précédent&nbsp;: </span>
              <span className="font-medium text-blue-600 dark:text-blue-400 underline underline-offset-2"><span aria-hidden="true">← </span>{previous.title}</span>
            </Link>
          )}
          {next && (
            <Link href={docUnitHref(next.slug)} className={`${pagerClass} sm:col-start-2 sm:items-end sm:text-right`}>
              <span className="text-sm text-gray-600 dark:text-gray-400">Suivant&nbsp;: </span>
              <span className="font-medium text-blue-600 dark:text-blue-400 underline underline-offset-2">{next.title}<span aria-hidden="true"> →</span></span>
            </Link>
          )}
        </nav>
      )}

      {siblings.length > 0 && (
        <section aria-labelledby="doc-dans-ce-theme" className="lg:hidden">
          <h2 id="doc-dans-ce-theme">Dans ce thème</h2>
          <p>
            Les autres fiches du thème <Link href={docGroupHref(group)} className={linkClass}>{group.title}</Link>&nbsp;:
          </p>
          <ul>
            {siblings.map((s) => (
              <li key={s.slug}>
                <Link href={docUnitHref(s.slug)} className={linkClass}>{s.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </DocFrame>
  )
}
