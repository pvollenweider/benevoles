// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { isFocusDropped } from "./focus-return"

/**
 * The control that opened a dialog, for focus to go back to it on close (#585).
 *
 * Normally it is the focused element. WebKit (Safari on macOS and iOS) does not focus a tapped or
 * clicked button: focus stays on `<body>` or goes to the `<main tabIndex={-1}>` around it. So the
 * last control pressed with a pointer is recorded, document-wide and in the capture phase, and used
 * when focus was dropped. A click without a pointer press (iOS VoiceOver double tap, Switch or
 * Voice Control) records its control too, without erasing one already recorded. A key press clears
 * it: the keyboard always focuses what it activates.
 */

const OPENER = 'button, a[href], input, select, textarea, summary, [role="button"], [role="menuitem"], [role="tab"], [tabindex]:not([tabindex="-1"])'

let pointerOpener: HTMLElement | null = null
const tracked = new WeakSet<Document>()

/** The control a pointer press on `target` activates, or null (text, `<main>`, the backdrop). */
export function closestOpener(target: EventTarget | null): HTMLElement | null {
  if (!target || typeof (target as Element).closest !== "function") return null
  const el = (target as Element).closest(OPENER)
  return el instanceof HTMLElement ? el : null
}

/** Starts recording pointer presses on `doc`. Idempotent; a no-op without a document (server). */
export function trackPointerOpener(doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (!doc || tracked.has(doc)) return
  tracked.add(doc)
  doc.addEventListener("pointerdown", (e) => { pointerOpener = closestOpener(e.target) }, true)
  doc.addEventListener("click", (e) => { pointerOpener = closestOpener(e.target) ?? pointerOpener }, true)
  doc.addEventListener("keydown", () => { pointerOpener = null }, true)
}

/**
 * The opener of a dialog that opens now: the focused element, unless focus was dropped
 * (`isFocusDropped`), then the control last pressed with a pointer. Consumes the record either way,
 * so a later dialog never reuses it.
 */
export function resolveOpener(active: Element | null): HTMLElement | null {
  const pressed = pointerOpener
  pointerOpener = null
  if (!isFocusDropped(active)) return active instanceof HTMLElement ? active : null
  return pressed
}

export function resetPointerOpenerForTests(): void {
  pointerOpener = null
}
