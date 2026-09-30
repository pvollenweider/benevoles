// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import DocThemeToggle from "@/app/doc/DocThemeToggle"
import ContentNav from "@/components/public/ContentNav"

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
 * Frame of the public content pages rendered from Markdown sources (features, documentation):
 * site header with the content navigation and the theme toggle, the prose recipe shared with
 * src/app/legal/layout.tsx, and the real PublicFooter.
 */
export default function ContentShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme-scope className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <SkipLink />

      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-x-2 gap-y-4">
          <Link href="/" className="inline-flex py-3 -my-3 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400">
            benevol.app
          </Link>
          <div className="flex items-center gap-3">
            <ContentNav />
            <DocThemeToggle />
          </div>
        </div>
      </header>

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="max-w-3xl mx-auto px-6 py-12 focus:outline-none">
        <article className="prose prose-gray dark:prose-invert max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h1:text-2xl prose-h1:mb-2 prose-h1:pb-4 prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-gray-800
          prose-h2:text-base prose-h2:mt-10 prose-h2:mb-3
          prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-gray-700 dark:prose-h3:text-gray-300
          prose-h4:text-sm prose-h4:mt-4 prose-h4:mb-1 prose-h4:text-gray-700 dark:prose-h4:text-gray-300
          prose-p:text-sm prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
          prose-li:text-sm prose-li:text-gray-600 dark:prose-li:text-gray-400
          prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline prose-a:underline-offset-2 hover:prose-a:decoration-2
          prose-strong:text-gray-800 dark:prose-strong:text-gray-200 prose-strong:font-semibold
          prose-code:text-xs prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-700 dark:prose-code:text-gray-300 prose-code:before:content-none prose-code:after:content-none
          prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-700
          prose-table:text-sm prose-th:text-xs prose-th:uppercase prose-th:tracking-wider prose-th:text-gray-500 dark:prose-th:text-gray-400 prose-th:font-medium
          prose-td:text-gray-600 dark:prose-td:text-gray-400 prose-td:align-top
          prose-img:rounded-lg prose-img:border prose-img:border-gray-200 dark:prose-img:border-gray-700 prose-img:shadow-sm
        ">
          {children}
        </article>
      </main>

      <div className="max-w-3xl mx-auto px-6">
        <PublicFooter showSupport />
      </div>
    </div>
  )
}
