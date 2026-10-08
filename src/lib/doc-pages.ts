// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata, MetadataRoute } from "next"
import { SITE_NAME, seoMetadata } from "@/lib/seo-metadata"

export { SITE_NAME }

/**
 * The public content pages of the apex site, in one place: the features page, the documentation
 * and the legal pages (privacy, terms, data processing agreement and sub-processors, under /legal). Their navigation, the doc index, their metadata and the apex sitemap all read
 * this list, so a new page is declared here once and appears everywhere (SEO: the sitemap is what
 * search engines read first). Each page renders its Markdown source file directly: that file is
 * the only copy of the content, also readable on GitHub.
 */
export type PublicPage = {
  /** Path under the apex host, e.g. "/doc/admin". */
  path: string
  /** Link text in the navigation and the doc index. */
  title: string
  /** Short description for the doc index. */
  summary: string
  /** <title> of the page (without the site name, added by the metadata helper). */
  metaTitle: string
  /** Meta and social description: 70 to 160 characters, as audited (src/lib/meta-length.ts). */
  metaDescription: string
  /** Markdown file at the repo root the page is rendered from (null: written in its page.tsx); its last commit is the sitemap's lastModified (doc-lastmod.json). */
  source: string | null
  /** Sitemap priority. */
  priority: number
  /** Listed in the doc index and its navigation (the guides). */
  guide: boolean
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/fonctionnalites",
    title: "Fonctionnalités",
    summary: "Ce que fait benevol.app, besoin par besoin.",
    metaTitle: "Fonctionnalités pour organiser vos bénévoles",
    metaDescription: "Planning de bénévoles par postes et créneaux, inscription sans compte, rappels et messages, feuilles et badges du jour J : tout ce que fait benevol.app.",
    source: "FEATURES.md",
    priority: 0.9,
    guide: false,
  },
  {
    // Rendered from the released versions of CHANGELOG.md (#757, src/lib/changelog.ts).
    path: "/nouveautes",
    title: "Nouveautés",
    summary: "Ce qui a changé dans benevol.app, version par version, la plus récente en premier.",
    metaTitle: "Nouveautés, version par version",
    metaDescription: "Ce qui change dans benevol.app, version par version : nouvelles fonctionnalités, améliorations et corrections, en clair, avec leur date de mise en ligne.",
    source: "CHANGELOG.md",
    priority: 0.5,
    guide: false,
  },
  {
    path: "/accessibilite",
    title: "Accessibilité",
    summary: "Ce qui a été vérifié pour l'accessibilité, comment, et les limites connues.",
    metaTitle: "Accessibilité",
    metaDescription: "Déclaration d'accessibilité de benevol.app : niveau visé (WCAG 2.2 AA), méthode de vérification, limites connues et comment signaler un problème.",
    source: "ACCESSIBILITE.md",
    priority: 0.3,
    guide: false,
  },
  {
    path: "/legal/privacy",
    title: "Politique de confidentialité",
    summary: "Les données que benevol.app traite, pourquoi, où, combien de temps, et vos droits.",
    metaTitle: "Politique de confidentialité",
    metaDescription: "Comment benevol.app traite les données des organisateurs et des bénévoles : finalités, hébergement en France, sous-traitants, conservation et vos droits.",
    source: null,
    priority: 0.3,
    guide: false,
  },
  {
    path: "/legal/terms",
    title: "Conditions générales d'utilisation",
    summary: "Les règles d'utilisation du service, gratuit et fourni en l'état.",
    metaTitle: "Conditions générales d'utilisation",
    metaDescription: "Conditions générales d'utilisation de benevol.app : service gratuit, comptes, usage acceptable, données, responsabilité et droit suisse applicable.",
    source: null,
    priority: 0.2,
    guide: false,
  },
  {
    path: "/legal/sous-traitance",
    title: "Accord de sous-traitance",
    summary: "L'accord qui encadre les données que benevol.app traite pour votre organisation (art. 28 RGPD, art. 9 nLPD).",
    metaTitle: "Accord de sous-traitance (RGPD et nLPD)",
    metaDescription: "Accord de sous-traitance de benevol.app (art. 28 RGPD, art. 9 nLPD) : instructions, sécurité, sous-traitants, violations de données et fin du traitement.",
    source: "ACCORD-SOUS-TRAITANCE.md",
    priority: 0.2,
    guide: false,
  },
  {
    path: "/legal/sous-traitants",
    title: "Liste des sous-traitants",
    summary: "Les prestataires qui traitent les données de votre organisation, où et avec quelles garanties.",
    metaTitle: "Liste des sous-traitants",
    metaDescription: "Les prestataires qui traitent les données de votre organisation pour benevol.app : hébergement, emails, sauvegardes, suivi des erreurs, lieu et garanties.",
    source: "SOUS-TRAITANTS.md",
    priority: 0.2,
    guide: false,
  },
  {
    path: "/doc",
    title: "Documentation",
    summary: "Le point d'entrée des guides.",
    metaTitle: "Documentation",
    metaDescription: "Guides de benevol.app pour les organisateurs qui préparent un événement et ses créneaux, et pour les bénévoles qui s'inscrivent à un planning.",
    source: null,
    priority: 0.6,
    guide: false,
  },
  {
    path: "/doc/admin",
    title: "Guide administrateur",
    summary: "Créer un événement, configurer les créneaux, inviter des membres, suivre les inscriptions, et les fonctionnalités plus récentes (pages personnalisées, responsables de secteur, jalons, journaux d'activité).",
    metaTitle: "Guide administrateur",
    metaDescription: "Créer un événement, organiser postes et créneaux, inviter vos membres, suivre les inscriptions et préparer le jour J avec benevol.app, étape par étape.",
    source: "GUIDE_ADMIN.md",
    priority: 0.8,
    guide: true,
  },
  {
    path: "/doc/benevole",
    title: "Guide bénévole",
    summary: "S'inscrire à un créneau, recevoir sa confirmation, gérer son inscription.",
    metaTitle: "Guide bénévole",
    metaDescription: "S'inscrire à un créneau sans créer de compte, recevoir sa confirmation, retrouver son planning et modifier ou annuler son inscription sur benevol.app.",
    // Split into units (#649): GUIDE_BENEVOLE.md is the welcome above their index.
    source: "GUIDE_BENEVOLE.md",
    priority: 0.8,
    guide: true,
  },
]

