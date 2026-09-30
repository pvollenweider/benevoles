// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"

/**
 * The apex home (www.benevol.app): its metadata, its FAQ and its structured data, in one place.
 * The visible FAQ and the FAQPage JSON-LD both read LANDING_FAQ, so they cannot drift (search
 * engines ignore, or penalise, structured data that the page does not show). Everything here is
 * a fact the product or the legal pages already state: no price, rating or review is published,
 * so none is declared.
 */

export const LANDING_TITLE = "Planning et inscription des bénévoles | benevol.app"
export const LANDING_DESCRIPTION =
  "Organisez vos bénévoles par postes et créneaux. Ils s'inscrivent depuis leur téléphone, sans créer de compte. Rappels automatiques, feuilles du jour J. Gratuit."
export const OG_IMAGE_ALT = "benevol.app : le planning des bénévoles, inscription sans compte"

export const REPOSITORY_URL = "https://github.com/pvollenweider/benevoles"
export const CONTACT_EMAIL = "contact@benevol.app"

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
      "L'application et sa base de données sont hébergées en France, chez OVH. Chaque organisation ne voit que ses événements et ses bénévoles, et peut tout exporter à tout moment. Aucun cookie de pistage, analytique ou publicitaire.",
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
  const image = { url: "/og-image.png", width: 1200, height: 630, alt: OG_IMAGE_ALT, type: "image/png" }
  return {
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    applicationName: "benevol.app",
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "benevol.app",
      locale: "fr_CH",
      alternateLocale: ["fr_FR", "fr_BE"],
      url,
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: LANDING_TITLE, description: LANDING_DESCRIPTION, images: [image] },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    category: "software",
  }
}

/** The home's structured data: the site, its publisher, the application, its code and the FAQ. */
export function landingJsonLd(base: string): Record<string, unknown> {
  const root = base.replace(/\/+$/, "")
  const url = `${root}/`
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${url}#website`, url, name: "benevol.app", inLanguage: "fr", publisher: { "@id": `${url}#organization` } },
      {
        "@type": "Organization",
        "@id": `${url}#organization`,
        name: "benevol.app",
        url,
        logo: `${root}/apple-icon.png`,
        email: CONTACT_EMAIL,
        sameAs: [REPOSITORY_URL],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#application`,
        name: "benevol.app",
        url,
        description: LANDING_DESCRIPTION,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "fr",
        isAccessibleForFree: true,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        image: `${root}/og-image.png`,
        publisher: { "@id": `${url}#organization` },
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${url}#code`,
        name: "benevoles",
        codeRepository: REPOSITORY_URL,
        programmingLanguage: "TypeScript",
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        targetProduct: { "@id": `${url}#application` },
      },
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
    ],
  }
}

/** JSON for a <script type="application/ld+json">: "<" escaped so the data cannot close the element. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
