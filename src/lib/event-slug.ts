// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { RESERVED_PATH_SEGMENTS } from "@/lib/reserved-paths"
import { slugify } from "@/lib/utils"

/**
 * An event's public address is `/<slug>` on its organisation's host (src/app/[eventSlug]). A slug
 * equal to one of the site's own top-level routes never reaches the event: the static route wins
 * in Next.js, and an apex-only page (/tarifs, /pour-qui, /fonctionnalites…) is even redirected to
 * the apex site (src/lib/apex-redirect.ts). Such a slug is refused when an event is created,
 * created from a template or duplicated (the only places a slug is set: it comes from the title,
 * and editing an event never changes it).
 *
 * The list is RESERVED_PATH_SEGMENTS (src/lib/reserved-paths.ts), the same list as the routing's
 * APEX_ONLY_PATHS plus the application's own routes; a test checks it covers every static folder
 * of src/app, so a new page cannot be forgotten.
 */

/** The first segment of every top-level route an event slug would collide with. */
export const RESERVED_EVENT_SLUGS: ReadonlySet<string> = new Set(RESERVED_PATH_SEGMENTS)

/** Whether an event slug is one of the site's own addresses. */
export function isReservedEventSlug(slug: string): boolean {
  return RESERVED_EVENT_SLUGS.has(slug.trim().toLowerCase())
}

/** The refusal shown when an event's title gives a reserved address (same tone as RESERVED_SLUG_ERROR). */
export function reservedEventSlugError(slug: string): string {
  return `Ce titre donnerait à l'événement l'adresse « /${slug} », réservée par le service. Changez le titre, par exemple en y ajoutant l'année.`
}

/** The slug a title gives, or the refusal when that slug is reserved. Pure: the route checks uniqueness. */
export function eventSlugFromTitle(title: string): { slug: string } | { error: string } {
  const slug = slugify(title)
  return isReservedEventSlug(slug) ? { error: reservedEventSlugError(slug) } : { slug }
}
