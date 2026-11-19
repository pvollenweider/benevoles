// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Addresses of the organisation-wide personal link (#1429, lot A). Pure and client-safe: the page,
 * its components and the emails build the same paths from these helpers, never from a raw token
 * interpolated somewhere else.
 */

export const ORG_PERSONAL_PAGE_PATH = "/mes-inscriptions"
export const ORG_PERSONAL_EVENT_SEGMENT = "evenement"

/** `/mes-inscriptions/<token>`: the page itself. */
export function orgPersonalPagePath(token: string): string {
  return `${ORG_PERSONAL_PAGE_PATH}/${encodeURIComponent(token)}`
}

/**
 * `/mes-inscriptions/<token>/evenement/<eventId>`: a server-side hop to the event's own personal
 * page. The organisation token never becomes an event token in the page's HTML.
 */
export function orgPersonalEventPath(token: string, eventId: string): string {
  return `${orgPersonalPagePath(token)}/${ORG_PERSONAL_EVENT_SEGMENT}/${encodeURIComponent(eventId)}`
}
