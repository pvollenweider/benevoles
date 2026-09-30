// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sets a live-region text so that it is voiced even when identical to the previous one:
 * React skips a same-string update, so the region is emptied first and filled on the next frame.
 */
export function announce(set: (text: string) => void, text: string): void {
  set("")
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => set(text))
  else set(text)
}
