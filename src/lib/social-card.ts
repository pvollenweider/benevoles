// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PUBLIC_PAGES } from "@/lib/doc-pages"
import { DOC_ROLE_INFO, docGroup, type DocUnit } from "@/lib/doc-units"

/**
 * What the social card of a public page shows (src/app/og-image.png/[...page]/route.tsx): where the
 * page sits (« Documentation, Le jour J »), its title in large type, the sentence that sums it up,
 * and who it is for. Every word comes from the page's own registry entry (src/lib/doc-pages.ts) or
 * its unit's front matter (guide/<slug>.md), so a card never says anything its page doesn't.
 */
export type SocialCard = {
  /** Small line above the title: the section of the site. */
  eyebrow: string
  title: string
  /** One sentence under the title. */
  detail: string
  /** Bottom line: the audience of a unit, else the site's promise. */
  footer: string
}

export const SOCIAL_CARD_FOOTER = "Gratuit, open source, hébergé en France"

function eyebrowOf(path: string): string {
  if (path === "/doc") return "Aide"
  if (path.startsWith("/doc/")) return "Documentation"
  if (path.startsWith("/legal/") || path === "/accessibilite") return "Informations légales"
  return "Présentation"
}

/** The card of a page path (`/doc/admin`, `/doc/<unit>`...), or null when there is no such page. */
export function socialCardFor(pagePath: string, units: readonly DocUnit[]): SocialCard | null {
  const page = PUBLIC_PAGES.find((p) => p.path === pagePath)
  if (page) {
    const title = page.path === "/doc" ? "Toute la documentation" : page.title
    return { eyebrow: eyebrowOf(page.path), title, detail: page.summary, footer: SOCIAL_CARD_FOOTER }
  }
  const unit = pagePath.startsWith("/doc/") ? units.find((u) => `/doc/${u.slug}` === pagePath) : undefined
  if (!unit) return null
  const audience = unit.roles.map((r) => DOC_ROLE_INFO[r].label).join(" et les ")
  return {
    eyebrow: `Documentation, ${docGroup(unit.group).title}`,
    title: unit.title,
    detail: unit.summary,
    footer: `Pour les ${audience}`,
  }
}

/** Every page that has a card: the public pages, then the documentation units (prerendered at build). */
export function socialCardPaths(units: readonly DocUnit[]): string[] {
  return [...PUBLIC_PAGES.map((p) => p.path), ...units.map((u) => `/doc/${u.slug}`)]
}

/** The title's size in pixels: large when short, smaller as it grows, so it stays on three lines at most. */
export function socialCardTitleSize(title: string): number {
  if (title.length <= 28) return 76
  if (title.length <= 48) return 64
  return 54
}
