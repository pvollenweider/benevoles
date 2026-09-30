// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { MetadataRoute } from "next"

/**
 * The public documentation pages, in one place: the doc index and navigation render from this
 * list, and the apex sitemap lists it, so a new doc page is added here once and appears
 * everywhere (SEO: the sitemap is what search engines read first).
 */
export type DocPage = {
  /** Path under the apex host, e.g. "/doc/admin". */
  path: string
  /** Link text. */
  title: string
  /** Short description for the index. */
  description: string
  /** Markdown file at the repo root the page is rendered from; its mtime is the sitemap's lastModified. */
  source: string | null
}

export const DOC_PAGES: readonly DocPage[] = [
  { path: "/doc", title: "Documentation", description: "Le point d'entrée des guides.", source: null },
  {
    path: "/doc/admin",
    title: "Guide administrateur",
    description: "Créer un événement, configurer les créneaux, inviter des membres, suivre les inscriptions, et les fonctionnalités plus récentes (pages personnalisées, responsables de secteur, jalons, journaux d'activité).",
    source: "GUIDE_ADMIN.md",
  },
  {
    path: "/doc/benevole",
    title: "Guide bénévole",
    description: "S'inscrire à un créneau, recevoir sa confirmation, gérer son inscription.",
    source: "GUIDE_BENEVOLE.md",
  },
]

/** The guides (everything but the index), for navigation. */
export const DOC_GUIDES = DOC_PAGES.filter((p) => p.path !== "/doc")

/**
 * Sitemap entries of the apex host (#SEO): the marketing home, then every doc page. `modifiedAt`
 * gives a page's last change from its source file (null when unknown) — injected so the list
 * stays pure and testable.
 */
export function apexSitemap(base: string, modifiedAt: (source: string) => Date | null): MetadataRoute.Sitemap {
  const root = base.replace(/\/+$/, "")
  return [
    { url: `${root}/`, changeFrequency: "weekly", priority: 1 },
    ...DOC_PAGES.map((p) => {
      const lastModified = p.source ? modifiedAt(p.source) : null
      return { url: `${root}${p.path}`, changeFrequency: "monthly" as const, priority: p.path === "/doc" ? 0.6 : 0.8, ...(lastModified ? { lastModified } : {}) }
    }),
  ]
}
