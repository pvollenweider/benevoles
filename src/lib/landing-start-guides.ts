// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { publicPage } from "@/lib/doc-pages"
import { docUnitHref } from "@/lib/doc-href"
import { DOC_QUICKSTART_SLUG } from "@/lib/doc-quickstart"
import type { DocUnit } from "@/lib/doc-units"

/**
 * The home page's entry points to the documentation (#764): the quickstart in the hero, then a
 * « Bien démarrer » block with the essential units, in the order a new organiser needs them, then
 * the volunteers' guide apart. Titles and summaries come from the units themselves (guide/*.md) and from
 * the guides' registry (src/lib/doc-pages.ts), never copied here.
 */
export const LANDING_START_UNITS: readonly string[] = [
  DOC_QUICKSTART_SLUG,
  "configurer-les-creneaux",
  "ouvrir-et-fermer-les-inscriptions",
  "partager-le-lien",
  "suivre-les-inscriptions",
]

/** The guide shown after the ordered units: what volunteers will see. */
export const LANDING_START_GUIDE_PATH = "/doc/benevole"

export type LandingStartLink = { href: string; title: string; summary: string }

/** The hero's link to the quickstart, or null if the unit was removed (the link is then left out). */
export function landingQuickstartLink(units: readonly DocUnit[]): LandingStartLink | null {
  return landingStartLinks(units).find((l) => l.href === docUnitHref(DOC_QUICKSTART_SLUG)) ?? null
}

/**
 * The ordered links of the « Bien démarrer » block: each unit of LANDING_START_UNITS that exists,
 * in that order. A unit that is gone is skipped rather than linked to a 404.
 */
export function landingStartLinks(units: readonly DocUnit[]): LandingStartLink[] {
  return LANDING_START_UNITS.flatMap((slug) => {
    const unit = units.find((u) => u.slug === slug)
    return unit ? [{ href: docUnitHref(unit.slug), title: unit.title, summary: unit.summary }] : []
  })
}

/** The volunteers' guide, offered after the ordered units, outside their sequence. */
export function landingVolunteerGuideLink(): LandingStartLink {
  const guide = publicPage(LANDING_START_GUIDE_PATH)
  return { href: guide.path, title: guide.title, summary: guide.summary }
}
