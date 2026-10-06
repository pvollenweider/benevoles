// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { slugifyHeading } from "@/lib/heading-anchors"
import type { DocUnit } from "@/lib/doc-units"

/**
 * Contextual help (#568): the main admin pages link to the page of the documentation that explains
 * them (#649: one unit of guide/ per task), so an organizer stuck on a screen doesn't have to search
 * the whole documentation. Few pages, on purpose: the ones where people prepare or run an event.
 * Each route names a unit by its slug and, optionally, the exact text of one of its headings: the
 * link reads « Aide : <heading, or the unit's title> » and opens /doc/<slug>, at the heading's
 * anchor when there is one. src/lib/__tests__/help-links.test.ts fails when a unit listed here is
 * renamed or removed, or a heading reworded: update this map in the same change.
 */
export type AdminHelpTarget = { unit: string; heading?: string }

export const ADMIN_HELP_LINKS = {
  "/admin/events/new": { unit: "creer-un-evenement" },
  "/admin/events/[id]/edit": { unit: "creer-un-evenement", heading: "Modifier un événement" },
  "/admin/events/[id]/review": { unit: "publier-un-evenement", heading: "Vérification et publication" },
  "/admin/events/[id]/shifts": { unit: "configurer-les-creneaux" },
  "/admin/events/[id]/questions": { unit: "questions-aux-benevoles" },
  "/admin/events/[id]/registrations": { unit: "suivre-les-inscriptions" },
  "/admin/events/[id]/invitations": { unit: "inviter-des-membres" },
  "/admin/events/[id]/message": { unit: "ecrire-aux-benevoles" },
  "/admin/events/[id]/staffing": { unit: "ou-manque-t-il-du-monde" },
  "/admin/events/[id]/day-of": { unit: "presences-le-jour-j" },
  "/admin/settings/admins": { unit: "equipe-admin" },
  "/admin/settings/notifications": { unit: "reglages-et-suivi-des-emails" },
} as const satisfies Record<string, AdminHelpTarget>

/** An admin page that has a help link: its route, as under src/app (dynamic segments in brackets). */
export type AdminHelpRoute = keyof typeof ADMIN_HELP_LINKS

/** The unit on asking for help and sending feedback, at its section on feedback. */
export const FEEDBACK_SECTION: AdminHelpTarget = { unit: "aide-et-retours", heading: "Signaler un problème ou proposer une amélioration" }

/** A page of the documentation, at a heading when given: /doc/<slug>[#<slug of the heading>]. */
export function docHref(target: AdminHelpTarget): string {
  return `/doc/${target.unit}${target.heading ? `#${slugifyHeading(target.heading)}` : ""}`
}

/**
 * The help link of an admin page: its text (the heading, or else the unit's title, read from the
 * units so a renamed title follows) and its address. Throws on an unknown unit, which the test
 * catches first.
 */
export function adminHelpLink(route: AdminHelpRoute, units: readonly DocUnit[]): { section: string; href: string } {
  const target: AdminHelpTarget = ADMIN_HELP_LINKS[route]
  const unit = units.find((u) => u.slug === target.unit)
  if (!unit) throw new Error(`help link of ${route}: unknown documentation unit « ${target.unit} »`)
  return { section: target.heading ?? unit.title, href: docHref(target) }
}
