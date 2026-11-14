// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Texts of the « this page did not start » notice (#1343, src/components/HydrationNotice.tsx):
 * what cannot be done yet, and what to do when the browser is too old. Plain words, no
 * « JavaScript »; « téléphone » because on an iPhone the browser is updated with the system.
 * « vous » on the organiser's sign-up, « tu » on a volunteer's registration page (PRODUCT.md).
 */
export type HydrationNoticeKind = "signup" | "event"

export const HYDRATION_NOTICE_LEAD = "Cette page n'a pas fini de se charger."

export function hydrationNoticeText(kind: HydrationNoticeKind): string {
  return kind === "signup"
    ? "Le formulaire ne peut pas encore être envoyé. Si ce message reste affiché, votre navigateur est sans doute trop ancien pour ce site : mettez à jour votre téléphone ou votre navigateur, ou ouvrez cette page sur un autre appareil."
    : "Tu ne peux pas encore choisir de créneaux. Si ce message reste affiché, ton navigateur est sans doute trop ancien pour ce site : mets à jour ton téléphone ou ton navigateur, ouvre cette page sur un autre appareil, ou demande à l'organisation de t'inscrire."
}

/** The notice's id for the control it explains: its aria-describedby until the page has started. */
export function hydrationNoticeId(hydrated: boolean, id: string): string | undefined {
  return hydrated ? undefined : id
}
