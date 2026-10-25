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
 * - `install-needed` (#593): an iPhone or iPad in a browser tab (needsHomeScreenInstall), on a site
 *   that offers push. iOS only offers the Push API to a page added to the Home Screen, so instead
 *   of a button that cannot work, the steps to add it. Only where the caller asks for it (the
 *   personal page, the one page with a web app manifest).
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
  | "install-needed"

export const PUSH_UNAVAILABLE_TEXT = "Les rappels push ne sont pas disponibles pour le moment."
export const PUSH_FAILURE_TEXT = "Les rappels n'ont pas pu être activés. Réessaie dans un moment."
export const PUSH_SUBSCRIBED_TEXT = "Rappels push activés"
export const PUSH_DENIED_TEXT = "Notifications bloquées dans les paramètres du navigateur."
/** The button's label, also named by the install steps' last step. */
export const PUSH_BUTTON_LABEL = "Recevoir des rappels push"

/** A French quotation, with the non-breaking spaces that keep « and » on their word's line. */
const q = (text: string) => `«\u00a0${text}\u00a0»`

/** The steps to add the personal page to the Home Screen on iPhone or iPad (#593). */
export const PUSH_INSTALL_TITLE = "Recevoir les rappels sur iPhone ou iPad"
export const PUSH_INSTALL_INTRO = "Ajoute d'abord cette page à ton écran d'accueil\u00a0:"
export const PUSH_INSTALL_STEPS: readonly string[] = [
  `Touche le bouton Partager\u00a0: un carré avec une flèche vers le haut. Si tu ne le vois pas, touche d'abord ${q("…")}.`,
  `Choisis ${q("Sur l'écran d'accueil")} (ou ${q("Ajouter à l'écran d'accueil")}), puis ${q("Ajouter")}.`,
  `Ouvre la page avec la nouvelle icône, puis touche ${q(PUSH_BUTTON_LABEL)}.`,
]

/** Initial state, decided synchronously from what the browser offers. */
export function pushStateFromEnvironment(env: { serviceWorker: boolean; pushManager: boolean }): "unsupported" | "checking" {
  return env.serviceWorker && env.pushManager ? "checking" : "unsupported"
}

/**
 * Whether to give the steps to add the page to the Home Screen (#593): an iPhone or iPad
 * (isAppleMobileDevice) in a browser tab (not `standalone`), without the Push API, on iOS 16.4 or
 * later (the first with Web Push; an unknown version gets the steps). An app already on the Home
 * Screen without the Push API gets nothing: adding it again would not help. Only shown once the
 * server says it offers push (a VAPID key), like the button: steps leading to no button would be a
 * dead end.
 */
export function needsHomeScreenInstall(env: {
  pushManager: boolean
  appleMobile: boolean
  standalone: boolean
  iosVersion: readonly [number, number] | null
}): boolean {
  if (env.pushManager || !env.appleMobile || env.standalone) return false
  if (!env.iosVersion) return true
  const [major, minor] = env.iosVersion
  return major > 16 || (major === 16 && minor >= 4)
}

/**
 * iOS version from the user agent: « iPhone OS 18_5 », « CPU OS 17_2 » (iPad), or for an iPad
 * that says « Macintosh », Safari's « Version/18.5 », which follows the system's. Null when unknown
 * (another browser on such an iPad).
 */
export function iosVersionFromUserAgent(userAgent: string): [number, number] | null {
  const m = userAgent.match(/\bOS (\d+)_(\d+)/) ?? userAgent.match(/\bVersion\/(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/**
 * iPhone, iPod or iPad, from the user agent. iPadOS 13+ says « Macintosh » like a Mac: told apart
 * by its touch screen (no Mac has one). Every browser on iOS runs WebKit, so Chrome or Firefox there
 * (CriOS, FxiOS) are the same case as Safari.
 */
export function isAppleMobileDevice(env: { userAgent: string; maxTouchPoints: number }): boolean {
  if (/\b(iPhone|iPad|iPod)\b/.test(env.userAgent)) return true
  return /\bMacintosh\b/.test(env.userAgent) && env.maxTouchPoints > 1
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
