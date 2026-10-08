// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { CONTACT_EMAIL, REPOSITORY_URL, jsonLdGraph, organizationNode, softwareApplicationNode, softwareSourceCodeNode, websiteNode } from "@/lib/structured-data"
import { INDEXABLE, OG_LOCALE, SITE_NAME, SOCIAL_IMAGE } from "@/lib/seo-metadata"

export { CONTACT_EMAIL, REPOSITORY_URL }
export { jsonLdScript } from "@/lib/structured-data"

/**
 * The apex home (www.benevol.app): its metadata, its FAQ and its structured data, in one place.
 * The visible FAQ and the FAQPage JSON-LD both read LANDING_FAQ, so they cannot drift (search
 * engines ignore, or penalise, structured data that the page does not show). Everything here is
 * a fact the product or the legal pages already state: free (price 0), and no rating or review is
 * published, so none is declared.
 */

export const LANDING_TITLE = "Planning et inscription des bénévoles | benevol.app"
export const LANDING_DESCRIPTION =
  "Organisez vos bénévoles par postes et créneaux. Inscription depuis le téléphone, sans compte, rappels automatiques et feuilles du jour J. Gratuit."
export const OG_IMAGE_ALT = "benevol.app : le planning des bénévoles, inscription sans compte"

export type FaqEntry = {
  question: string
  /** Plain text, shown as is and copied as is into the JSON-LD. */
  answer: string
  /** Optional link shown after the answer (not part of the structured answer). */
  link?: { href: string; label: string }
}

export const LANDING_FAQ: readonly FaqEntry[] = [
  {
    question: "Les bénévoles doivent-ils créer un compte ?",
    answer:
      "Non. Ils ouvrent le lien de votre événement, choisissent leurs créneaux et confirment. Un email leur donne un lien personnel pour retrouver, modifier ou annuler leur inscription.",
  },
  {
    question: "Combien ça coûte ?",
    answer:
      "Rien. benevol.app est gratuit et open source. Si l'outil vous rend service, vous pouvez soutenir le projet par un don.",
  },
  {
    question: "Comment commencer ?",
    answer: `Écrivez à ${CONTACT_EMAIL} : on vous crée un espace à l'adresse de votre association, du type votre-association.benevol.app. Une liste de premiers pas vous guide ensuite, jusqu'à une inscription de test.`,
  },
  {
    question: "Ça marche sur téléphone ?",
    answer:
      "Oui. La page d'inscription est pensée d'abord pour le téléphone, avec un planning qu'on fait défiler du doigt. L'administration fonctionne aussi sur mobile, et plus confortablement sur ordinateur.",
  },
  {
    question: "Où sont les données ?",
    answer:
      "L'application et sa base de données sont hébergées en France, chez OVH. Une copie des sauvegardes, chiffrée avec une clé que le prestataire ne détient pas, est conservée hors site chez Infomaniak, en Suisse. Chaque organisation ne voit que ses événements et ses bénévoles, et peut tout exporter à tout moment. Aucun cookie de pistage, analytique ou publicitaire.",
    link: { href: "/legal/privacy", label: "Politique de confidentialité" },
  },
  {
    question: "Peut-on l'installer soi-même ?",
    answer:
      "Oui. Le code est publié sous licence AGPL-3.0, avec un guide de déploiement (Docker, Kubernetes, sauvegardes).",
    link: { href: `${REPOSITORY_URL}/blob/main/docs/deploiement.md`, label: "Guide de déploiement sur GitHub" },
  },
]

/** Metadata of the apex home: canonical, Open Graph and Twitter card, fully indexable. */
export function landingMetadata(base: string): Metadata {
  const url = `${base.replace(/\/+$/, "")}/`
  const image = { url: "/og-image.png", ...SOCIAL_IMAGE, alt: OG_IMAGE_ALT }
  return {
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    applicationName: SITE_NAME,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      url,
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: LANDING_TITLE, description: LANDING_DESCRIPTION, images: [image] },
    robots: INDEXABLE,
    category: "software",
  }
}

/** The home's structured data: the site, its publisher, the application, its code and the FAQ. */
export function landingJsonLd(base: string): Record<string, unknown> {
  const url = `${base.replace(/\/+$/, "")}/`
  return jsonLdGraph([
    websiteNode(base),
    organizationNode(base),
    softwareApplicationNode(base, LANDING_DESCRIPTION),
    softwareSourceCodeNode(base),
    {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      inLanguage: "fr",
      mainEntity: LANDING_FAQ.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
  ])
}
