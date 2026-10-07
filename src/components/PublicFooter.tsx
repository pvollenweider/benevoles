// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import pkg from "../../package.json"
import GitHubMark from "./GitHubMark"

/**
 * Footer links: underlined (grey links must not rely on colour alone), the underline quiet at
 * rest and full on hover; at least 24 px tall (WCAG 2.5.8); the focus outline of DESIGN.md §4.
 */
const linkClass =
  "inline-flex items-center min-h-6 rounded underline underline-offset-2 decoration-gray-300 dark:decoration-gray-600 hover:decoration-current hover:text-gray-900 dark:hover:text-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

const listClass = "flex flex-wrap justify-center gap-x-5 gap-y-1"

type FooterLink = { href: string; label: string }

/** The legal pages every public page links to; the data processing agreement and the sub-processors are linked from them. */
export const FOOTER_LEGAL_LINKS: readonly FooterLink[] = [
  { href: "/legal/privacy", label: "Confidentialité" },
  { href: "/legal/terms", label: "CGU" },
  { href: "/accessibilite", label: "Accessibilité" },
]

/** Help and the organisers' sign-in, on benevol.app's own pages. */
export const FOOTER_SITE_LINKS: readonly FooterLink[] = [
  { href: "/doc", label: "Documentation" },
  { href: "/videos", label: "Tutoriels vidéo" },
  { href: "/nouveautes", label: "Nouveautés" },
  { href: "/admin/login", label: "Espace organisateur" },
]

/** On an organisation's pages, the help its volunteers need. */
export const FOOTER_EVENT_LINKS: readonly FooterLink[] = [{ href: "/doc/benevole", label: "Guide bénévole" }]

/** One link (#494): the name, the version and the code, which is on GitHub. */
function SourceLink() {
  return (
    <a
      href="https://github.com/pvollenweider/benevoles"
      target="_blank"
      rel="noopener noreferrer"
      className={`${linkClass} gap-1.5`}
    >
      <GitHubMark className="w-3.5 h-3.5" />
      benevol.app v{pkg.version}
      <span className="sr-only">, code source sur GitHub (ouvre dans un nouvel onglet)</span>
    </a>
  )
}

function LinkItems({ links }: { links: readonly FooterLink[] }) {
  return links.map((l) => (
    <li key={l.href}>
      <Link href={l.href} className={linkClass}>{l.label}</Link>
    </li>
  ))
}

/**
 * The footer of the public pages, server-rendered, in two variants:
 * - `site`, benevol.app's own pages (home, features, documentation, videos, changelog,
 *   accessibility): a primary row (help and the organisers' sign-in) above a quieter row (the
 *   project, its code and support, then the legal pages);
 * - `event` (default), the pages an organisation's audience sees (its events, a registration, a
 *   personal or sector leader link): they come for someone else's event, so one quiet row with the
 *   volunteers' guide, the legal pages and the name of the tool, no support appeal, in text-sm
 *   (read on a phone, by volunteers of every age).
 * The navigations are named « Liens utiles » (and « Informations légales »), not « Pied de
 * page », which would repeat the contentinfo role. Each group is a list, without visual separators: a « · » dangles at the
 * end of a wrapped line on a phone.
 */
export default function PublicFooter({ variant = "event" }: { variant?: "site" | "event" }) {
  if (variant === "event") {
    return (
      <footer className="mt-12 pb-6 text-sm text-gray-500 dark:text-gray-400">
        <nav aria-label="Liens utiles">
          <ul className={listClass}>
            <li><SourceLink /></li>
            <LinkItems links={[...FOOTER_EVENT_LINKS, ...FOOTER_LEGAL_LINKS]} />
          </ul>
        </nav>
      </footer>
    )
  }

  return (
    <footer className="mt-12 pb-6 text-gray-500 dark:text-gray-400">
      <nav aria-label="Liens utiles" className="text-sm text-gray-600 dark:text-gray-300">
        <ul className={listClass}>
          <LinkItems links={FOOTER_SITE_LINKS} />
        </ul>
      </nav>
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs">
        <ul className={listClass}>
          <li><SourceLink /></li>
          <li>
            <a
              href="https://buymeacoffee.com/benevol.app"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <span aria-hidden="true">☕&nbsp;</span>Soutenir le projet{" "}
              <span className="sr-only">(ouvre dans un nouvel onglet)</span>
            </a>
          </li>
        </ul>
        <nav aria-label="Informations légales">
          <ul className={listClass}>
            <LinkItems links={FOOTER_LEGAL_LINKS} />
          </ul>
        </nav>
      </div>
    </footer>
  )
}
