// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The visitor's choice between the timeline and the list of shifts (#808), kept on the device.
 * The timeline is the default everywhere; the server always renders it, the choice is read after
 * hydration. Storage may be missing or throw (private window, blocked site data): no choice then.
 */

export type ShiftView = "frise" | "liste"

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
