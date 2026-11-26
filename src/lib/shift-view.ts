// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The visitor's choice between the timeline and the list of shifts (#808), kept on the device.
 * With no choice, the event's setting, else the width from which the timeline stays readable
 * (`frise-geometry.ts`); a long event shows the list on every width (part B, #1407).
 * Storage may be missing or throw (private window, blocked site data): no choice then.
 */

export type ShiftView = "frise" | "liste"

/** The event's setting for the default view: automatic, or forced to one of the two. */
export const SHIFT_VIEW_SETTINGS = ["auto", "frise", "liste"] as const
export type ShiftViewSetting = (typeof SHIFT_VIEW_SETTINGS)[number]

/** A stored setting as a valid one; an unknown value (old row, hand-edited) falls back to « auto ». */
export function shiftViewSetting(value: string | null | undefined): ShiftViewSetting {
  return value === "frise" || value === "liste" ? value : "auto"
}

/**
 * What the page shows. « auto »: the width is not known yet (server HTML, hydration), so both
 * views are rendered and CSS shows the one for the screen; nothing moves once the width is read.
 * It never lasts when the width cannot change the answer (`from` is 0 or null).
 */
export type ShownShiftView = ShiftView | "auto"

/** The media query of the width from which the timeline is the default. */
export function wideShiftViewQuery(from: number): string {
  return `(min-width: ${from}px)`
}

/**
 * The view shown: the choice made on this page, else the one kept on the device, else the
 * event's rule. `wide` is null while the width is unknown (server render, hydration); `from`
 * is `friseFromWidth`: 0 = always the timeline, null = never, a positive width = from there.
 */
export function shownShiftView(
  chosen: ShiftView | null,
  saved: ShiftView | null,
  wide: boolean | null,
  from: number | null,
): ShownShiftView {
  if (chosen) return chosen
  if (saved) return saved
  // Known without the width: no « auto » double render, nothing to move once it is read.
  if (from === 0) return "frise"
  if (from === null) return "liste"
  if (wide === null) return "auto"
  return wide ? "frise" : "liste"
}

export const SHIFT_VIEW_KEY = "benevoles:public-shift-view"
export const SHIFT_VIEW_HINT_KEY = "benevoles:public-shift-view-hint"

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

/** Whether the one-time hint on the « Frise » button was already played on this device. */
export function readShiftViewHintPlayed(store: Storage | null = storage()): boolean {
  try {
    return store?.getItem(SHIFT_VIEW_HINT_KEY) === "1"
  } catch {
    return false
  }
}

export function saveShiftViewHintPlayed(store: Storage | null = storage()): void {
  try {
    store?.setItem(SHIFT_VIEW_HINT_KEY, "1")
  } catch {
    // Not kept: with storage blocked the hint may play again on the next load.
  }
}

/**
 * The sentence « Tourne le téléphone… » (part D, #1407). Only while the list is the view shown
 * for the width (no choice anywhere, no shift kept), on a touch device held upright whose screen's
 * long side could show the timeline: the device can be turned to reach it.
 */
export function showsRotateHint({
  view, chosen, saved, kept, from, coarsePointer, portrait, screenLongSide,
}: {
  view: ShownShiftView
  chosen: ShiftView | null
  saved: ShiftView | null
  kept: ShiftView | null
  from: number | null
  coarsePointer: boolean | null
  portrait: boolean | null
  screenLongSide: number | null
}): boolean {
  return view === "liste"
    && chosen === null
    && saved === null
    && kept === null
    && from !== null
    && from > 0
    && coarsePointer === true
    && portrait === true
    && screenLongSide !== null
    && screenLongSide >= from
}

/** How a « Frise » / « Liste » button looks: pressed, not pressed, or decided by the breakpoint. */
export type ShiftViewButtonLook = "on" | "off" | "on-when-wide" | "on-when-narrow"

export function shiftViewButtonLook(view: ShiftView, shown: ShownShiftView): ShiftViewButtonLook {
  if (shown === "auto") return view === "frise" ? "on-when-wide" : "on-when-narrow"
  return shown === view ? "on" : "off"
}
