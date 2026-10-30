// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { APP_VERSION } from "@/lib/app-version"
import GitHubMark from "./GitHubMark"
import { INSTANCE_OPERATOR_PATH, isHostedService, siteName, supportUrl } from "@/lib/site"
import { apexHomeHref, apexHref } from "@/lib/apex-links"

/**
 * Footer links: underlined (grey links must not rely on colour alone), the underline quiet at
 * rest and full on hover; at least 24 px tall (WCAG 2.5.8); the focus outline of DESIGN.md §4.
 */
const linkClass =
  "inline-flex items-center min-h-6 max-w-full [overflow-wrap:anywhere] rounded underline underline-offset-2 decoration-gray-300 dark:decoration-gray-600 hover:decoration-current hover:text-gray-900 dark:hover:text-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

const NEW_TAB = "(ouvre dans un nouvel onglet)"
const REPOSITORY_URL = "https://github.com/pvollenweider/benevoles"

type FooterLink = { href: string; label: string; external?: boolean; github?: boolean; newTab?: boolean }
type FooterColumn = { id: string; title: string; links: readonly FooterLink[] }

/**
 * What an organisation's footer needs from the server: the site's address for the links to the
 * site's own pages (src/lib/apex-links.ts, null locally) and the instance's name for « Propulsé
 * par ». Passed down rather than read here: the event page renders this footer from a client
 * component, where the server's environment is not readable (`orgPageFooterSite`, src/lib/urls.ts).
 */
export type FooterSite = { apexBase: string | null; name: string }

/** On an organisation's host, the site's own pages are linked on the site's address (no redirect hop, #933). */
function onApex(links: readonly FooterLink[], apexBase: string | null): FooterLink[] {
  return links.map((l) => (l.external ? l : { ...l, href: apexHref(l.href, apexBase) }))
}

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
 * The instance's own pages: on the hosted service, for whom and at what price (« Pour qui ? » #872,
 * pricing #950); then help, the project (sign-in, code, support), legal. The project column
 * carries the instance's name, and the support link only when the instance has one (#760).
 */
