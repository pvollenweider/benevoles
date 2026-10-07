// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import DocVideoInline from "@/components/videos/DocVideoInline"
import { mailtoAddress } from "@/lib/features-page"
import type { FeatureStill, RenderedFeaturesPage } from "@/lib/public-content"
import type { FeatureAction } from "@/lib/features-page"
import type { DocUnitPart } from "@/lib/doc-video-references"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
const balance = { textWrap: "balance" } as React.CSSProperties
const pretty = { textWrap: "pretty" } as React.CSSProperties

/**
 * The prose of /fonctionnalites: the documentation's reading size (16 px, lines capped at 65ch,
 * 1.75 line height), lists whose bold lead carries the benefit, links underlined. The « Bénévole ? »
 * aside is a blockquote drawn as a tinted box with a full 1 px border (never a side stripe) and
 * without quotation marks.
 */
export const FEATURES_PROSE_CLASS = `prose prose-gray dark:prose-invert max-w-none
  prose-p:text-base prose-p:leading-[1.75] prose-p:max-w-[65ch] prose-p:text-gray-700 dark:prose-p:text-gray-300
  prose-li:text-base prose-li:leading-[1.75] prose-li:max-w-[65ch] prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:my-2
  prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-strong:font-semibold
  prose-a:text-blue-700 dark:prose-a:text-blue-300 prose-a:underline prose-a:underline-offset-2 hover:prose-a:decoration-2 prose-a:rounded
  prose-a:focus-visible:outline prose-a:focus-visible:outline-2 prose-a:focus-visible:outline-offset-2 prose-a:focus-visible:outline-blue-700 dark:prose-a:focus-visible:outline-blue-300
  prose-code:text-sm prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-800 dark:prose-code:text-gray-200 prose-code:before:content-none prose-code:after:content-none
  prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:max-w-[65ch] prose-blockquote:rounded-xl prose-blockquote:border prose-blockquote:border-s prose-blockquote:border-blue-200 dark:prose-blockquote:border-blue-800
  prose-blockquote:bg-blue-50 dark:prose-blockquote:bg-blue-950 prose-blockquote:px-5 prose-blockquote:py-1 prose-blockquote:mt-8
  [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none [&_blockquote_p]:text-gray-800 dark:[&_blockquote_p]:text-gray-200`

function ActionLinks({ actions }: { actions: FeatureAction[] }) {
  if (actions.length === 0) return null
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
      {actions.map((action, i) => {
        const address = mailtoAddress(action.href)
        const primary = i === 0
        return (
          <a
            key={action.href}
            href={action.href}
            className={
              primary
                ? `inline-flex items-center gap-2 rounded-full bg-blue-700 px-6 py-3 text-base font-semibold text-white hover:bg-blue-800 dark:bg-blue-300 dark:text-gray-950 dark:hover:bg-blue-200 border border-transparent transition-colors ${focusRing}`
                : `inline-flex items-center py-2 text-base font-medium text-blue-700 dark:text-blue-300 underline underline-offset-4 hover:decoration-2 rounded ${focusRing}`
            }
          >
            {address && (
              // Visible cue that the button opens the mail app; the address is spelled out for screen readers.
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-current">
                <path d="M2.5 4h15A1.5 1.5 0 0 1 19 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 1 14.5v-9A1.5 1.5 0 0 1 2.5 4Zm.4 1.5L10 10.2l7.1-4.7H2.9Zm14.6 1.3-7.1 4.7a.75.75 0 0 1-.8 0L2.5 6.8v7.7h15V6.8Z" />
              </svg>
            )}
            {action.label}
            {address && <span className="sr-only"> par email ({address})</span>}
            {primary && <span aria-hidden="true">→</span>}
          </a>
        )
      })}
    </div>
  )
}

