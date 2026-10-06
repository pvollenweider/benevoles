// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

/**
 * The prose recipe of the documentation (/doc and its pages), larger than the other content
 * pages' (CONTENT_PROSE_CLASS in ContentShell.tsx), which it leaves alone: body text 16 px in
 * gray-700 with a line height of 1.75, lines capped at about 70 characters, headings that differ
 * from the body in size and weight (h2 20 px, h3 18 px, both semibold), underlined links with the
 * same visible focus outline as the links a page draws itself. Dark variants stay AA on gray-900.
 */
export const DOC_PROSE_CLASS = `prose prose-gray dark:prose-invert max-w-[70ch]
  prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-headings:scroll-mt-4
  prose-h1:text-2xl prose-h1:mb-2 prose-h1:pb-4 prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-gray-800
  prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3
  prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-2
  prose-h4:text-base prose-h4:mt-6 prose-h4:mb-1
  prose-p:text-base prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-7
  prose-li:text-base prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:leading-7
  prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline prose-a:underline-offset-2 hover:prose-a:decoration-2
  prose-a:rounded prose-a:focus-visible:outline prose-a:focus-visible:outline-2 prose-a:focus-visible:outline-offset-2 prose-a:focus-visible:outline-blue-600 dark:prose-a:focus-visible:outline-blue-400
  prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-strong:font-semibold
  prose-code:text-sm prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-800 dark:prose-code:text-gray-200 prose-code:before:content-none prose-code:after:content-none
  prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-700
  prose-table:text-sm prose-th:text-sm prose-th:text-gray-900 dark:prose-th:text-gray-100 prose-th:font-semibold
  prose-td:text-gray-700 dark:prose-td:text-gray-300 prose-td:align-top
  prose-img:rounded-lg prose-img:border prose-img:border-gray-200 dark:prose-img:border-gray-700 prose-img:shadow-sm`

/**
 * The frame of a documentation page, inside ContentShell's `layout="doc"`: an optional side menu
 * (a unit's DocSideMenu, from `lg`), then the page's <main>, target of « Aller au contenu », so the
 * menu is skipped like the header. Without a menu, the page is a single centred column.
 */
export default function DocFrame({ menu, children }: { menu?: React.ReactNode; children: React.ReactNode }) {
  const main = (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 py-12 focus:outline-none">
      <article className={DOC_PROSE_CLASS}>{children}</article>
    </main>
  )
  if (!menu) return <div className="max-w-3xl mx-auto px-6">{main}</div>
  return (
    <div className="max-w-6xl mx-auto px-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
      {menu}
      {main}
    </div>
  )
}
