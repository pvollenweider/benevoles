// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The visitor's choice between the timeline and the list of shifts (#808), kept on the device.
 * With no choice, the list on a phone and the timeline from the `sm` breakpoint up (#1407).
 * Storage may be missing or throw (private window, blocked site data): no choice then.
 */

export type ShiftView = "frise" | "liste"

/**
 * What the page shows. « auto »: the width is not known yet (server HTML, hydration), so both
 * views are rendered and CSS shows the one for the screen; nothing moves once the width is read.
 */
export type ShownShiftView = ShiftView | "auto"

/** Tailwind's `sm` breakpoint (40rem): the timeline from there up, the list below. */
export const WIDE_SHIFT_VIEW_QUERY = "(min-width: 40rem)"

/**
 * The view shown: the choice made on this page, else the one kept on the device, else the
 * screen's default. `wide` is null while the width is unknown (server render, hydration).
 */
export function shownShiftView(chosen: ShiftView | null, saved: ShiftView | null, wide: boolean | null): ShownShiftView {
  if (chosen) return chosen
  if (saved) return saved
  if (wide === null) return "auto"
  return wide ? "frise" : "liste"
}

export const SHIFT_VIEW_KEY = "benevoles:public-shift-view"

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">

const storage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

export function readShiftView(store: Storage | null = storage()): ShiftView | null {
  try {
    const value = store?.getItem(SHIFT_VIEW_KEY)
    return value === "frise" || value === "liste" ? value : null
  } catch {
    return null
  }
}

export function saveShiftView(view: ShiftView, store: Storage | null = storage()): void {
  try {
    store?.setItem(SHIFT_VIEW_KEY, view)
  } catch {
    // Not kept on this device: the choice still applies to this page.
  }
}

/** How a « Frise » / « Liste » button looks: pressed, not pressed, or decided by the breakpoint. */
export type ShiftViewButtonLook = "on" | "off" | "on-when-wide" | "on-when-narrow"

export function shiftViewButtonLook(view: ShiftView, shown: ShownShiftView): ShiftViewButtonLook {
  if (shown === "auto") return view === "frise" ? "on-when-wide" : "on-when-narrow"
  return shown === view ? "on" : "off"
}