/** A block's HTML with its inline players where its video lines stand. */
function Parts({ parts, className = "" }: { parts: DocUnitPart[]; className?: string }) {
  return (
    <div className={`${FEATURES_PROSE_CLASS} ${className}`} style={pretty}>
      {parts.map((part, i) =>
        part.kind === "html" ? <div key={i} dangerouslySetInnerHTML={{ __html: part.html }} /> : <DocVideoInline key={i} player={part.player} />,
      )}
    </div>
  )
}

function Still({ still, priority = false }: { still: FeatureStill; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- poster served by the media server (medias.benevol.app), already sized; no image optimizer on that host
    <img
      src={still.src}
      alt={still.alt}
      width={still.width}
      height={still.height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`h-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white shadow-lg ${still.height > still.width ? "mx-auto w-auto max-h-[36rem] max-w-full" : "w-full"}`}
    />
  )
}

/**
 * /fonctionnalites (FEATURES.md, laid out by src/lib/features-page.ts): the promise with its two
 * actions and a still of the product, the presentation video opened in place, a « Sur cette page »
 * list of every section, then each section with its benefits, a still of the matching tutorial,
 * its video and the documentation pages that say more. Server-rendered; only the inline players
 * are client components (DocVideoInline).
 */
export default function FeaturesPage({ page }: { page: RenderedFeaturesPage }) {
  const { intro, sections } = page
  const heroStill = intro.stills[0]
  // The opening's text on the left; its video, under the still, on the right.
  const introText = intro.parts.filter((p) => p.kind === "html")
  const introVideos = intro.parts.filter((p) => p.kind === "video")
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="focus:outline-none">
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-16 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
          <div>
            <p className="text-base font-semibold text-blue-700 dark:text-blue-300">Fonctionnalités</p>
            <h1 id="features-title" className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.08] text-gray-900 dark:text-gray-50 break-words" style={balance}>
              {page.title}
            </h1>
            <Parts parts={introText} className="mt-6 [&_p]:text-lg sm:[&_p]:text-xl [&_p]:leading-relaxed" />
            <ActionLinks actions={intro.actions} />
          </div>
          {(heroStill || introVideos.length > 0) && (
            <div className="min-w-0">
              {heroStill && <Still still={heroStill} priority />}
              {introVideos.length > 0 && <Parts parts={introVideos} className="mt-4" />}
            </div>
          )}
        </div>
      </section>

      <nav aria-labelledby="features-toc" className="border-y border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <h2 id="features-toc" className="text-base font-semibold text-gray-900 dark:text-gray-100">Sur cette page</h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={`inline-flex py-1 text-base text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:decoration-2 rounded ${focusRing}`}>
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6">
        {sections.map((s, index) => {
          const still = s.stills[0]
          const flip = index % 2 === 1
          return (
            <section key={s.id} className="py-16 sm:py-20 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
              <div className={still ? "grid gap-10 lg:grid-cols-12 lg:gap-12 lg:items-start" : ""}>
                <div className={still ? `lg:col-span-6 ${flip ? "lg:order-2 lg:col-start-7" : ""}` : ""}>
                  <h2 id={s.id} className="scroll-mt-6 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 break-words" style={balance}>
                    {s.heading}
                  </h2>
                  {s.steps ? (
                    <ol role="list" className="mt-10 grid gap-10 md:grid-cols-3 md:gap-12">
                      {s.steps.map((step, i) => (
                        <li key={step.title}>
                          <span aria-hidden="true" className="block text-5xl font-extrabold leading-none text-blue-700 dark:text-blue-300">{i + 1}</span>
                          <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-50">
                            <span className="sr-only">Étape {i + 1} : </span>
                            {step.title.replace(/\.$/, "")}
                          </h3>
                          <p className="mt-3 max-w-[65ch] text-base leading-[1.75] text-gray-700 dark:text-gray-300" style={pretty}>{step.text}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <Parts parts={s.parts} className="mt-6" />
                  )}
                  <ActionLinks actions={s.actions} />
                </div>
                {still && (
                  <div className={`min-w-0 lg:col-span-6 lg:mt-14 ${flip ? "lg:order-1 lg:col-start-1" : ""}`}>
                    <Still still={still} />
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
