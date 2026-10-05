// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Autoplay-with-sound on a video's detail page, but only when the visitor arrived by clicking a
 * gallery card or a related-video link in the same session — never on a typed URL, an external
 * link or a reload — and never under `prefers-reduced-motion: reduce` (#644 owner decision). No
 * query string carries this (the URL must stay plain and shareable without autoplaying): a
 * `sessionStorage` flag set right before client navigation (`markAutoplayIntent`, called by
 * AutoplayLink.tsx) and consumed — read once, then cleared — by the player on mount
 * (`consumeAutoplayIntent`), so reloading the same detail page never autoplays a second time.
 */

const INTENT_KEY = "benevol:video-autoplay-intent"

/** Called by a gallery card or related-video link just before client-side navigation. Never throws. */
export function markAutoplayIntent(): void {
  try {
    sessionStorage.setItem(INTENT_KEY, "1")
  } catch {
    // Storage unavailable (private browsing, disabled, SSR) — autoplay just won't happen.
  }
}

/** Reads and clears the flag: a direct visit, reload or external link never sees it set. Never throws. */
export function consumeAutoplayIntent(): boolean {
  try {
    const present = sessionStorage.getItem(INTENT_KEY) === "1"
    sessionStorage.removeItem(INTENT_KEY)
    return present
  } catch {
    return false
  }
}

/** Pure decision: autoplay only when arriving from the gallery (or a related-video link), and motion is allowed. */
export function shouldAutoplay({ fromGallery, reducedMotion }: { fromGallery: boolean; reducedMotion: boolean }): boolean {
  return fromGallery && !reducedMotion
}
