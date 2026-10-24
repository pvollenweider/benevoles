// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Mon calendrier » on the personal page (#961): its words and when it shows. Pure, shared by the
 * card (src/components/public/CalendarSubscribeCard.tsx), the page and their tests.
 */

export const CALENDAR_CARD_TITLE = "Mon calendrier"
export const CALENDAR_COPIED = "Adresse copiée."
export const CALENDAR_COPY_FAILED = "Copie impossible : appuie longuement sur l'adresse pour la copier, ou sélectionne-la."

export type CalendarFeedUrls = { https: string; webcal: string }

/**
 * What the card shows, or null for no card: only with at least one confirmed shift (a waitlist
 * entry or a request never goes into a calendar) and a subscription address from the server. The
 * one-off file of the whole planning only with several confirmed shifts: with one, the link under
 * that shift does the same.
 */
export function calendarCard(
  registrations: { status: string }[],
  feed: CalendarFeedUrls | null | undefined,
  downloadHref: string,
): { webcalUrl: string; httpsUrl: string; downloadHref: string | null } | null {
  const confirmed = registrations.filter((r) => r.status === "active").length
  if (confirmed === 0 || !feed) return null
  return { webcalUrl: feed.webcal, httpsUrl: feed.https, downloadHref: confirmed > 1 ? downloadHref : null }
}
