// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The site's own top-level addresses, in one place: the routing (src/lib/apex-redirect.ts, used by
 * the proxy) and the event slug check (src/lib/event-slug.ts) both read these lists, so an event can
 * never take an address the site answers itself. Pure, no imports: the proxy loads it.
 */

/**
 * The apex site's own pages (#933): the features and editorial pages (the audience pages and the
 * pricing page among them, #872, #950), the documentation, the blog (#944), the video
 * library, the legal pages and the accessibility statement (src/lib/doc-pages.ts), the sign-up
 * page, the product-updates page and the llms.txt files. An organisation's host answered them in
 * 200 too, and their relative links made crawlers walk the whole public site again on every
 * organisation's host. Everything else stays on that host: its events and their pages, its root,
 * /my, /leader, /waitlist, /admin, /api, robots.txt and its own sitemap.
 */
export const APEX_ONLY_PATHS: readonly string[] = [
  "/fonctionnalites",
  "/logiciel-planning-benevoles",
  "/pour-qui",
  "/benevoles-fete-de-village",
  "/benevoles-festival",
  "/benevoles-manifestation-sportive",
  "/planning-permanences-benevoles",
  "/tarifs",
  "/modele-planning-benevoles",
  "/nouveautes",
  "/blog",
  "/accessibilite",
  "/legal",
  "/doc",
  "/videos",
  "/inscription",
  "/product-updates",
  "/llms.txt",
  "/llms-full.txt",
]


/**
 * The application's own routes that stay on an organisation's host (administration, personal
 * links, API): not apex-only, but just as unreachable for an event.
 */
export const APP_ROUTE_SEGMENTS: readonly string[] = ["admin", "super-admin", "api", "my", "leader", "waitlist"]

/** The first segment of every top-level address of the site: what an event slug may never be. */
export const RESERVED_PATH_SEGMENTS: readonly string[] = [...new Set([...APEX_ONLY_PATHS.map((p) => p.split("/")[1]), ...APP_ROUTE_SEGMENTS])]
