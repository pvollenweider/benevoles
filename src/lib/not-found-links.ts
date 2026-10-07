// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { orgSlugFromHost } from "./org-subdomain"

/** The <title> of the 404 page (src/app/not-found.tsx, NotFoundTitle). */
export const NOT_FOUND_TITLE = "Page introuvable | benevol.app"

/** One way out of the 404 page (src/app/not-found.tsx). */
export type NotFoundLink = { href: string; label: string; description: string }

export type NotFoundLinks = {
  /** The obvious way back: the apex home, or the organization's list of events. */
  primary: { href: string; label: string }
  /** A sentence for volunteers on an organization's host: their personal page has no public address. */
  note: string | null
  /** The other useful pages, in reading order. */
  links: NotFoundLink[]
}

/** The organization of the request, as resolved from x-org-slug (src/lib/resolve-org.ts). */
export type NotFoundOrg = { slug: string }

const GUIDE_BENEVOLE: NotFoundLink = { href: "/doc/benevole", label: "Guide bénévole", description: "S'inscrire à un créneau, gérer son planning." }
const DOCUMENTATION: NotFoundLink = { href: "/doc", label: "Documentation", description: "Tous les guides, au même endroit." }
const VIDEOS: NotFoundLink = { href: "/videos", label: "Tutoriels vidéo", description: "Les gestes clés, en quelques minutes." }
const ORGANIZER_SPACE: NotFoundLink = { href: "/admin/login", label: "Espace organisateur", description: "Se connecter pour gérer ses événements." }

/**
 * The links of the 404 page (« Cette page est tombée à l'eau. »). On the apex: the home, then the
 * features, the documentation, both guides, the videos and the organizer space. On an
 * organization's host the home of that host is the organization's public page, so the primary link
 * leads back to its events; without an org subdomain (localhost, `?org=`), that page needs `?org=`.
 * The label leaves the organization's name out: « de » + a name does not elide (« de Association »).
 * Wording is neutral (no « tu », no « vous »): volunteers and organizers both land here.
 *
 * On the subdomain of no organisation (a typo, a deleted organisation), every page of that host is
 * itself a 404, so the links lead to the main site (`apexUrl`), never back to the same host.
 */
export function notFoundLinks(org: NotFoundOrg | null, host: string, apexUrl: string): NotFoundLinks {
  if (!org) {
    const base = orgSlugFromHost(host) !== null ? apexUrl.replace(/\/+$/, "") : ""
    const onSite = (link: NotFoundLink): NotFoundLink => ({ ...link, href: `${base}${link.href}` })
    return {
      primary: { href: `${base}/`, label: "Retour à l'accueil" },
      note: null,
      links: [
        { href: "/fonctionnalites", label: "Fonctionnalités", description: "Ce que fait benevol.app, besoin par besoin." },
        DOCUMENTATION,
        GUIDE_BENEVOLE,
        { href: "/doc/admin", label: "Guide des organisateurs", description: "Préparer un événement et ses créneaux." },
        VIDEOS,
        ORGANIZER_SPACE,
      ].map(onSite),
    }
  }
  const onOrgHost = orgSlugFromHost(host) !== null
  return {
    primary: { href: onOrgHost ? "/" : `/?org=${encodeURIComponent(org.slug)}`, label: "Voir les événements" },
    note: "Pour retrouver ses inscriptions, le lien personnel se trouve dans l'e-mail de confirmation.",
    links: [GUIDE_BENEVOLE, DOCUMENTATION, VIDEOS, ORGANIZER_SPACE],
  }
}
