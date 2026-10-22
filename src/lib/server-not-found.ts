// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Which requests the proxy answers with the 404 page itself, before any page renders (#935).
 *
 * `notFound()` called while a page renders gives the right status (404, noindex) but an empty
 * body: React's server rendering does not run error boundaries, so Next.js's not-found boundary
 * cannot catch it on the server; the error escapes the page's shell and Next.js answers an empty
 * `<html id="__next_error__">` document, the 404 page only drawn by the browser from the RSC
 * payload. Search engines and anyone without JavaScript saw a blank page. Measured on Next.js
 * 16.3.8 with a page that only calls `notFound()`; an unmatched URL is unaffected, as Next.js
 * renders its not-found route as a page.
 *
 * So, as the Next.js documentation advises (« rewrite missing slugs to a not-found route »), the
 * proxy rewrites what it can tell is missing, without a database, to an address no route matches
 * (`NOT_FOUND_ROUTE`): Next.js renders src/app/not-found.tsx for it server-side, with the 404
 * status. Not to Next.js's own `/_not-found`: in the standalone build that runs in production, a
 * rewrite to it is sent out as an HTTP request, which failed and answered 500 (#942). Those
 * requests are
 * - on a host without an organisation (the www site, localhost without `?org=`), any address that
 *   would reach the organisation's event pages (`/<event>`, `/<event>/<page>`,
 *   `/<event>/success`): they need an organisation and would call `notFound()`; that is every
 *   mistyped one-segment address and `/legal/<unknown>`;
 * - `/doc/<slug>` that is neither a documentation unit nor a former slug of one;
 * - `/videos/<id>` that is neither a video's id nor its slug;
 * - `/blog/<slug>` that is no post.
 * An unknown event or page on an organisation's host still goes through `notFound()` (404 and
 * noindex, the page drawn by the browser): telling it apart needs the database.
 */

/**
 * An address no route of src/app matches, so Next.js answers it with src/app/not-found.tsx and a
 * 404. A folder starting with `_` is private in the App Router (never a route), and three segments
 * are more than the event pages (`/<event>/<page>`) take; a test checks both.
 */
export const NOT_FOUND_ROUTE = "/_404/page/introuvable"

/**
 * Every page or route handler of src/app at one or two segments, outside the event segment and
 * the folders below (a test compares this list with the app's folders). Paths with a dot (files,
 * robots.txt, the social cards, llms.txt) are never rewritten, so they are not listed.
 */
export const STATIC_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/accessibilite",
  "/benevoles-festival",
  "/benevoles-fete-de-village",
  "/benevoles-manifestation-sportive",
  "/blog",
  "/doc",
  "/doc/admin",
  "/doc/benevole",
  "/fonctionnalites",
  "/inscription",
  "/inscription/confirmer",
  "/legal/exploitant",
  "/legal/privacy",
  "/legal/sous-traitance",
  "/legal/sous-traitants",
  "/legal/terms",
  "/logiciel-planning-benevoles",
  "/nouveautes",
  "/planning-permanences-benevoles",
  "/pour-qui",
  "/product-updates/unsubscribed",
  "/tableur-ou-outil-dedie",
  "/tarifs",
  "/videos",
])

/** Folders whose second segment is a parameter of their own (`/doc/<slug>`, `/my/<token>`...): never the event segment. */
export const DYNAMIC_CHILD_FOLDERS: ReadonlySet<string> = new Set(["blog", "doc", "videos", "my", "leader"])

/** Folders left entirely to their own routes and guards: the administration and the API. */
export const OWN_FOLDERS: ReadonlySet<string> = new Set(["admin", "super-admin", "api", "_next", "monitoring"])

function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean)
}

/**
 * Whether Next.js would route this path to the organisation's event segment
 * (src/app/[eventSlug]): one or two segments, no file name, matched by no other route.
 */
export function reachesEventRoute(pathname: string): boolean {
  const segments = segmentsOf(pathname)
  if (segments.length < 1 || segments.length > 2) return false
  if (segments.some((s) => s.includes("."))) return false
  if (OWN_FOLDERS.has(segments[0])) return false
  if (STATIC_ROUTES.has(`/${segments.join("/")}`)) return false
  if (segments.length === 2 && DYNAMIC_CHILD_FOLDERS.has(segments[0])) return false
  return true
}

export type NotFoundLookups = {
  /** The request carries an organisation (its host, or `?org=` where there is no subdomain). */
  hasOrg: boolean
  /** `/doc/<slug>` shows a unit or redirects to one (src/lib/doc-units.ts `resolveDocSlug`). */
  docSlugExists: (slug: string) => boolean
  /** `/videos/<param>` shows a video or redirects to it (its id or its slug). */
  videoExists: (param: string) => boolean
  /** `/blog/<slug>` shows a post (src/lib/blog.ts `findBlogPost`). */
  blogPostExists: (slug: string) => boolean
}

/** Whether the proxy should answer this path with the 404 page (rewrite to `NOT_FOUND_ROUTE`). */
export function isServerNotFound(pathname: string, lookups: NotFoundLookups): boolean {
  if (!lookups.hasOrg && reachesEventRoute(pathname)) return true
  const segments = segmentsOf(pathname)
  if (segments.length !== 2 || segments[1].includes(".")) return false
  const [folder, param] = segments
  if (STATIC_ROUTES.has(`/${folder}/${param}`)) return false
  if (folder === "doc") return !lookups.docSlugExists(param)
  if (folder === "videos") return !lookups.videoExists(param)
  if (folder === "blog") return !lookups.blogPostExists(param)
  return false
}
