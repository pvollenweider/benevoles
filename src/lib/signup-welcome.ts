// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { docUnitHref } from "./doc-href"

/**
 * The guide pages the welcome email points a new organiser to, once their address is confirmed
 * (self-service sign-up, #810): in reading order, the quickstart first. Labels are the pages'
 * own titles; a test checks each one exists in `guide/` for organisers, under that title.
 */
export const WELCOME_DOC_LINKS = [
  { slug: "creer-son-premier-evenement", label: "Créer son premier événement" },
  { slug: "premiers-pas", label: "Premiers pas" },
  { slug: "personnaliser-l-organisation", label: "Personnaliser l'organisation" },
  { slug: "partager-le-lien", label: "Partager le lien de l'événement" },
  { slug: "questions-frequentes-organisateurs", label: "Questions fréquentes des organisateurs" },
] as const

/** Where a new organiser asks a question. */
export const WELCOME_HELP_SLUG = "aide-et-retours"

/** The welcome links as absolute addresses on this instance. */
export function welcomeDocLinks(baseUrl: string): { label: string; url: string }[] {
  return WELCOME_DOC_LINKS.map((l) => ({ label: l.label, url: `${baseUrl}${docUnitHref(l.slug)}` }))
}
