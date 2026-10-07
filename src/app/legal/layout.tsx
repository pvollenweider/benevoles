import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

// The browser bar takes the colour of the legal pages' white header.
export const viewport = { themeColor: "#ffffff" }

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <SkipLink />
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors">
            benevol.app
          </Link>
          <span className="text-xs text-gray-500">Documents légaux</span>
        </div>
      </header>

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="max-w-3xl mx-auto px-6 py-12 focus:outline-none">
        <article className="prose prose-gray max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h1:text-2xl prose-h1:mb-2 prose-h1:pb-4 prose-h1:border-b prose-h1:border-gray-200
          prose-h2:text-base prose-h2:mt-10 prose-h2:mb-3
          prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-gray-700
          prose-p:text-sm prose-p:text-gray-600 prose-p:leading-relaxed
          prose-li:text-sm prose-li:text-gray-600
          prose-a:text-blue-600 prose-a:underline prose-a:underline-offset-2 hover:prose-a:decoration-2
          prose-strong:text-gray-800 prose-strong:font-semibold
          prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-700 prose-code:before:content-none prose-code:after:content-none
          prose-table:text-sm prose-th:text-xs prose-th:uppercase prose-th:tracking-wider prose-th:text-gray-500 prose-th:font-medium
          prose-td:text-gray-600 prose-td:align-top
        ">
          {children}
        </article>
      </main>

      {/* After </main>: a footer inside main loses its contentinfo role. The processing agreement
          and the sub-processors list are linked from the privacy policy, the terms and each other. */}
      <div className="max-w-3xl mx-auto px-6">
        <PublicFooter variant="site" />
      </div>
    </div>
  )
}
