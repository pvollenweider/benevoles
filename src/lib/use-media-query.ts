// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useSyncExternalStore } from "react"

/**
 * Whether a media query matches, followed live (a phone turned sideways). null in the server
 * HTML and during hydration, when the screen is not known: the caller then renders something
 * the CSS can place for any width. Without `matchMedia` (old browser, test DOM): the query is
 * taken as matching.
 */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {}
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : true),
    () => null,
  )
}