/** Kept for the doc pages: the documentation entries (index and guides). */
export const DOC_PAGES = PUBLIC_PAGES.filter((p) => p.path === "/doc" || p.path.startsWith("/doc/"))

/** The guides, for the doc index. */
export const DOC_GUIDES = PUBLIC_PAGES.filter((p) => p.guide)

/** The header navigation of the public content pages: features, then the guides. */
export const CONTENT_NAV = PUBLIC_PAGES.filter((p) => p.path === "/fonctionnalites" || p.guide)

export function publicPage(path: string): PublicPage {
  const page = PUBLIC_PAGES.find((p) => p.path === path)
  if (!page) throw new Error(`Unknown public page: ${path}`)
  return page
}

/**
 * Metadata of a public content page: its own title and description, an absolute canonical on
 * the apex host (the same page also answers on organisation subdomains), Open Graph and Twitter
 * with its own social card, indexable (src/lib/seo-metadata.ts).
 */
export function publicPageMetadata(path: string, base: string): Metadata {
  const page = publicPage(path)
  return seoMetadata({
    base,
    path: page.path,
    title: page.metaTitle,
    description: page.metaDescription,
    type: "website",
    imageAlt: `${page.title}, ${SITE_NAME}`,
  })
}

/**
 * Links between source files become site links: FEATURES.md links to GUIDE_ADMIN.md so that it
 * reads well on GitHub; rendered on the site, the same link points to /doc/admin (an anchor is
 * kept). The same goes for the documentation units (#649, src/lib/doc-units.ts): `](guide/x.md#y)`
 * from a file at the root, or `](x.md#y)` from another unit of guide/, becomes `](/doc/x#y)`; a
 * unit links to a root source with `](../GUIDE_ADMIN.md)`. Only a lower-case file name is a unit
 * (guide/README.md, the index, isn't one).
 */
export function linkSourcesToRoutes(markdown: string): string {
  const pages = PUBLIC_PAGES.reduce((md, p) => {
    const file = p.source
    if (!file) return md
    const source = new RegExp(`\\]\\((?:\\.\\./)?${escapeRegExp(file)}(#[^)\\s]*)?\\)`, "g")
    return md.replace(source, (_match, anchor: string | undefined) => `](${p.path}${anchor ?? ""})`)
  }, markdown)
  return pages.replace(UNIT_LINK_RE, (_match, slug: string, anchor: string | undefined) => `](/doc/${slug}${anchor ?? ""})`)
}

/** Escapes every character with a meaning in a regular expression (backslash included). */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
}

/** `](guide/x.md#y)` or `](x.md#y)`: a link to a documentation unit by its file. */
const UNIT_LINK_RE = /\]\((?:guide\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md(#[^)\s]*)?\)/g

/** The source's own first-level title (the page's <h1>) and the rest of the document. */
export function splitTitle(markdown: string): { title: string | null; body: string } {
  const m = markdown.match(/^# (.+)\n/)
  return m ? { title: m[1].trim(), body: markdown.slice(m[0].length) } : { title: null, body: markdown }
}

/**
 * Sitemap entries of the apex host: the marketing home, every public content page, then the
 * documentation units (`/doc/<slug>`, #649) in reading order. `modifiedAt` gives a page's last
 * change from its source file (null when unknown), injected, like the units, so the list stays
 * pure and testable.
 */
export function apexSitemap(
  base: string,
  modifiedAt: (source: string) => Date | null,
  units: readonly { slug: string; source: string }[] = [],
): MetadataRoute.Sitemap {
  const root = base.replace(/\/+$/, "")
  const entry = (pagePath: string, source: string | null, priority: number) => {
    const lastModified = source ? modifiedAt(source) : null
    return { url: `${root}${pagePath}`, changeFrequency: "monthly" as const, priority, ...(lastModified ? { lastModified } : {}) }
  }
  return [
    { url: `${root}/`, changeFrequency: "weekly", priority: 1 },
    ...PUBLIC_PAGES.map((p) => entry(p.path, p.source, p.priority)),
    ...units.map((u) => entry(`/doc/${u.slug}`, u.source, DOC_UNIT_PRIORITY)),
  ]
}

/** Sitemap priority of a documentation unit: under the guides' indexes, above the legal pages. */
export const DOC_UNIT_PRIORITY = 0.5