export function footerSiteColumns(name: string = siteName(), support: string | null = supportUrl(), hosted: boolean = isHostedService()): readonly FooterColumn[] {
  return [
    ...(hosted
      ? [{
          id: "discover",
          title: "Découvrir",
          links: [
            { href: "/pour-qui", label: "Pour qui ?" },
            { href: "/tarifs", label: "Tarifs" },
          ],
        }]
      : []),
    {
      id: "help",
      title: "Aide",
      links: [
        { href: "/doc", label: "Documentation" },
        { href: "/videos", label: "Tutoriels vidéo" },
        { href: "/nouveautes", label: "Nouveautés" },
        { href: "/blog", label: "Blog" },
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

/**
 * An organisation's pages: what its volunteers (and its organisers) need, then legal. Every one of
 * these is a page of the site, linked on its address (`apexBase`) from the organisation's host.
 */
export function footerEventColumns(apexBase: string | null = null): readonly FooterColumn[] {
  const help: FooterColumn = {
    id: "help",
    title: "Aide",
    links: [
      { href: "/doc/benevole", label: "Guide bénévole" },
      { href: "/admin/login", label: "Espace organisateur" },
    ],
  }
  return [help, legalColumn()].map((col) => ({ ...col, links: onApex(col.links, apexBase) }))
}

/** The embedded sign-up (#948): legal links only, each in a new tab, the flow stays in the frame. */
export function footerEmbedLinks(apexBase: string | null = null): readonly FooterLink[] {
  return onApex(legalColumn().links, apexBase).map((l) => ({ ...l, newTab: true }))
}

function FooterAnchor({ link }: { link: FooterLink }) {
  if (link.newTab) {
    return (
      <a href={link.href} target="_blank" rel="noopener" className={linkClass}>
        {link.label}{" "}<span className="sr-only">{NEW_TAB}</span>
      </a>
    )
  }
  // A page of the site from an organisation's host is on another origin: a plain link.
  if (!link.external && /^https?:/.test(link.href)) return <a href={link.href} className={linkClass}>{link.label}</a>
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
 *   accessibility): Découvrir (« Pour qui ? », pricing; hosted service only), Aide,
 *   benevol.app (sign-in, code with the version, support), Informations légales; four columns
 *   side by side from `md`, two per row below;
 * - `event` (default), the pages an organisation's audience sees (its events, a registration, a
 *   personal or sector leader link): Aide (volunteers' guide, organisers' sign-in) and
 *   Informations légales, then a small line outside the nav: « Propulsé par <instance> » to the
 *   site's home (same tab) and the name and version of the tool to its code; no support appeal
 *   nor platform news, they come for someone else's event. Its links to the site's pages carry
 *   the site's address (`site.apexBase`): on the organisation's host a relative one was a 308.
 * The page puts it after its `</main>`: `site` inside the site container (SITE_CONTAINER_CLASS,
 * src/components/public/site-container.ts), whose width it takes, so its edges line up with the
 * header and the content; `event` at `max-w-xl`, with `px-4` when the page has no container.
 */
export default function PublicFooter({ variant = "event", site }: { variant?: "site" | "event" | "embed"; site?: FooterSite }) {
  const apexBase = site?.apexBase ?? null
  if (variant === "embed") return <EmbedFooter apexBase={apexBase} name={site?.name ?? siteName()} />
  const columns = variant === "site" ? footerSiteColumns() : footerEventColumns(apexBase)
  const width = variant === "site" ? "w-full" : "max-w-xl"
  return (
    <footer className={`${width} mx-auto mt-12 pt-8 pb-8 border-t border-gray-200 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-300`}>
      <nav aria-label="Liens utiles" className={`grid grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-6 ${variant === "event" ? "" : columns.length > 3 ? "md:grid-cols-4" : "sm:grid-cols-3"}`}>
        {columns.map((col) => (
          <div key={col.id} role="group" aria-labelledby={`footer-${variant}-${col.id}`} className="min-w-0">
            <p id={`footer-${variant}-${col.id}`} className="font-semibold text-gray-900 dark:text-gray-100 hyphens-auto [overflow-wrap:anywhere]">{col.title}</p>
            <ul className="mt-2 space-y-1">
              {col.links.map((l) => (
                <li key={l.href}><FooterAnchor link={l} /></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {variant === "event" && (
        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {/* The whole phrase is the link: its name never starts like the code link's (« benevol.app v… »). */}
          <a href={apexHomeHref(apexBase)} className={linkClass}>Propulsé par {site?.name ?? siteName()}</a>
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

/**
 * The embedded sign-up's footer (#948): no site chrome, a single line with the legal links,
 * « Propulsé par <instance> » to the site's home (#1117) and the code, every link in a new tab (the
 * site around the frame stays where it is). Still one `<footer>` and one `<nav>` « Liens utiles », after the
 * `</main>`.
 */
function EmbedFooter({ apexBase, name }: { apexBase: string | null; name: string }) {
  const links: readonly FooterLink[] = [
    ...footerEmbedLinks(apexBase),
    { href: apexHomeHref(apexBase), label: `Propulsé par ${name}`, newTab: true },
    // The source offer stays on the page itself (AGPL-3.0 §13): a volunteer may only ever see the frame.
    { href: REPOSITORY_URL, label: "Code source", external: true, github: true },
  ]
  return (
    <footer className="max-w-6xl mx-auto mt-6 pt-4 pb-4 border-t border-gray-200 text-xs text-gray-600">
      <nav aria-label="Liens utiles">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {links.map((l) => (
            <li key={l.href}><FooterAnchor link={l} /></li>
          ))}
        </ul>
      </nav>
    </footer>
  )
}
