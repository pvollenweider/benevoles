import Link from "next/link"
import pkg from "../../package.json"

export default function PublicFooter() {
  return (
    <footer className="mt-12 pb-6 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-gray-400">
      <a
        href="https://github.com/pvollenweider/benevoles"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-600 transition-colors"
      >
        benevol.app
      </a>
      <span className="select-none">·</span>
      <span>v{pkg.version}</span>
      <span className="select-none">·</span>
      <Link href="/legal/terms" className="hover:text-gray-600 transition-colors">CGU</Link>
      <span className="select-none">·</span>
      <Link href="/legal/privacy" className="hover:text-gray-600 transition-colors">Confidentialité</Link>
    </footer>
  )
}
