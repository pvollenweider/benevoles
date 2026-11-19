// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Mon calendrier » on the personal page (#961): its words and when it shows. Pure, shared by the
 * card (src/components/public/CalendarSubscribeCard.tsx), the page and their tests.
 */

export const CALENDAR_CARD_TITLE = "Mon calendrier"
export const CALENDAR_COPIED = "Adresse copiée."
export const CALENDAR_COPY_FAILED = "Copie impossible : appuie longuement sur l'adresse pour la copier, ou sélectionne-la."

/** The card's introduction on a per-event personal page (#961). */
export const CALENDAR_CARD_DESCRIPTION =
  "Abonne ton agenda à tes créneaux confirmés : il se met à jour tout seul si un horaire change, si un créneau est annulé ou ajouté (selon l'agenda, après quelques heures, parfois un jour)."

/**
 * The organisation-wide card's introduction (#1429, lot C), in two paragraphs: every event, then
 * the duplicate warning for a volunteer who already subscribed to one event's feed (some clients
 * do not deduplicate).
 */
export const ORG_CALENDAR_CARD_DESCRIPTION = (organizationName: string): string[] => [
  `Abonne ton agenda à tous tes créneaux confirmés auprès de ${organizationName}. Il se met à jour tout seul si un créneau change, est annulé ou ajouté. Selon l'agenda, cela prend quelques heures, parfois un jour.`,
  "Tu t'es déjà abonné au calendrier d'un seul événement ? Retire cet ancien abonnement de ton agenda, sinon certains créneaux risquent d'y apparaître deux fois.",
]

/**
 * After a renewal, the card disappears and its feed address is revoked (#1429, lot C): the old
 * subscription would otherwise stop updating silently. Appended on the client to the API's
 * renewal answer, which stays unchanged, and shown only when the card was displayed.
 */
export const ORG_CALENDAR_RENEWED_NOTICE =
  "Ton abonnement d'agenda ne se met plus à jour : depuis le nouveau lien, abonne-toi de nouveau, puis retire l'ancien abonnement de ton agenda."

export type CalendarFeedUrls = { https: string; webcal: string }

/**
 * What the card shows, or null for no card: only with at least one confirmed shift (a waitlist
 * entry or a request never goes into a calendar) and a subscription address from the server. The
 * one-off file of the whole planning only with several confirmed shifts: with one, the link under
 * that shift does the same. `alwaysDownload` keeps it from the first confirmed shift on a page
 * that has no per-shift link (the organisation page).
 */
export function calendarCard(
  registrations: { status: string }[],
  feed: CalendarFeedUrls | null | undefined,
  downloadHref: string,
  { alwaysDownload = false }: { alwaysDownload?: boolean } = {},
): { webcalUrl: string; httpsUrl: string; downloadHref: string | null } | null {
  const confirmed = registrations.filter((r) => r.status === "active").length
  if (confirmed === 0 || !feed) return null
  return { webcalUrl: feed.webcal, httpsUrl: feed.https, downloadHref: alwaysDownload || confirmed > 1 ? downloadHref : null }
}
