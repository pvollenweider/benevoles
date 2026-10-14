// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where the personal page (/my/[token]) sends a volunteer who wants more shifts (#988), and what
 * its link at the bottom becomes. Pure and client-safe (no Prisma): the API computes the URLs, the
 * page picks the link.
 *
 * The sign-up link shows only while the event's public page would accept a sign-up: the same
 * window as that page (`registrationState`, #463: published, open, between its opening and closing
 * times), and not once the event's last day is over in the organisation's time zone. It keeps the
 * group link (#947) the volunteer came through, and the organisation (`?org=` where there is no
 * organisation subdomain, e.g. locally, #982), already carried by `eventUrl`.
 */
import { groupLinkUrl } from "./group-links"
import { registrationState, type RegistrationWindow } from "./registration-window"

export const SIGN_UP_MORE_LABEL = "S'inscrire à d'autres créneaux"
export const EVENT_PAGE_LABEL = "Voir la page de l'événement"
export const ORG_HOME_LABEL = "Retour à l'accueil"

const isoDay = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)
const localDay = (instant: Date, timeZone: string) => instant.toLocaleDateString("sv-SE", { timeZone })

export type SignUpUrlInput = {
  event: RegistrationWindow & { endDate: Date | string }
  /** The event's public URL, `?org=` included locally (eventPublicUrl). */
  eventUrl: string
  /** The code of the volunteer's group link, if their sign-up came through one. */
  groupCode: string | null
  now: Date
  timeZone: string
}

/** The sign-up page for more shifts, or null when no sign-up is possible on the event now. */
export function signUpUrl({ event, eventUrl, groupCode, now, timeZone }: SignUpUrlInput): string | null {
  if (!registrationState(event, now).open) return null
  // The event's dates are calendar days at midnight UTC: its last day, read in UTC.
  if (event.endDate && isoDay(event.endDate) < localDay(now, timeZone)) return null
  return groupCode ? groupLinkUrl(eventUrl, groupCode) : eventUrl
}

type RegistrationWithGroup = { id: string; createdAt: Date | string; groupLink?: { code: string } | null }

/**
 * The group link to keep: the one of the registration whose link opened the page, else the most
 * recent of the volunteer's registrations on the event that came through one. A deleted group
 * link is gone from the registration (null), so it is never kept.
 */
export function volunteerGroupCode(registrations: RegistrationWithGroup[], openedId: string): string | null {
  const opened = registrations.find((r) => r.id === openedId)
  if (opened?.groupLink) return opened.groupLink.code
  const time = (d: Date | string) => new Date(d).getTime()
  const latest = registrations
    .filter((r) => r.groupLink)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))[0]
  return latest?.groupLink?.code ?? null
}

export type PageLink = { href: string; label: string }

/**
 * The link at the bottom of the page. None while the sign-up link is shown (it goes to the same
 * page); the event page while it is published; the organisation's home once it is not any more
 * (its page answers 404).
 */
export function bottomLink(links: { signUpUrl?: string | null; eventPageUrl?: string | null; orgHomeUrl: string }): PageLink | null {
  if (links.signUpUrl) return null
  if (links.eventPageUrl) return { href: links.eventPageUrl, label: EVENT_PAGE_LABEL }
  return { href: links.orgHomeUrl, label: ORG_HOME_LABEL }
}

/** The page after the last withdrawal: the same sign-up link while possible (one name for one
 * destination), else the bottom link. */
export function emptyPageLink(links: { signUpUrl?: string | null; eventPageUrl?: string | null; orgHomeUrl: string }): PageLink {
  if (links.signUpUrl) return { href: links.signUpUrl, label: SIGN_UP_MORE_LABEL }
  return bottomLink(links)!
}
