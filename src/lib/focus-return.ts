// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Focus restoration after a form or an inline panel closes (#554): the caller passes the element
 * that should get focus back (usually the opener) and its ordered fallbacks. No role or shift logic
 * lives here; the caller decides what the targets are and what is announced.
 *
 * A candidate is an element or a getter. Getters are resolved at focus time, so they find an
 * element remounted under a new key and skip one that a re-render removed.
 */
export type FocusCandidate = HTMLElement | null | undefined | (() => HTMLElement | null | undefined)

const HIDDEN_ANCESTOR = "[hidden],[inert],[aria-hidden='true'],details:not([open]) > :not(summary)"

/**
 * In the document, rendered, not hidden, inert, aria-hidden or disabled. An `aria-disabled` element
 * is allowed (it stays focusable on purpose). Visibility is read from the computed style of the
 * element and its ancestors rather than from its boxes, which jsdom does not lay out.
 */
export function canTakeFocus(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false
  if (el.matches(":disabled")) return false
  if (el.closest(HIDDEN_ANCESTOR)) return false
  for (let a: Element | null = el; a; a = a.parentElement) {
    if (getComputedStyle(a).display === "none") return false
  }
  return getComputedStyle(el).visibility !== "hidden"
}

/**
 * Focuses the first candidate that can take focus and actually takes it, and returns it; null
 * (focus left where it is) when none does. A candidate that already has focus is returned as is,
 * without focusing it again (a screen reader would voice it a second time).
 */
export function focusFirstAvailable(candidates: FocusCandidate[], options?: FocusOptions): HTMLElement | null {
  for (const candidate of candidates) {
    const el = typeof candidate === "function" ? candidate() : candidate
    if (!el) continue
    if (el === document.activeElement) return el
    if (!canTakeFocus(el)) continue
    el.focus(options)
    if (document.activeElement === el) return el
  }
  return null
}

/** The same, on the next frame: React has committed the closing render and the browser has laid it out. */
export function focusFirstAvailableNextFrame(candidates: FocusCandidate[], options?: FocusOptions): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { focusFirstAvailable(candidates, options) })
  else focusFirstAvailable(candidates, options)
}

/**
 * Focus that nobody owns: none, `<body>`, or a `<main>`. WebKit (Safari on macOS and iOS) does not
 * focus a tapped or clicked button: focus goes to its nearest focusable ancestor, which is the
 * skip link's `<main tabIndex={-1}>`. Code that gives focus back after a change treats these alike.
 */
export function isFocusDropped(el: Element | null | undefined): boolean {
  return !el || el === el.ownerDocument?.body || el.matches("main, [role=main]")
}
