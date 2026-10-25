// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { MetadataRoute } from "next"

/**
 * Web app manifest of the volunteer's personal page « Mes inscriptions » (#593): on iPhone it lets
 * the volunteer add the page to the Home Screen as a web app, the only way iOS offers Web Push to a
 * site; Chrome and Edge install it from their menu (« Installer la page en tant qu'application »).
 *
 * Served at `VOLUNTEER_MANIFEST_PATH` (src/app/my/manifest.webmanifest/route.ts) and linked from
 * the personal page only (src/app/my/[token]/layout.tsx): not `app/manifest.ts`, which Next.js
 * links from every page, and nothing else of the site is meant to be installed.
 *
 * The personal page's address holds the volunteer's token, an authentication secret (#485). So the
 * manifest has no `start_url`, on purpose: the Web App Manifest specification then takes the
 * address of the page that links it, the page being installed, so the installed app opens that
 * volunteer's own page, and the token never appears in the manifest. One file for everyone, the
 * same bytes whoever asks, safe to cache. iOS behaves the same: with a `start_url` it opens that
 * address instead of the page added to the Home Screen; without one, it keeps the page.
 * Trade-off: Chromium only promotes an install on its own (address bar icon, install prompt) for a
 * manifest with an explicit `start_url` (installable_evaluator.cc, `has_valid_specified_start_url`),
 * which would mean a token in the manifest or a page that isn't the volunteer's; installing from
 * the browser's menu still works and opens the page it was installed from.
 * No `id` either: it defaults to the start address, so each personal link installs as its own app
 * (a volunteer may have several, one per organisation).
 *
 * Colours: the page background (DESIGN.md « surface-page »), for the splash screen and the title
 * bar alike. Icons: the brand icon (src/app/icon.svg) rendered at 192 and 512 px, and a maskable
 * version (full-bleed background, bars inside the safe zone) for launchers that crop icons.
 */
export const VOLUNTEER_MANIFEST_PATH = "/my/manifest.webmanifest"

/** Scope of the installed app: the personal pages. Links elsewhere open in the browser's view. */
export const VOLUNTEER_APP_SCOPE = "/my/"

const SURFACE_PAGE = "#f9fafb"

export function volunteerManifest(): MetadataRoute.Manifest {
  return {
    name: "Mes inscriptions",
    short_name: "Mes inscriptions",
    description: "Tes créneaux de bénévole, tes rappels et tes informations pratiques.",
    lang: "fr",
    dir: "ltr",
    scope: VOLUNTEER_APP_SCOPE,
    display: "standalone",
    background_color: SURFACE_PAGE,
    theme_color: SURFACE_PAGE,
    icons: [
      { src: "/icons/volunteer-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/volunteer-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/volunteer-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/volunteer-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
