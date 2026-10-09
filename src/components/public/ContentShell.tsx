// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import DocThemeToggle from "@/app/doc/DocThemeToggle"
import ContentNav from "@/components/public/ContentNav"
import { SITE_CONTAINER_CLASS, SITE_READING_COLUMN_CLASS } from "@/components/public/site-container"
import { SITE_NAME } from "@/lib/seo-metadata"

// Sets the `dark` class on the shell's own root before first paint — from a saved choice
// (doc-theme in localStorage) or, absent one, the OS/browser preference — so there's no flash of
// the wrong theme. Scoped to this element, never <html>: going back to the home page must not keep
// the dark theme (its footer would lose contrast). DocThemeToggle applies it again after a client
// navigation, where inline scripts don't run.
// Static string constant, never interpolated with request/user data — safe to inject verbatim.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("doc-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var el = document.currentScript && document.currentScript.parentElement;
    if (el) el.classList.toggle("dark", dark);
  } catch (e) {}
})();
`

/**
 * The prose recipe of the content pages (changelog, accessibility), shared with
 * src/app/legal/layout.tsx: 16 px text in gray-700 (gray-300 in dark) with a line height of 1.75,
 * as on /fonctionnalites and in the documentation; each paragraph and list item capped at 65ch (a
 * maximum, never a width: about 80 characters a line), the article (headings, tables) at 65ch of
 * the same 16 px, so as wide as the text, centred in the site container
 * (SITE_READING_COLUMN_CLASS), never stretched to its width. A clear heading scale over the body,
 * in rem, never fluid: h1 30 px bold, h2 24 px, h3 18 px, h4 16 px, all semibold except h1,
 * gray-900 (gray-100 in dark); h4 is set apart from the body by its weight and colour. Table
 * headers in sentence case, never uppercase (DESIGN.md, No-Caps). Links of the content (the
 * Markdown, the indexes) get the same visible focus outline as the links a page draws itself. The
 * documentation has its own, larger recipe (DOC_PROSE_CLASS, src/components/public/DocFrame.tsx).
 */
export const CONTENT_PROSE_CLASS = `prose prose-gray dark:prose-invert max-w-[65ch]
          prose-headings:font-semibold prose-headings:tracking-tight prose-headings:scroll-mt-4 prose-headings:break-words prose-headings:text-gray-900 dark:prose-headings:text-gray-100
          prose-h1:text-3xl prose-h1:font-bold prose-h1:leading-[1.2] prose-h1:mb-2 prose-h1:pb-4 prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-gray-800
          prose-h2:text-2xl prose-h2:leading-[1.3] prose-h2:mt-12 prose-h2:mb-3
          prose-h3:text-lg prose-h3:leading-[1.4] prose-h3:mt-8 prose-h3:mb-2
          prose-h4:text-base prose-h4:leading-[1.5] prose-h4:mt-6 prose-h4:mb-1
          prose-p:text-base prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-[1.75] prose-p:max-w-[65ch]
          prose-li:text-base prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:leading-[1.75] prose-li:max-w-[65ch]
          prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline prose-a:underline-offset-2 hover:prose-a:decoration-2
          prose-a:rounded prose-a:focus-visible:outline prose-a:focus-visible:outline-2 prose-a:focus-visible:outline-offset-2 prose-a:focus-visible:outline-blue-600 dark:prose-a:focus-visible:outline-blue-400
          prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-strong:font-semibold
          prose-code:text-sm prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-700 dark:prose-code:text-gray-300 prose-code:before:content-none prose-code:after:content-none
          prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-700
          prose-table:text-sm prose-th:text-sm prose-th:text-gray-900 dark:prose-th:text-gray-100 prose-th:font-semibold
          prose-td:text-gray-700 dark:prose-td:text-gray-300 prose-td:align-top
          prose-img:rounded-lg prose-img:border prose-img:border-gray-200 dark:prose-img:border-gray-700 prose-img:shadow-sm`

/**
 * Frame of the public content pages rendered from Markdown sources (features, documentation):
 * site header with the content navigation and the theme toggle, and the real PublicFooter.
 * Header, content and footer share one container (SITE_CONTAINER_CLASS), so their edges line up.
 * `layout="article"` (default) puts the page in a <main> with the shared prose recipe;
 * `layout="doc"` lets the page draw its own <main> (DocFrame, FeaturesPage), so a unit's side
 * menu can sit beside it, outside the main landmark that « Aller au contenu » jumps to.
 */
export default function ContentShell({ children, layout = "article" }: { children: React.ReactNode; layout?: "article" | "doc" }) {
  return (
    <div data-theme-scope className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <SkipLink />

      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className={`${SITE_CONTAINER_CLASS} py-4 flex items-center justify-between flex-wrap gap-x-2 gap-y-4`}>
          <Link href="/" className="inline-flex py-3 -my-3 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400">
            {SITE_NAME}
          </Link>
          <div className="flex items-center gap-3">
            <ContentNav />
            <DocThemeToggle />
          </div>
        </div>
      </header>

      {layout === "doc" ? (
        children
      ) : (
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${SITE_CONTAINER_CLASS} py-12 focus:outline-none`}>
          <article className={`${CONTENT_PROSE_CLASS} ${SITE_READING_COLUMN_CLASS}`}>{children}</article>
        </main>
      )}

      <div className={SITE_CONTAINER_CLASS}>
        <PublicFooter variant="site" />
      </div>
    </div>
  )
}
