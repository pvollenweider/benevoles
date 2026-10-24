// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { WAITLIST_OFFER_HOURS } from "./waitlist-copy"

/**
 * How long a spot offered from the waitlist stays reserved (#946). Pure: read by
 * promoteNextInWaitlist and its tests.
 *
 * - The answer window is WAITLIST_OFFER_HOURS (24 h), but never runs past the shift's start: a spot
 *   offered on the eve of a shift expires when the shift starts.
 * - A spot freed less than WAITLIST_OFFER_MIN_LEAD_MS (1 hour) before the start is not offered at
 *   all: nobody would have time to read the email and get there. The organisers already know (the
 *   withdrawal is « de dernière minute ») and find someone themselves.
 */
export const WAITLIST_OFFER_MIN_LEAD_MS = 60 * 60 * 1000

/** When an offer made at `now` expires, or null when the shift starts too soon to offer it. */
export function waitlistOfferExpiry(now: Date, shiftStart: Date): Date | null {
  const lead = shiftStart.getTime() - now.getTime()
  if (lead < WAITLIST_OFFER_MIN_LEAD_MS) return null
  return new Date(Math.min(now.getTime() + WAITLIST_OFFER_HOURS * 60 * 60 * 1000, shiftStart.getTime()))
}

/**
 * What the offer page (/waitlist/[token]/confirm) shows when the email's link is opened (#1044).
 * Reading it changes nothing: mail scanners open links, some run the page's scripts. Only its
 * « Prendre la place » button accepts (POST /api/public/waitlist/[token]/confirm, which checks the
 * same conditions again, conditionally, at the moment of the click).
 *
 * - `offered`: the offer stands, the button is shown;
 * - `expired`: the offer is still recorded but its time is up (the hourly cron hasn't passed yet);
 * - `active` / `requested`: already accepted (or a firm registration under this link);
 * - `invalid`: unknown link, or nothing to accept any more (expired offer withdrawn, cancelled);
 * - `unavailable`: the organisation is deactivated or suspended (src/lib/org-lifecycle.ts), whatever
 *   the registration's state: nothing about it is shown.
 */
export type WaitlistOfferPageState = "offered" | "expired" | "active" | "requested" | "invalid" | "unavailable"

export function waitlistOfferPageState(
  reg: { status: string; waitingExpiresAt: Date | null } | null,
  now: Date,
  orgOpen = true,
): WaitlistOfferPageState {
  if (!reg) return "invalid"
  if (!orgOpen) return "unavailable"
  if (reg.status === "offered") return reg.waitingExpiresAt && reg.waitingExpiresAt < now ? "expired" : "offered"
  if (reg.status === "active" || reg.status === "requested") return reg.status
  return "invalid"
}

/** What the offer page shows: the server's state, then the outcome of its button. */
export type WaitlistOfferView = WaitlistOfferPageState | "confirmed" | "requestSent" | "gone"

/** The browser tab title per view (WCAG 2.4.2): set by generateMetadata, then by the page itself. */
export const WAITLIST_OFFER_PAGE_TITLES: Record<WaitlistOfferView, string> = {
  offered: "Place proposée",
  expired: "Lien expiré",
  active: "Place déjà confirmée",
  requested: "Demande déjà envoyée",
  invalid: "Lien expiré ou invalide",
  unavailable: "Espace indisponible",
  confirmed: "Place confirmée",
  requestSent: "Demande envoyée",
  gone: "Place plus disponible",
}
