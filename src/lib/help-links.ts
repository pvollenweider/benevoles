// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { slugifyHeading } from "@/lib/heading-anchors"
import type { DocUnit } from "@/lib/doc-units"

/**
 * Contextual help (#568): the main admin pages link to the page of the documentation that explains
 * them (#649: one unit of content/guide/ per task), so an organizer stuck on a screen doesn't have to search
 * the whole documentation (#1096: every admin screen that has a precise page of its own).
 * Each route names a unit by its slug and, optionally, the exact text of one of its headings: the
 * link reads « Aide : <heading, or the unit's title> » and opens /doc/<slug>, at the heading's
 * anchor when there is one. src/lib/__tests__/help-links.test.ts fails when a unit listed here is
 * renamed or removed, or a heading reworded: update this map in the same change.
 */
export type AdminHelpTarget = { unit: string; heading?: string }

export const ADMIN_HELP_LINKS = {
  "/admin/dashboard": { unit: "tableau-de-bord" },
  "/admin/events": { unit: "creer-un-evenement" },
  "/admin/events/new": { unit: "creer-un-evenement" },
  "/admin/events/[id]": { unit: "creer-un-evenement", heading: "La page de l'événement" },
  "/admin/events/[id]/log": { unit: "journal-de-l-evenement" },
  "/admin/events/[id]/duplicate": { unit: "dupliquer-un-evenement" },
  "/admin/events/[id]/qr": { unit: "partager-le-lien", heading: "QR code" },
  "/admin/events/[id]/pages": { unit: "pages-personnalisees" },
  "/admin/events/[id]/preview": { unit: "publier-un-evenement", heading: "Vue publique" },
  "/admin/events/[id]/staffing/search": { unit: "ou-manque-t-il-du-monde", heading: "Chercher des bénévoles" },
  "/admin/events/[id]/edit": { unit: "creer-un-evenement", heading: "Modifier un événement" },
  "/admin/events/[id]/review": { unit: "publier-un-evenement", heading: "Vérification et publication" },
  "/admin/events/[id]/shifts": { unit: "configurer-les-creneaux" },
  "/admin/events/[id]/questions": { unit: "questions-aux-benevoles" },
  "/admin/events/[id]/registrations": { unit: "suivre-les-inscriptions" },
  "/admin/events/[id]/invitations": { unit: "inviter-des-membres" },
  "/admin/events/[id]/message": { unit: "ecrire-aux-benevoles" },
  "/admin/events/[id]/staffing": { unit: "ou-manque-t-il-du-monde" },
  "/admin/events/[id]/day-of": { unit: "presences-le-jour-j" },
  "/admin/events/[id]/sector-leaders": { unit: "responsables-de-secteur" },
  "/admin/events/[id]/share": { unit: "partager-le-lien" },
  "/admin/events/[id]/print": { unit: "rapports-badges-et-resume" },
  "/admin/members": { unit: "gerer-les-membres" },
  "/admin/members/[id]": { unit: "gerer-les-membres" },
  "/admin/members/[id]/certificate": { unit: "gerer-les-membres", heading: "Attestation de bénévolat" },
  "/admin/members/[id]/merge": { unit: "doublons-et-fusion", heading: "Fusionner deux fiches en double" },
  "/admin/members/duplicates": { unit: "doublons-et-fusion", heading: "Doublons possibles" },
  "/admin/search": { unit: "rechercher" },
  "/admin/account": { unit: "se-connecter" },
  // Seven of the page's eight sections are the organisation's settings (#1096); the team and the
  // charter have their own « En savoir plus » (SECTION_DOC_LINKS).
  "/admin/settings/admins": { unit: "personnaliser-l-organisation" },
  "/admin/settings/notifications": { unit: "parametres-et-suivi-des-emails" },
  "/admin/settings/message-templates": { unit: "ecrire-aux-benevoles", heading: "Modèles de messages" },
  "/admin/settings/activity": { unit: "journal-d-activite-de-l-organisation" },
} as const satisfies Record<string, AdminHelpTarget>

/** An admin page that has a help link: its route, as under src/app (dynamic segments in brackets). */
export type AdminHelpRoute = keyof typeof ADMIN_HELP_LINKS

/**
 * « En savoir plus » of one section of a screen (#1096), when the section has its own page of the
 * documentation: for organisers (`admin`) on admin screens, for volunteers (`benevole`) on the
 * public pages and in their emails. Checked like ADMIN_HELP_LINKS by help-links.test.ts.
 */
export const SECTION_DOC_LINKS = {
  admin: {
    milestones: { unit: "jalons" },
    adminTeam: { unit: "equipe-d-organisation" },
    charter: { unit: "charte-du-benevole" },
  },
  benevole: {
    chooseShifts: { unit: "choisir-ses-creneaux" },
    signUp: { unit: "s-inscrire" },
    personalPage: { unit: "ma-page-personnelle" },
    cancelShift: { unit: "ma-page-personnelle", heading: "Annuler un créneau" },
    swapShift: { unit: "ma-page-personnelle", heading: "Échanger un créneau" },
    brokenLink: { unit: "lien-personnel", heading: "La page « Ce lien ne fonctionne pas » s'affiche" },
  },
} as const satisfies Record<"admin" | "benevole", Record<string, AdminHelpTarget>>

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
