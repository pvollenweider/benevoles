// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { DOC_ROLE_INFO, docGroup, docGroupHref, type DocUnit } from "@/lib/doc-units"
import { publicPage } from "@/lib/doc-pages"
import { SITE_NAME, absoluteUrl, socialImagePath } from "@/lib/seo-metadata"

/**
 * The structured data (schema.org JSON-LD) of the public pages of the apex site. Every node is a
 * fact the page itself shows or the legal pages state: the publisher, the site, the application
 * (free, open source, a web application), the breadcrumb a page draws, a documentation unit as a
 * technical article. No price other than « free », no rating, no review: none is published. The
 * nodes share stable `@id`s on the apex home (`/#organization`, `/#website`, `/#application`), so
 * search engines tie every page to the same publisher. Pure: the base URL is passed in.
 */

export const REPOSITORY_URL = "https://github.com/pvollenweider/benevoles"
export const CONTACT_EMAIL = "contact@benevol.app"
export const LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html"

export type JsonLdNode = Record<string, unknown>

const homeUrl = (base: string) => absoluteUrl(base, "/")
const idOf = (base: string, name: string) => ({ "@id": `${homeUrl(base)}#${name}` })

/** The publisher: benevol.app, its logo, its contact and its code. */
export function organizationNode(base: string): JsonLdNode {
  return {
    "@type": "Organization",
    ...idOf(base, "organization"),
    name: SITE_NAME,
    url: homeUrl(base),
    logo: absoluteUrl(base, "/apple-icon.png"),
    email: CONTACT_EMAIL,
    sameAs: [REPOSITORY_URL],
  }
}

/** The site itself, in French, published by the organization. */
export function websiteNode(base: string): JsonLdNode {
  return {
    "@type": "WebSite",
    ...idOf(base, "website"),
    url: homeUrl(base),
    name: SITE_NAME,
    inLanguage: "fr",
    publisher: idOf(base, "organization"),
  }
}

/** The application: a web application for organisations, free (price 0) and open source (AGPL). */
export function softwareApplicationNode(base: string, description: string): JsonLdNode {
  return {
    "@type": "SoftwareApplication",
    ...idOf(base, "application"),
    name: SITE_NAME,
    url: homeUrl(base),
    description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "fr",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "CHF" },
    license: LICENSE_URL,
    image: absoluteUrl(base, "/og-image.png"),
    publisher: idOf(base, "organization"),
  }
}

/** The source code, linked to the application it builds. */
export function softwareSourceCodeNode(base: string): JsonLdNode {
  return {
    "@type": "SoftwareSourceCode",
    ...idOf(base, "code"),
    name: "benevoles",
    codeRepository: REPOSITORY_URL,
    programmingLanguage: "TypeScript",
    license: LICENSE_URL,
    targetProduct: idOf(base, "application"),
  }
}

export type Crumb = { name: string; path?: string }

/**
 * The breadcrumb of a page, as the page draws it (or as its place in the site reads, from the
 * home): every item but the last links to its page, the last one is the page itself.
 */
export function breadcrumbNode(base: string, pagePath: string, crumbs: readonly Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(base, pagePath)}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.path ? { item: absoluteUrl(base, c.path) } : {}),
    })),
  }
}

/** A page of the site: its address, name, description, language and social card. */
export function webPageNode(
  base: string,
  page: { path: string; name: string; description: string; type?: "WebPage" | "CollectionPage" },
): JsonLdNode {
  const url = absoluteUrl(base, page.path)
  return {
    "@type": page.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.name,
    description: page.description,
    inLanguage: "fr",
    isPartOf: idOf(base, "website"),
    publisher: idOf(base, "organization"),
    primaryImageOfPage: { "@type": "ImageObject", url: absoluteUrl(base, socialImagePath(page.path)), width: 1200, height: 630 },
    breadcrumb: { "@id": `${url}#breadcrumb` },
  }
}

/** A question and its answer, word for word as the page shows them. */
export type FaqItem = { question: string; answer: string }

/**
 * The FAQ a page shows, as a FAQPage: only ever built from the questions the page itself renders
 * (search engines ignore, or penalise, structured data the page does not show).
 */
export function faqPageNode(base: string, pagePath: string, faq: readonly FaqItem[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": `${absoluteUrl(base, pagePath)}#faq`,
    inLanguage: "fr",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  }
}

/** A JSON-LD document of several nodes. */
export function jsonLdGraph(nodes: readonly JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes }
}

/** Where a public page sits under the home: its section (Documentation, legal pages), then itself. */
function publicPageCrumbs(path: string, title: string): Crumb[] {
  const home = { name: "Accueil", path: "/" }
  if (path === "/doc") return [home, { name: "Documentation" }]
  if (path.startsWith("/doc/")) return [home, { name: "Documentation", path: "/doc" }, { name: title }]
  return [home, { name: title }]
}

/** The pages that present the application itself, so their structured data describes it too. */
const APPLICATION_PAGES: readonly string[] = ["/fonctionnalites", "/logiciel-planning-benevoles", "/remplacer-tableur-benevoles"]

/**
 * The structured data of a public content page (src/lib/doc-pages.ts): the page, its breadcrumb,
 * the site and its publisher; the pages that present the application also describe it, and a page
 * with a visible FAQ passes its questions for a FAQPage.
 */
export function publicPageJsonLd(path: string, base: string, faq: readonly FaqItem[] = []): JsonLdNode {
  const page = publicPage(path)
  const nodes: JsonLdNode[] = [
    webPageNode(base, { path: page.path, name: page.metaTitle, description: page.metaDescription, type: page.path === "/doc" ? "CollectionPage" : "WebPage" }),
    breadcrumbNode(base, page.path, publicPageCrumbs(page.path, page.title)),
    websiteNode(base),
    organizationNode(base),
  ]
  if (APPLICATION_PAGES.includes(page.path)) nodes.push(softwareApplicationNode(base, page.metaDescription))
  if (faq.length > 0) nodes.push(faqPageNode(base, page.path, faq))
  return jsonLdGraph(nodes)
}

/**
 * The structured data of a documentation unit (#649): a technical article in French by
 * benevol.app, for its audiences, in its group, with its last change when known; and its
 * breadcrumb, the one the page draws (Documentation, the group, the unit).
 */
export function docUnitJsonLd(unit: DocUnit, base: string, dateModified?: Date | null): JsonLdNode {
  const path = `/doc/${unit.slug}`
  const url = absoluteUrl(base, path)
  const group = docGroup(unit.group)
  const article: JsonLdNode = {
    "@type": "TechArticle",
    "@id": `${url}#article`,
    url,
    mainEntityOfPage: url,
    headline: unit.title,
    description: unit.summary,
    inLanguage: "fr",
    articleSection: group.title,
    audience: unit.roles.map((role) => ({ "@type": "Audience", audienceType: DOC_ROLE_INFO[role].label })),
    image: absoluteUrl(base, socialImagePath(path)),
    author: idOf(base, "organization"),
    publisher: idOf(base, "organization"),
    isPartOf: idOf(base, "website"),
    ...(dateModified ? { dateModified: dateModified.toISOString() } : {}),
  }
  return jsonLdGraph([
    article,
    breadcrumbNode(base, path, [{ name: "Documentation", path: "/doc" }, { name: group.title, path: docGroupHref(group) }, { name: unit.title }]),
    websiteNode(base),
    organizationNode(base),
  ])
}

/**
 * JSON for a <script type="application/ld+json">: « < », « > » and « & » escaped, so the data can
 * never close the element or open a comment, and the two line separators JavaScript reads as line
 * ends, so the script stays one valid line.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}
