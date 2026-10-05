// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { slugifyHeading } from "@/lib/heading-anchors"

/**
 * Contextual help (#568): the main admin pages link to the section of the admin guide that
 * explains them, so an organizer stuck on a screen doesn't have to search the whole guide. Few
 * pages, on purpose: the ones where people prepare or run an event. Each value is the exact text
 * of a heading of GUIDE_ADMIN.md: the link reads « Aide : <heading> » and its anchor is the
 * heading's slug, the id /doc/admin gives it. src/lib/__tests__/help-links.test.ts fails when a
 * heading listed here is renamed or removed: rename it here in the same change.
 */
export const ADMIN_HELP_SECTIONS = {
  "/admin/events/new": "Créer un événement",
  "/admin/events/[id]/edit": "Créer un événement",
  "/admin/events/[id]/review": "Publier un événement",
  "/admin/events/[id]/shifts": "Configurer les créneaux",
  "/admin/events/[id]/questions": "Questions aux bénévoles",
  "/admin/events/[id]/registrations": "Suivre les inscriptions",
  "/admin/events/[id]/invitations": "Inviter des membres à un événement",
  "/admin/events/[id]/message": "Écrire aux bénévoles",
  "/admin/events/[id]/staffing": "Où manque-t-il du monde ?",
  "/admin/events/[id]/day-of": "Présences le jour J",
  "/admin/settings/admins": "Gérer l'équipe admin",
  "/admin/settings/notifications": "Emails",
} as const satisfies Record<string, string>

/** An admin page that has a help link: its route, as under src/app (dynamic segments in brackets). */
export type AdminHelpRoute = keyof typeof ADMIN_HELP_SECTIONS

/** Where the admin guide is published (src/lib/doc-pages.ts). */
export const ADMIN_GUIDE_PATH = "/doc/admin"

/** The guide's section on asking for help and sending feedback. */
export const FEEDBACK_SECTION = "Signaler un problème ou proposer une amélioration"

/** The guide at a given section: /doc/admin#<slug of the heading>. */
export function adminGuideHref(section: string): string {
  return `${ADMIN_GUIDE_PATH}#${slugifyHeading(section)}`
}

/** The help link of an admin page: the guide section's title and its address. */
export function adminHelpLink(route: AdminHelpRoute): { section: string; href: string } {
  const section = ADMIN_HELP_SECTIONS[route]
  return { section, href: adminGuideHref(section) }
}
