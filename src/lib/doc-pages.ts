// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata, MetadataRoute } from "next"
import { SITE_NAME, seoMetadata } from "@/lib/seo-metadata"
import { HOSTED_SERVICE_URL, isHostedService } from "@/lib/site"

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
  /**
   * Where the page exists (#760): everywhere (default), on the hosted service only (its legal
   * pages, accessibility statement, marketing), or on other instances only (the operator page).
   */
  availability?: "hosted" | "instance"
  /**
   * A page for one kind of association (#872): listed under « Pour qui ? » in the header
   * navigation and on its index page (AUDIENCE_INDEX_PATH), its breadcrumb under that index.
   */
  audience?: boolean
  /**
   * A page that presents the hosted service (the editorial, audience and pricing pages): on an
   * instance where it doesn't exist, a link to its source from a shared Markdown file (FEATURES.md)
   * points at it on the hosted service (HOSTED_SERVICE_URL) instead of a 404. Documentation,
   * videos and legal pages are never rewritten: they describe this instance.
   */
  presentation?: boolean
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/legal/exploitant",
    title: "Exploitant de cette instance",
    summary: "Qui exploite cette instance, et à qui écrire pour vos données personnelles.",
    metaTitle: "Exploitant de cette instance",
    metaDescription: "Qui exploite cette instance du logiciel de planning bénévole, et à qui écrire pour une question sur le service ou sur vos données personnelles.",
    source: null,
    priority: 0.3,
    guide: false,
    availability: "instance",
  },
  {
    path: "/fonctionnalites",
    title: "Fonctionnalités",
    summary: `Ce que fait ${SITE_NAME}, besoin par besoin.`,
    metaTitle: "Fonctionnalités pour organiser vos bénévoles",
    metaDescription: `Planning de bénévoles par postes et créneaux, inscription sans compte, rappels et messages, feuilles et badges du jour J : tout ce que fait ${SITE_NAME}.`,
    source: "FEATURES.md",
    priority: 0.9,
    guide: false,
  },
  {
    // An editorial page (#767), laid out like /fonctionnalites (src/lib/features-page.ts), for
    // people who search for a volunteer scheduling tool: what it does, then a visible FAQ that is
    // also its FAQPage structured data. Linked from the home and /fonctionnalites, not from the
    // header navigation.
    path: "/logiciel-planning-benevoles",
    title: "Logiciel de planning pour bénévoles",
    summary: "Ce que fait un logiciel de planning pour bénévoles, côté organisateur et côté bénévole, et les questions qu'on se pose avant de choisir.",
    metaTitle: "Logiciel de planning pour bénévoles, gratuit",
    metaDescription: "Le planning de vos bénévoles : postes et créneaux, inscription par lien sans compte ni application, rappels, jour J et heures. Gratuit, hébergé en France.",
    source: "LOGICIEL-PLANNING-BENEVOLES.md",
    priority: 0.8,
    guide: false,
    availability: "hosted",
    presentation: true,
  },
  {
    // The audience pages (#872): one per kind of association, laid out like
    // /logiciel-planning-benevoles, each with its own situations, guides, videos and FAQ (its
    // FAQPage structured data). Their index is /pour-qui; the header lists them under « Pour qui ? ».
    // Slugs from the searches an organiser types: « bénévoles fête de village », « bénévoles
    // festival », « bénévoles manifestation sportive », « planning permanences bénévoles ».
    path: "/pour-qui",
    title: "Pour qui ?",
    summary: `Les situations pour lesquelles ${SITE_NAME} est fait : fête de village, festival, manifestation sportive et permanences qui reviennent chaque semaine.`,
    metaTitle: "Pour qui : fêtes, festivals, courses, permanences",
    metaDescription: `Fête de village, festival, course ou permanences chaque semaine : comment ${SITE_NAME} organise les bénévoles de votre association, situation par situation.`,
    source: "POUR-QUI.md",
    priority: 0.7,
    guide: false,
    availability: "hosted",
    presentation: true,
  },
  {
    path: "/benevoles-fete-de-village",
    title: "Fêtes de village et comités des fêtes",
    summary: "La buvette, les grillades, le montage et le démontage d'une fête de village, et l'édition de l'an dernier reprise en quelques minutes.",
    metaTitle: "Planning des bénévoles d'une fête de village",
    metaDescription: "Le planning des bénévoles d’une fête de village : buvette, grillades, montage et démontage, l’édition précédente reprise, des rappels automatiques.",
    source: "BENEVOLES-FETE-DE-VILLAGE.md",
    priority: 0.7,
    guide: false,
    availability: "hosted",
    presentation: true,
    audience: true,
  },
  {
    path: "/benevoles-festival",
    title: "Festivals",
    summary: "Plusieurs jours, des soirées qui finissent après minuit, le montage et le démontage, des responsables par poste et des désistements à remplacer.",
    metaTitle: "Planning des bénévoles d'un festival",
    metaDescription: "Le planning des bénévoles d’un festival sur plusieurs jours : montage, soirées, démontage, créneaux de nuit, responsables de poste et remplaçants.",
    source: "BENEVOLES-FESTIVAL.md",
    priority: 0.7,
    guide: false,
    availability: "hosted",
    presentation: true,
    audience: true,
  },
  {
    path: "/benevoles-manifestation-sportive",
    title: "Manifestations sportives et courses",
    summary: "Des signaleurs sur le parcours, les dossards et le ravitaillement le matin de la course, chacun avec son point de rendez-vous et un contact sur place.",
    metaTitle: "Bénévoles d'une manifestation sportive",
    metaDescription: "Signaleurs, dossards, ravitaillement : le planning des bénévoles d’une course ou d’une manifestation sportive, avec consignes et présences le jour J.",
    source: "BENEVOLES-MANIFESTATION-SPORTIVE.md",
    priority: 0.7,
    guide: false,
    availability: "hosted",
    presentation: true,
    audience: true,
  },
  {
    path: "/planning-permanences-benevoles",
    title: "Permanences régulières",
    summary: "Une épicerie participative, une distribution alimentaire, un repair café ou un accueil : des permanences chaque semaine, jours fériés exclus.",
    metaTitle: "Planning des permanences de bénévoles",
    metaDescription: "Épicerie participative, distribution alimentaire, repair café : des permanences chaque semaine, jours fériés exclus, réparties entre vos bénévoles.",
    source: "PLANNING-PERMANENCES-BENEVOLES.md",
    priority: 0.7,
    guide: false,
    availability: "hosted",
    presentation: true,
    audience: true,
  },
  {
    // The price (#950): free software (AGPL, self-hostable) apart from the hosted service, free
    // today. Its wording on the future of the service is the owner's (monetisation epic #635): no
    // promise of permanent gratuity, notice period or amount.
    path: "/tarifs",
    title: "Tarifs",
    summary: `${SITE_NAME} est un logiciel libre, et son hébergement est gratuit aujourd'hui : ce qui est compris, pourquoi, et les seuls garde-fous.`,
    metaTitle: "Tarifs : logiciel libre, hébergement gratuit",
    metaDescription: `${SITE_NAME} est un logiciel libre sous licence AGPL, que vous pouvez installer vous-même. Son hébergement est gratuit aujourd’hui, sans fonction payante.`,
    source: "TARIFS.md",
    priority: 0.7,
    guide: false,
    availability: "hosted",
    presentation: true,
  },
  {
    // Spreadsheet and chat group, or a dedicated tool? (#871): what the usual combination does
    // well, where it gets heavy, and a decision list. Facts about the app only (FEATURES.md rules).
    path: "/tableur-ou-outil-dedie",
    title: "Tableur et groupe de discussion, ou outil dédié ?",
    summary: "Ce qu'un tableur et un groupe de discussion font bien, ce qui devient plus lourd quand l'événement grandit, et quand un outil dédié aide.",
    metaTitle: "Tableur et groupe de discussion, ou outil dédié ?",
    metaDescription: "Tableur et groupe de discussion, ou outil de planning pour vos bénévoles ? Ce que chacun fait bien, et une liste simple pour décider.",
    source: "TABLEUR-OU-OUTIL-DEDIE.md",
    priority: 0.6,
    guide: false,
    availability: "hosted",
    presentation: true,
  },
  {
    // The target of every « Demander un espace » (#810), written in its page.tsx. In the sitemap
    // like the other apex pages (#934): it is where an association searching for the service
    // starts, and it exists on every instance (a closed sign-up shows why, with a contact).
    path: "/inscription",
    title: "Demander un espace",
    summary: "Créer l'espace de votre association : le préparer tout de suite, le publier après une courte vérification.",
    metaTitle: "Demander un espace pour votre association",
    metaDescription: `Créez gratuitement l'espace de votre association sur ${SITE_NAME} : préparez votre événement aussitôt, la publication suit une courte vérification.`,
    source: null,
    priority: 0.6,
    guide: false,
  },
  {
    // Rendered from the released versions of CHANGELOG.md (#757, src/lib/changelog.ts).
    path: "/nouveautes",
    title: "Nouveautés",
    summary: `Ce qui a changé dans ${SITE_NAME}, version par version, la plus récente en premier.`,
    metaTitle: "Nouveautés, version par version",
    metaDescription: `Ce qui change dans ${SITE_NAME}, version par version : nouvelles fonctionnalités, améliorations et corrections, en clair, avec leur date de mise en ligne.`,
    source: "CHANGELOG.md",
    priority: 0.5,
    guide: false,
  },
  {
    // The product newsletters, archived (#944): an index of the posts of blog/ (src/lib/blog.ts),
    // newest first, one page per post at /blog/<slug> (in the sitemap after the documentation).
    path: "/blog",
    title: "Blog",
    summary: `Les nouvelles de ${SITE_NAME}, une par version, la plus récente en premier.`,
    metaTitle: "Le blog, les nouvelles du produit",
    metaDescription: `Les nouvelles de ${SITE_NAME}, une par version : ce qui change pour les organisateurs et les bénévoles, expliqué en clair, la plus récente en premier.`,
    source: null,
    priority: 0.5,
    guide: false,
  },
  {
    path: "/accessibilite",
    title: "Accessibilité",
    summary: "Ce qui a été vérifié pour l'accessibilité, comment, et les limites connues.",
    metaTitle: "Déclaration d'accessibilité",
    metaDescription: `Déclaration d'accessibilité de ${SITE_NAME} : niveau visé (WCAG 2.2 AA), méthode de vérification, limites connues et comment signaler un problème.`,
    source: "ACCESSIBILITE.md",
    priority: 0.3,
    guide: false,
    availability: "hosted",
  },
  {
    path: "/legal/privacy",
    title: "Politique de confidentialité",
    summary: `Les données que ${SITE_NAME} traite, pourquoi, où, combien de temps, et vos droits.`,
    metaTitle: "Politique de confidentialité",
    metaDescription: `Comment ${SITE_NAME} traite les données des organisateurs et des bénévoles : finalités, hébergement en France, sous-traitants, conservation et vos droits.`,
    source: null,
    priority: 0.3,
    guide: false,
    availability: "hosted",
  },
  {
    path: "/legal/terms",
    title: "Conditions générales d'utilisation",
    summary: "Les règles d'utilisation du service, gratuit et fourni en l'état.",
    metaTitle: "Conditions générales d'utilisation",
    metaDescription: `Conditions générales d'utilisation de ${SITE_NAME} : service gratuit, comptes, usage acceptable, données, responsabilité et droit suisse applicable.`,
    source: null,
    priority: 0.2,
    guide: false,
    availability: "hosted",
  },
  {
    path: "/legal/sous-traitance",
    title: "Accord de sous-traitance",
    summary: `L'accord qui encadre les données que ${SITE_NAME} traite pour votre organisation (art. 28 RGPD, art. 9 nLPD).`,
    metaTitle: "Accord de sous-traitance (RGPD et nLPD)",
    metaDescription: `Accord de sous-traitance de ${SITE_NAME} (art. 28 RGPD, art. 9 nLPD) : instructions, sécurité, sous-traitants, violations de données et fin du traitement.`,
    source: "ACCORD-SOUS-TRAITANCE.md",
    priority: 0.2,
    guide: false,
    availability: "hosted",
  },
  {
    path: "/legal/sous-traitants",
    title: "Liste des sous-traitants",
    summary: "Les prestataires qui traitent les données de votre organisation, où et avec quelles garanties.",
    metaTitle: "Liste des sous-traitants",
    metaDescription: `Les prestataires qui traitent les données de votre organisation pour ${SITE_NAME} : hébergement, emails, sauvegardes, suivi des erreurs, lieu et garanties.`,
    source: "SOUS-TRAITANTS.md",
    priority: 0.2,
    guide: false,
    availability: "hosted",
  },
  {
    path: "/doc",
    title: "Documentation",
    summary: "Le point d'entrée des guides.",
    metaTitle: "Documentation pour organisateurs et bénévoles",
    metaDescription: `Guides de ${SITE_NAME} pour les organisateurs qui préparent un événement et ses créneaux, et pour les bénévoles qui s'inscrivent à un planning.`,
    source: null,
    priority: 0.6,
    guide: false,
  },
  {
    path: "/doc/admin",
    title: "Guide administrateur",
    summary: "Créer un événement, configurer les créneaux, inviter des membres, suivre les inscriptions, et les fonctionnalités plus récentes (pages personnalisées, responsables de secteur, jalons, journaux d'activité).",
    metaTitle: "Guide administrateur",
    metaDescription: `Créer un événement, organiser postes et créneaux, inviter vos membres, suivre les inscriptions et préparer le jour J avec ${SITE_NAME}, étape par étape.`,
    source: "GUIDE_ADMIN.md",
    priority: 0.8,
    guide: true,
  },
  {
    path: "/doc/benevole",
    title: "Guide bénévole",
    summary: "S'inscrire à un créneau, recevoir sa confirmation, gérer son inscription.",
    metaTitle: "Guide bénévole : s'inscrire et gérer ses créneaux",
    metaDescription: `S'inscrire à un créneau sans créer de compte, recevoir sa confirmation, retrouver son planning et modifier ou annuler son inscription sur ${SITE_NAME}.`,
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

/** The header navigation of the public content pages: features, the guides, then the blog (#944). */
export const CONTENT_NAV = [
  ...PUBLIC_PAGES.filter((p) => p.path === "/fonctionnalites" || p.guide),
  ...PUBLIC_PAGES.filter((p) => p.path === "/blog"),
]

/** The index of the audience pages (#872): « Toutes les situations » under « Pour qui ? ». */
export const AUDIENCE_INDEX_PATH = "/pour-qui"

/** The audience pages (#872), in the order of the « Pour qui ? » list. */
export const AUDIENCE_PAGES = PUBLIC_PAGES.filter((p) => p.audience)

/** A link of the « Pour qui ? » list of the header. */
export type AudienceNavLink = { path: string; title: string }

/**
 * The « Pour qui ? » list of the header (#872): the audience pages, then their index. Empty on an
 * instance that is not the hosted service (#760), where these pages don't exist.
 */
export function audienceNav(hosted: boolean = isHostedService()): AudienceNavLink[] {
  const index = publicPage(AUDIENCE_INDEX_PATH)
  if (!pageAvailable(index, hosted)) return []
  return [...AUDIENCE_PAGES.filter((p) => pageAvailable(p, hosted)), index].map((p) => ({ path: p.path, title: p.path === AUDIENCE_INDEX_PATH ? "Toutes les situations" : p.title }))
}

/** Whether a public page exists on this instance (#760). */
export function pageAvailable(page: Pick<PublicPage, "availability">, hosted: boolean = isHostedService()): boolean {
  if (page.availability === "hosted") return hosted
  if (page.availability === "instance") return !hosted
  return true
}

/** The public pages this instance shows: the sitemap, llms.txt and the doc index use them. */
export function availablePublicPages(hosted: boolean = isHostedService()): PublicPage[] {
  return PUBLIC_PAGES.filter((p) => pageAvailable(p, hosted))
}

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
 * (guide/README.md, the index, isn't one). On an instance that is not the hosted service, a link
 * to a presentation page it doesn't have (the audience pages, /tarifs…) becomes an absolute link to
 * the hosted service; every other link stays relative.
 */
export function linkSourcesToRoutes(markdown: string, hosted: boolean = isHostedService()): string {
  const pages = PUBLIC_PAGES.reduce((md, p) => {
    const file = p.source
    if (!file) return md
    const source = new RegExp(`\\]\\((?:\\.\\./)?${escapeRegExp(file)}(#[^)\\s]*)?\\)`, "g")
    // A presentation page this instance doesn't have (#760) is linked on the hosted service.
    const target = p.presentation && !pageAvailable(p, hosted) ? `${HOSTED_SERVICE_URL}${p.path}` : p.path
    return md.replace(source, (_match, anchor: string | undefined) => `](${target}${anchor ?? ""})`)
  }, markdown)
  return pages.replace(UNIT_LINK_RE, (_match, slug: string, anchor: string | undefined) => `](/doc/${slug}${anchor ?? ""})`)
}

/** Escapes every character with a meaning in a regular expression (backslash included). */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
}

/** `](guide/x.md#y)` or `](x.md#y)`: a link to a documentation unit by its file. */
const UNIT_LINK_RE = /\]\((?:guide\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md(#[^)\s]*)?\)/g

/**
 * The source's own first-level title (the page's <h1>) and the rest of the document. HTML comments
 * before the title (a note to the authors, such as the draft marker of an editorial page) are
 * dropped with it: never rendered, never mistaken for the title.
 */
export function splitTitle(markdown: string): { title: string | null; body: string } {
  const source = markdown.replace(LEADING_COMMENTS_RE, "")
  const m = source.match(/^# (.+)\n/)
  return m ? { title: m[1].trim(), body: source.slice(m[0].length) } : { title: null, body: markdown }
}

/** Blank lines and HTML comments at the very start of a source. */
const LEADING_COMMENTS_RE = /^(?:\s*<!--[\s\S]*?-->)*\s*/

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
  hosted: boolean = isHostedService(),
  posts: readonly { slug: string; date: string }[] = [],
): MetadataRoute.Sitemap {
  const root = base.replace(/\/+$/, "")
  const day = (date: string) => new Date(`${date}T00:00:00Z`)
  const entry = (pagePath: string, source: string | null, priority: number) => {
    // The blog's index changes with its newest post (#944), the day it was sent.
    const lastModified = source ? modifiedAt(source) : pagePath === "/blog" && posts.length > 0 ? day([...posts].sort((a, b) => b.date.localeCompare(a.date))[0].date) : null
    return { url: `${root}${pagePath}`, changeFrequency: "monthly" as const, priority, ...(lastModified ? { lastModified } : {}) }
  }
  return [
    { url: `${root}/`, changeFrequency: "weekly", priority: 1 },
    ...availablePublicPages(hosted).map((p) => entry(p.path, p.source, p.priority)),
    ...units.map((u) => entry(`/doc/${u.slug}`, u.source, DOC_UNIT_PRIORITY)),
    // The blog's posts (#944): a post doesn't change once sent, its date is its last change.
    ...posts.map((p) => ({ url: `${root}/blog/${p.slug}`, changeFrequency: "yearly" as const, priority: BLOG_POST_PRIORITY, lastModified: day(p.date) })),
  ]
}

/** Sitemap priority of a documentation unit: under the guides' indexes, above the legal pages. */
export const DOC_UNIT_PRIORITY = 0.5

/** Sitemap priority of a blog post (#944): under the documentation, a dated piece of news. */
export const BLOG_POST_PRIORITY = 0.4
