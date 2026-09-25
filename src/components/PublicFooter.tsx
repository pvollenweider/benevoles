import Link from "next/link"
import pkg from "../../package.json"

const linkClass =
  "py-1 underline underline-offset-2 hover:text-gray-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"

export default function PublicFooter() {
  return (
    <footer className="mt-12 pb-6 text-sm text-gray-500">
      <nav aria-label="Pied de page" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <a
          href="https://github.com/pvollenweider/benevoles"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          benevol.app
          <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
        </a>
        <span aria-hidden="true" className="select-none py-1">·</span>
        <span className="py-1">v{pkg.version}</span>
        <span aria-hidden="true" className="select-none py-1">·</span>
        <Link href="/doc" className={linkClass}>Documentation</Link>
        <span aria-hidden="true" className="select-none py-1">·</span>
        <Link href="/legal/terms" className={linkClass}>CGU</Link>
        <span aria-hidden="true" className="select-none py-1">·</span>
        <Link href="/legal/privacy" className={linkClass}>Confidentialité</Link>
        <span aria-hidden="true" className="select-none py-1">·</span>
        <Link href="/admin/login" className={linkClass}>Espace organisateur</Link>
      </nav>
    </footer>
  )
}
