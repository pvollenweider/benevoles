// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { Ressource } from "@/lib/ressources"
import { RESSOURCES_PATH, ressourcePath } from "@/lib/ressources"
import { formatReleaseDate } from "@/lib/changelog"

/**
 * The practical guides (#1258), inside ContentShell's article and its prose recipe, like the blog:
 * the index shows its introduction, « Les guides » (each guide's title, a link in an <h3>, its
 * summary and the day it was last checked, most useful first), then the editorial charter, its own
 * <h2>; a guide shows its title as the page's single <h1>, its last check date, its Markdown
 * (rendered and sanitized by renderRessource, src/lib/public-content.ts, headings from <h2>), then
 * how to report an error and the way back. Accessibility review: 2026-11-06, no WCAG 2.2 AA issue.
 */

// The links the page draws itself: colour, underline and the focus outline of DESIGN.md §4, as in the blog.
const linkClass =
  "text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:decoration-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

// A guide's title in the index: ink, the underline back on hover and with the focus outline (DESIGN.md §4).
const titleLinkClass =
  "text-gray-900 dark:text-gray-100 no-underline hover:underline underline-offset-4 decoration-2 decoration-blue-600 dark:decoration-blue-400 rounded focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

function Updated({ date }: { date: string }) {
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      Mis à jour le <time dateTime={date}>{formatReleaseDate(date)}</time>
    </p>
  )
}

type IndexProps = { title: string; introHtml: string; charterHtml: string; guides: readonly Ressource[] }

export function RessourcesIndex({ title, introHtml, charterHtml, guides }: IndexProps) {
  return (
    <>
      <h1>{title}</h1>
      <div className="[overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: introHtml }} />
      <h2>Les guides</h2>
      {guides.length === 0 ? (
        <p>Aucun guide pour le moment.</p>
      ) : (
        // `role="list"`: Safari drops the list semantics of a list without bullets.
        <ul role="list" className="not-prose mt-4">
          {guides.map((guide) => (
            <li key={guide.slug} className="flex flex-col py-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-xl font-semibold leading-snug tracking-tight [text-wrap:balance] [overflow-wrap:anywhere]">
                <Link href={ressourcePath(guide)} className={titleLinkClass}>
                  {guide.title}
                </Link>
              </h3>
              <p className="mt-2 max-w-[65ch] text-base leading-relaxed text-gray-700 dark:text-gray-300 [text-wrap:pretty]">{guide.summary}</p>
              <div className="mt-2"><Updated date={guide.updated} /></div>
            </li>
          ))}
        </ul>
      )}
      {charterHtml && <div className="mt-10 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: charterHtml }} />}
    </>
  )
}

type ViewProps = { guide: Ressource; html: string; contact: string | null }

export function RessourceView({ guide, html, contact }: ViewProps) {
  return (
    <>
      <p className="not-prose mb-6 text-sm">
        <Link href={RESSOURCES_PATH} className={linkClass}>
          <span aria-hidden="true">← </span>Tous les guides
        </Link>
      </p>
      <h1 className="[overflow-wrap:anywhere]">{guide.title}</h1>
      <div className="not-prose mt-4">
        <Updated date={guide.updated} />
      </div>
      <div className="[overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: html }} />
      <hr />
      <p className="[overflow-wrap:anywhere]">
        Une erreur, une règle qui a changé&nbsp;?{" "}
        {contact ? (
          <>
            Écrivez à <a href={`mailto:${encodeURI(contact)}`}>{contact}</a>&nbsp;: le guide sera corrigé et sa date mise à jour.
          </>
        ) : (
          <>Signalez-le à l&apos;équipe&nbsp;: le guide sera corrigé et sa date mise à jour.</>
        )}
      </p>
      <p className="not-prose mt-8 text-sm">
        <Link href={RESSOURCES_PATH} className={linkClass}>Tous les guides</Link>
      </p>
    </>
  )
}
