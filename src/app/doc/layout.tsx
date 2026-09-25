import Link from "next/link"

// Same prose recipe as src/app/legal/layout.tsx, for visual consistency between the two
// "static content rendered from source" page families.
export default function DocLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <Link href="/" className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors">
            benevol.app
          </Link>
          <nav aria-label="Guides" className="flex gap-4 text-sm">
            <Link href="/doc/admin" className="text-gray-600 hover:text-gray-900 transition-colors">Guide administrateur</Link>
            <Link href="/doc/benevole" className="text-gray-600 hover:text-gray-900 transition-colors">Guide bénévole</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <article className="prose prose-gray max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h1:text-2xl prose-h1:mb-2 prose-h1:pb-4 prose-h1:border-b prose-h1:border-gray-200
          prose-h2:text-base prose-h2:mt-10 prose-h2:mb-3
          prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-gray-700
          prose-h4:text-sm prose-h4:mt-4 prose-h4:mb-1 prose-h4:text-gray-700
          prose-p:text-sm prose-p:text-gray-600 prose-p:leading-relaxed
          prose-li:text-sm prose-li:text-gray-600
          prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-gray-800 prose-strong:font-semibold
          prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-700 prose-code:before:content-none prose-code:after:content-none
          prose-table:text-sm prose-th:text-xs prose-th:uppercase prose-th:tracking-wider prose-th:text-gray-500 prose-th:font-medium
          prose-td:text-gray-600 prose-td:align-top
          prose-img:rounded-lg prose-img:border prose-img:border-gray-200 prose-img:shadow-sm
        ">
          {children}
        </article>

        <footer className="mt-16 pt-6 border-t border-gray-100 flex gap-6 text-xs text-gray-500">
          <Link href="/legal/terms" className="hover:text-gray-600 transition-colors">CGU</Link>
          <Link href="/legal/privacy" className="hover:text-gray-600 transition-colors">Confidentialité</Link>
          <a href="mailto:contact@benevol.app" className="hover:text-gray-600 transition-colors">Contact</a>
        </footer>
      </main>
    </div>
  )
}
