import Link from "next/link"
import { SITE_NAME } from "@/lib/seo-metadata"
import PublicFooter from "@/components/PublicFooter"
// The shared prose recipe of the content pages (focus outline on links, scroll-mt on headings);
// its dark: variants are inert here, the legal pages have no dark scope.
import { CONTENT_PROSE_CLASS } from "@/components/public/ContentShell"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { SITE_CONTAINER_CLASS, SITE_READING_COLUMN_CLASS } from "@/components/public/site-container"

// The browser bar takes the colour of the legal pages' white header.
export const viewport = { themeColor: "#ffffff" }

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <SkipLink />
      <header className="border-b border-gray-100">
        <div className={`${SITE_CONTAINER_CLASS} py-4 flex items-center justify-between`}>
          <Link href="/" className="inline-flex py-3 -my-3 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            {SITE_NAME}
          </Link>
          <span className="text-xs text-gray-500">Documents légaux</span>
        </div>
      </header>

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${SITE_CONTAINER_CLASS} py-12 focus:outline-none`}>
        <article className={`${CONTENT_PROSE_CLASS} ${SITE_READING_COLUMN_CLASS}`}>
          {children}
        </article>
      </main>

      {/* After </main>: a footer inside main loses its contentinfo role. The processing agreement
          and the sub-processors list are linked from the privacy policy, the terms and each other.
          Header, content and footer share the site container: their edges line up. */}
      <div className={SITE_CONTAINER_CLASS}>
        <PublicFooter variant="site" />
      </div>
    </div>
  )
}
