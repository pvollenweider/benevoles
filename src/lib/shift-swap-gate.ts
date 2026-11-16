// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { BETA_CAPABILITIES } from "./beta-capabilities"

/**
 * Whether this version serves shift swaps at all (#1174): false until the lot with the pages flips
 * the capability (`shipped`). Every route and read answers as if swaps were off meanwhile (Codex,
 * PR 2). Its own module, so tests can serve swaps as they will be once shipped.
 */
export function swapsShipped(): boolean {
  return (BETA_CAPABILITIES.shiftSwaps as { shipped: boolean }).shipped === true
}
