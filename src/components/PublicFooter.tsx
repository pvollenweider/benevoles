// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { APP_VERSION } from "@/lib/app-version"
import GitHubMark from "./GitHubMark"
import { INSTANCE_OPERATOR_PATH, isHostedService, siteName, supportUrl } from "@/lib/site"

/**
 * Footer links: underlined (grey links must not rely on colour alone), the underline quiet at
 * rest and full on hover; at least 24 px tall (WCAG 2.5.8); the focus outline of DESIGN.md §4.
 */
const linkClass =
  "inline-flex items-center min-h-6 max-w-full break-words rounded underline underline-offset-2 decoration-gray-300 dark:decoration-gray-600 hover:decoration-current hover:text-gray-900 dark:hover:text-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

const NEW_TAB = "(ouvre dans un nouvel onglet)"
const REPOSITORY_URL = "https://github.com/pvollenweider/benevoles"

type FooterLink = { href: string; label: string; external?: boolean; github?: boolean }
type FooterColumn = { id: string; title: string; links: readonly FooterLink[] }

/** The hosted service's legal pages, or the instance's operator page elsewhere (#760). */
function legalColumn(hosted: boolean = isHostedService()): FooterColumn {
  return {
    id: "legal",
    title: "Informations légales",
    links: hosted
      ? [
          { href: "/legal/privacy", label: "Confidentialité" },
          { href: "/legal/terms", label: "CGU" },
          { href: "/accessibilite", label: "Accessibilité" },
        ]
      : [{ href: INSTANCE_OPERATOR_PATH, label: "Exploitant de cette instance" }],
  }
}

/**
 * The instance's own pages: help, the project (sign-in, code, support), legal. The project column
 * carries the instance's name, and the support link only when the instance has one (#760).
 */
export function footerSiteColumns(name: string = siteName(), support: string | null = supportUrl()): readonly FooterColumn[] {
  return [
    {
      id: "help",
      title: "Aide",
      links: [
        { href: "/doc", label: "Documentation" },
        { href: "/videos", label: "Tutoriels vidéo" },
        { href: "/nouveautes", label: "Nouveautés" },
      ],
    },
    {
      id: "project",
      title: name,
      links: [
        { href: "/admin/login", label: "Espace organisateur" },
        { href: REPOSITORY_URL, label: `Code source v${APP_VERSION}`, external: true, github: true },
        ...(support ? [{ href: support, label: "Soutenir le projet", external: true }] : []),
      ],
    },
    legalColumn(),
  ]
}

/** An organisation's pages: what its volunteers (and its organisers) need, then legal. */
export function footerEventColumns(): readonly FooterColumn[] {
  return [
    {
      id: "help",
      title: "Aide",
      links: [
        { href: "/doc/benevole", label: "Guide bénévole" },
        { href: "/admin/login", label: "Espace organisateur" },
      ],
    },
    legalColumn(),
  ]
}

function FooterAnchor({ link }: { link: FooterLink }) {
  if (!link.external) return <Link href={link.href} className={linkClass}>{link.label}</Link>
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={`${linkClass} gap-1.5`}>
      {link.github && <GitHubMark className="w-3.5 h-3.5" />}
      {link.label}{" "}
      <span className="sr-only">{link.github ? `sur GitHub ${NEW_TAB}` : NEW_TAB}</span>
    </a>
  )
}

/**
 * The footer of the public pages, server-rendered: one `<footer>` (contentinfo), one `<nav>`
 * « Liens utiles », and in it one column per group, its visible title a `<p>` (not a heading: the
 * columns stay out of the page outline) that names its column (`<div role="group"
 * aria-labelledby>`: NVDA says the name when Tab enters it, VoiceOver says it once). The title ids
 * are `footer-<variant>-<column>`: unique, one footer per page. Columns
 * side by side from `sm`, two per row on a phone, lists left-aligned. Two variants:
 * - `site`, benevol.app's own pages (home, features, documentation, videos, changelog, legal,
 *   accessibility): Aide, benevol.app (sign-in, code with the version, support), Informations légales;
 * - `event` (default), the pages an organisation's audience sees (its events, a registration, a
 *   personal or sector leader link): Aide (volunteers' guide, organisers' sign-in) and
 *   Informations légales, then the name and version of the tool on a small line; no support
 *   appeal nor platform news, they come for someone else's event.
 * The page puts it after its `</main>`: `site` inside the site container (SITE_CONTAINER_CLASS,
 * src/components/public/site-container.ts), whose width it takes, so its edges line up with the
 * header and the content; `event` at `max-w-xl`, with `px-4` when the page has no container.
 */
export default function PublicFooter({ variant = "event" }: { variant?: "site" | "event" }) {
  const columns = variant === "site" ? footerSiteColumns() : footerEventColumns()
  const width = variant === "site" ? "w-full" : "max-w-xl"
  return (
    <footer className={`${width} mx-auto mt-12 pt-8 pb-8 border-t border-gray-200 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-300`}>
      <nav aria-label="Liens utiles" className={`grid grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-6 ${variant === "site" ? "sm:grid-cols-3" : ""}`}>
        {columns.map((col) => (
          <div key={col.id} role="group" aria-labelledby={`footer-${variant}-${col.id}`} className="min-w-0">
            <p id={`footer-${variant}-${col.id}`} className="font-semibold text-gray-900 dark:text-gray-100">{col.title}</p>
            <ul className="mt-2 space-y-1">
              {col.links.map((l) => (
                <li key={l.href}><FooterAnchor link={l} /></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {variant === "event" && (
        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className={`${linkClass} gap-1.5`}>
            <GitHubMark className="w-3.5 h-3.5" />
            benevol.app v{APP_VERSION}
            <span className="sr-only">, code source sur GitHub {NEW_TAB}</span>
          </a>
        </p>
      )}
    </footer>
  )
}
