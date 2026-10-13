// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The browser storage of the public event page (the volunteer's session on this device), read and
 * written without ever throwing. Storage can be missing or refused: a private window, blocked site
 * data, and above all the sign-up embedded on another site (#948), where a third-party frame gets
 * a storage partitioned per site or none at all. The page then works without the remembered
 * session: nothing breaks, the volunteer just isn't recognised.
 */

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">

function localStore(): Store | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

export function readStored(key: string, store: Store | null = localStore()): string | null {
  try {
    return store?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string, store: Store | null = localStore()): void {
  try {
    store?.setItem(key, value)
  } catch {
    // Not kept on this device: the confirmation email carries the personal link anyway.
  }
}

export function removeStored(key: string, store: Store | null = localStore()): void {
  try {
    store?.removeItem(key)
  } catch {
    // Nothing was stored, or it can't be reached: nothing to forget either.
  }
}
