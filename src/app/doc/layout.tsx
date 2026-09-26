import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import DocThemeToggle from "./DocThemeToggle"

// Sets the `dark` class on <html> before first paint — from a saved choice (doc-theme in
// localStorage) or, absent one, the OS/browser preference — so there's no flash of the wrong
// theme and a manual toggle can still win over the system default. Scoped to /doc: no other page
// renders this script or uses a `dark:` utility, so the class has no visible effect elsewhere.
// Static string constant, never interpolated with request/user data — safe to inject verbatim.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("doc-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`

// Same prose recipe as src/app/legal/layout.tsx, for visual consistency between the two
// "static content rendered from source" page families. Uses the real PublicFooter (the one every
// other public page has) rather than a hand-rolled subset, so /doc doesn't drift from
// benevol.app's actual footer (version number, "benevol.app" GitHub link, "Espace organisateur"...).
export default function DocLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />

      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <Link href="/" className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            benevol.app
          </Link>
          <div className="flex items-center gap-1">
            <nav aria-label="Guides" className="flex gap-4 -my-3 text-sm">
              <Link href="/doc/admin" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors py-3 flex items-center">Guide administrateur</Link>
              <Link href="/doc/benevole" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors py-3 flex items-center">Guide bénévole</Link>
            </nav>
            <DocThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <article className="prose prose-gray dark:prose-invert max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h1:text-2xl prose-h1:mb-2 prose-h1:pb-4 prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-gray-800
          prose-h2:text-base prose-h2:mt-10 prose-h2:mb-3
          prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-gray-700 dark:prose-h3:text-gray-300
          prose-h4:text-sm prose-h4:mt-4 prose-h4:mb-1 prose-h4:text-gray-700 dark:prose-h4:text-gray-300
          prose-p:text-sm prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
          prose-li:text-sm prose-li:text-gray-600 dark:prose-li:text-gray-400
          prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-gray-800 dark:prose-strong:text-gray-200 prose-strong:font-semibold
          prose-code:text-xs prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-700 dark:prose-code:text-gray-300 prose-code:before:content-none prose-code:after:content-none
          prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-700
          prose-table:text-sm prose-th:text-xs prose-th:uppercase prose-th:tracking-wider prose-th:text-gray-500 dark:prose-th:text-gray-400 prose-th:font-medium
          prose-td:text-gray-600 dark:prose-td:text-gray-400 prose-td:align-top
          prose-img:rounded-lg prose-img:border prose-img:border-gray-200 dark:prose-img:border-gray-700 prose-img:shadow-sm
        ">
          {children}
        </article>

        <PublicFooter />
      </main>
    </div>
  )
}
