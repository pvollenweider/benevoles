// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { BETA_CAPABILITIES } from "./beta-capabilities"

/**
 * Whether this version lets an event turn the workload protection on (#1171): false until the lot
 * with the organiser and volunteer pages flips the capability (`shipped`). The enforcement itself
 * never depends on it: an event that has protection keeps it. Its own module, so tests can serve
 * the capability as it will be once shipped.
 */
export function workloadProtectionShipped(): boolean {
  return (BETA_CAPABILITIES.workloadProtection as { shipped: boolean }).shipped === true
}
