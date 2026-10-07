import Link from "next/link"
import type { LandingStartLink } from "@/lib/landing-start-guides"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"

/**
 * « Bien démarrer » on the home page (#764): the essential guides, each linked by its title with
 * its summary below, then the whole documentation. A list, so its length is announced.
 */
export default function LandingStartGuides({ links }: { links: readonly LandingStartLink[] }) {
  if (links.length === 0) return null
  return (
    <section aria-labelledby="start-heading" className="border-t border-gray-200 px-4 sm:px-6 py-20 sm:py-24">
      <div className="max-w-6xl mx-auto">
        <h2 id="start-heading" className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
          Bien démarrer
        </h2>
        <p className="mt-4 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl">
          Les guides essentiels, dans l&apos;ordre où vous en aurez besoin.
        </p>
        <ul role="list" className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={`text-lg font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900 rounded ${focusRing}`}>
                {link.title}
              </Link>
              <p className="mt-2 text-base text-gray-600 leading-relaxed">{link.summary}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12">
          <Link href="/doc" className={`text-lg font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900 rounded ${focusRing}`}>
            Toute la documentation<span aria-hidden="true"> →</span>
          </Link>
        </p>
      </div>
    </section>
  )
}
