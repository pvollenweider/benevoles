// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A public sign-up waiting for its email address to be proven (#1253). Pure: the delay, the state
 * shown by the link, and the words of the confirmation page and of the result page. Server code
 * (`src/lib/signup-confirmation-server.ts`) does the database work.
 */

/** How long a provisional reservation stays, like a waitlist offer (#946). */
export const SIGNUP_CONFIRMATION_HOURS = 24

const HOUR = 60 * 60 * 1000

/**
 * When a reservation made at `now` expires: 24 h, but never beyond the first selected shift's
 * start. Unlike a waitlist offer there is no minimum lead: a shift starting in less than an hour
 * still reserves its places until it starts, so a volunteer reading the email at once can confirm.
 */
export function signupConfirmationExpiry(now: Date, firstShiftStart: Date): Date {
  return new Date(Math.min(now.getTime() + SIGNUP_CONFIRMATION_HOURS * HOUR, firstShiftStart.getTime()))
}

/** "jeudi 12 novembre à 18:00" in the organisation's time zone. */
export function confirmationDeadlineLabel(expiresAt: Date | string | null | undefined, timeZone: string): string | null {
  if (!expiresAt) return null
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return null
  const day = date.toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" })
  const time = date.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })
  return `${day} à ${time}`
}

/**
 * What the email's link shows before its button (#1253). Reading it changes nothing: mail
 * scanners follow links and sometimes run scripts.
 *
 * - `pending`: the reservation stands until `expiresAt`, the button is shown;
 * - `confirmed`: already confirmed; the recorded result is shown again;
 * - `expired`: the deadline passed (the cron may not have freed the places yet);
 * - `replaced`: a newer request for the same address and event replaced this one;
 * - `cancelled`: the organisation cancelled every held place;
 * - `invalid`: unknown link, or nothing left to confirm (all places reassigned);
 * - `unavailable`: the organisation is deactivated or suspended (src/lib/org-lifecycle.ts).
 */
export type SignupConfirmationPageState = "pending" | "confirmed" | "expired" | "replaced" | "cancelled" | "invalid" | "unavailable"

export type SignupConfirmationRow = {
  confirmedAt: Date | null
  cancelledAt: Date | null
  cancelReason: string | null
  expiresAt: Date
}

export function signupConfirmationPageState(
  confirmation: SignupConfirmationRow | null,
  now: Date,
  orgOpen = true,
  provisionalStatuses: readonly string[] = [],
  waitlistShiftIds: readonly string[] = [],
): SignupConfirmationPageState {
  if (!confirmation) return "invalid"
  if (!orgOpen) return "unavailable"
  if (confirmation.confirmedAt) return "confirmed"
  if (confirmation.cancelledAt) return confirmation.cancelReason === "replaced" ? "replaced" : "cancelled"
  if (confirmation.expiresAt.getTime() <= now.getTime()) return "expired"
  // A place confirmed by someone else meanwhile is no longer this request's: nothing left to
  // confirm, even before the deadline (an organiser may also have cancelled every held row).
  if (provisionalStatuses.every((s) => s !== "unconfirmed") && waitlistShiftIds.length === 0) return "invalid"
  return "pending"
}

/** The decision of a confirmation click, before any write. */
export type SignupConfirmationDecision = "pending" | "confirmed" | "expired" | "replaced" | "cancelled" | "gone" | "invalid"

export function signupConfirmationDecision(
  confirmation: (SignupConfirmationRow & { id: string }) | null,
  now: Date,
  provisionalStatuses: readonly string[],
  waitlistShiftIds: readonly string[],
): SignupConfirmationDecision {
  if (!confirmation) return "invalid"
  if (confirmation.confirmedAt) return "confirmed"
  if (confirmation.cancelledAt) return confirmation.cancelReason === "replaced" ? "replaced" : "cancelled"
  if (confirmation.expiresAt.getTime() <= now.getTime()) return "expired"
  if (provisionalStatuses.every((s) => s !== "unconfirmed") && waitlistShiftIds.length === 0) return "gone"
  return "pending"
}

/** The browser tab title per state (WCAG 2.4.2): set by generateMetadata, then by the page. */
export const SIGNUP_CONFIRMATION_PAGE_TITLES: Record<SignupConfirmationPageState, string> = {
  pending: "Confirme ton inscription",
  confirmed: "Inscription confirmée",
  expired: "Lien expiré",
  replaced: "Demande remplacée",
  cancelled: "Demande annulée",
  invalid: "Lien expiré ou invalide",
  unavailable: "Espace indisponible",
}

/** What the result page says after a sign-up waiting for its email confirmation (#1253). */
export function confirmationRequestNotice(input: { held: number; waiting: number; deadline: string | null }): { heading: string; text: string; deadline: string | null; waitlist: string | null } {
  const held = Math.max(0, input.held)
  const waiting = Math.max(0, input.waiting)
  return {
    heading: "Vérifie tes emails",
    text: "Nous t'avons envoyé un email pour confirmer ton inscription. Ouvre-le et clique sur « Confirmer mon inscription » : c'est ce clic qui enregistre tes créneaux.",
    deadline: held > 0 && input.deadline ? `Tes places sont réservées jusqu'au ${input.deadline}. Passé ce délai, elles redeviendront disponibles.` : null,
    waitlist: waiting > 0
      ? held > 0
        ? "Les créneaux complets ne réservent rien avant ta confirmation : tu entreras en liste d'attente à ce moment-là."
        : "Aucune place n'est réservée pour l'instant : les créneaux choisis sont complets, tu entreras en liste d'attente au moment de ta confirmation."
      : null,
  }
}
