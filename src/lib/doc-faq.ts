// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { DocRole } from "@/lib/doc-units"

/**
 * The « Questions fréquentes » block at the top of a guide's page (src/app/doc/RoleGuide.tsx): the
 * four questions each audience asks most, written as the reader would ask them (« tu » for
 * volunteers, « vous » for organisers), each linked to the unit that answers it and, when the
 * answer is a section of that unit, to the section's heading. A test checks that every target unit
 * exists, is for that role and renders that heading id (src/lib/__tests__/doc-faq.test.ts).
 */
export type DocFaqItem = { question: string; unit: string; heading?: string }

export const DOC_FAQ: Record<DocRole, readonly DocFaqItem[]> = {
  benevole: [
    { question: "Comment changer de créneau ?", unit: "ma-page-personnelle", heading: "je-veux-changer-de-creneau" },
    { question: "Comment annuler mon inscription ?", unit: "ma-page-personnelle", heading: "annuler-un-creneau" },
    { question: "J'ai perdu mon lien personnel, que faire ?", unit: "lien-personnel", heading: "je-n-ai-plus-le-lien-vers-ma-page-personnelle" },
    { question: "Comment recevoir un rappel avant mon créneau ?", unit: "rappels", heading: "je-ne-veux-pas-oublier-mon-creneau-le-jour-j" },
  ],
  admin: [
    {
      question: "Un poste est complet : comment garder les bénévoles en plus ?",
      unit: "liste-d-attente",
      heading: "un-poste-est-complet-mais-j-ai-encore-des-demandes-je-perds-ces-benevoles",
    },
    { question: "Comment reprendre l'événement de l'an dernier ?", unit: "dupliquer-un-evenement" },
    { question: "Comment inscrire quelqu'un à la main ?", unit: "suivre-les-inscriptions", heading: "ajouter-quelqu-un-a-la-main" },
    { question: "Comment voir les créneaux où il manque des bénévoles ?", unit: "ou-manque-t-il-du-monde" },
  ],
}

/** Where a question of the block leads: `/doc/<unit>`, with the heading's fragment when it has one. */
export function docFaqHref(item: DocFaqItem): string {
  return `/doc/${item.unit}${item.heading ? `#${item.heading}` : ""}`
}
