// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { RenderedRelease } from "@/lib/public-content"
import { SITE_NAME } from "@/lib/seo-metadata"

/**
 * The body of /nouveautes (#757), inside ContentShell's article and its prose recipe: the page's
 * <h1>, a short introduction, « Toutes les versions » (a <nav> named by its <h2>, one link per
 * version to its anchor), then each version: <h2 id="<version>"> (the anchor #762's emails link
 * to), its date in a <time>, its intro, its sections under <h3> and a link back to the list.
 * Each item of the list stays whole in its column (break-inside-avoid). The HTML comes from
 * CHANGELOG.md through renderChangelog (src/lib/public-content.ts), sanitized there.
 */
export default function ReleaseNotes({ releases, fullChangelogUrl }: { releases: readonly RenderedRelease[]; fullChangelogUrl: string }) {
  return (
    <>
      <h1>Nouveautés</h1>
      <p>
        Ce qui a changé dans {SITE_NAME}, version par version, la plus récente en premier. Pour découvrir l&apos;outil,
        voir les <Link href="/fonctionnalites">fonctionnalités</Link> ; pour s&apos;en servir, la{" "}
        <Link href="/doc">documentation</Link>. Les changements techniques, pour qui installe ou développe
        {SITE_NAME}, sont dans le <a href={fullChangelogUrl}>journal complet des versions sur GitHub</a>.
      </p>

      {releases.length === 0 ? (
        <p>Aucune version publiée pour le moment.</p>
      ) : (
        <>
          <nav aria-labelledby="toutes-les-versions">
            <h2 id="toutes-les-versions">Toutes les versions</h2>
            {/* Spacing by padding, not margin: a margin is dropped at the top of the second
                column but not the first, which then started lower. */}
            <ul className="sm:columns-2 [&>li]:my-0 [&>li]:py-1">
              {releases.map((r) => (
                <li key={r.version} className="break-inside-avoid">
                  <a href={`#${r.version}`}>Version {r.version}</a>, {r.dateLabel}
                </li>
              ))}
            </ul>
          </nav>

          {releases.map((r) => (
            <section key={r.version} className="[overflow-wrap:anywhere]">
              <h2 id={r.version}>Version {r.version}</h2>
              <p>
                Publiée le <time dateTime={r.date}>{r.dateLabel}</time>
              </p>
              {r.introHtml && <div dangerouslySetInnerHTML={{ __html: r.introHtml }} />}
              {r.sections.map((s, i) => (
                <div key={`${i}-${s.title}`}>
                  <h3>{s.title}</h3>
                  <div dangerouslySetInnerHTML={{ __html: s.html }} />
                </div>
              ))}
              <p>
                <a href="#toutes-les-versions">Retour à la liste des versions</a>
              </p>
            </section>
          ))}
        </>
      )}
    </>
  )
}
