// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { virtual } from "@guidepup/virtual-screen-reader"

/**
 * A local setup of the virtual screen reader (#739), kept in this folder: it needs a DOM
 * (`jsdom`) and one instance at a time, so tests start it on the rendered container and stop it
 * in `afterEach`. It approximates what a screen reader says from the accessibility tree, the
 * focus changes and the live regions — it is not VoiceOver or NVDA.
 */
export type VirtualScreenReader = {
  /** Every phrase spoken since the start (or since `clear`), in order; live regions included. */
  spokenPhraseLog: () => Promise<string[]>
  /** The phrase spoken last, useful to wait for an announcement. */
  lastSpokenPhrase: () => Promise<string>
  /** Moves the virtual cursor to the next item (heading, link, control…), as a reader would. */
  next: () => Promise<void>
  /** Forgets what was spoken so far, to assert on one action only. */
  clear: () => Promise<void>
}

let running = false

/** Starts the reader on `container` and clears the opening phrase; stop it with `stopVirtualScreenReader`. */
export async function startVirtualScreenReader(container: Element): Promise<VirtualScreenReader> {
  await virtual.start({ container })
  running = true
  await virtual.clearSpokenPhraseLog()
  return {
    spokenPhraseLog: () => virtual.spokenPhraseLog(),
    lastSpokenPhrase: () => virtual.lastSpokenPhrase(),
    next: () => virtual.next(),
    clear: () => virtual.clearSpokenPhraseLog(),
  }
}

/** Stops the reader after a test, whether it passed or not. Safe when nothing was started. */
export async function stopVirtualScreenReader(): Promise<void> {
  if (!running) return
  running = false
  await virtual.stop()
}
