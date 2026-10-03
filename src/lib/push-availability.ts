// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * States of the push reminder button (#534). Client-safe: no server import.
 *
 * - `checking`: the browser can do push, the server's VAPID key is being fetched; no button yet.
 * - `idle` / `loading`: the button is shown (loading keeps it focusable, `aria-disabled`).
 * - `no-vapid`: the server has no key on load, so the site doesn't offer push; nothing is rendered.
 * - `unavailable`: no key found when the button was pressed; the status says so.
 * - `unsupported`: the browser has no service worker or Push API; nothing is rendered.
 */
export type PushState =
  | "checking"
  | "idle"
  | "loading"
  | "subscribed"
  | "denied"
  | "unsupported"
  | "no-vapid"
  | "unavailable"

export const PUSH_UNAVAILABLE_TEXT = "Les rappels push ne sont pas disponibles pour le moment."
export const PUSH_FAILURE_TEXT = "Les rappels n'ont pas pu être activés. Réessaie dans un moment."
export const PUSH_SUBSCRIBED_TEXT = "Rappels push activés"
export const PUSH_DENIED_TEXT = "Notifications bloquées dans les paramètres du navigateur."

/** Initial state, decided synchronously from what the browser offers. */
export function pushStateFromEnvironment(env: { serviceWorker: boolean; pushManager: boolean }): "unsupported" | "checking" {
  return env.serviceWorker && env.pushManager ? "checking" : "unsupported"
}

/** State once the server's public key is known: no key means the site doesn't offer push. */
export function pushStateFromKey(publicKey: unknown): "idle" | "no-vapid" {
  return typeof publicKey === "string" && publicKey.length > 0 ? "idle" : "no-vapid"
}

/** Whether the component renders anything at all (button or status region). */
export function pushRendersNothing(state: PushState): boolean {
  return state === "unsupported" || state === "no-vapid"
}

/** Text of the status region for a state that ends the flow; empty otherwise. */
export function pushStatusText(state: PushState): string {
  switch (state) {
    case "subscribed": return PUSH_SUBSCRIBED_TEXT
    case "denied": return PUSH_DENIED_TEXT
    case "unavailable": return PUSH_UNAVAILABLE_TEXT
    default: return ""
  }
}
