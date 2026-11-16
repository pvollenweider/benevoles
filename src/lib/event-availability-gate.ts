// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { BETA_CAPABILITIES } from "./beta-capabilities"

/**
 * Whether this version lets an event start collecting dated availability (#1146). The links,
 * pages and answers of an event that already adopted it never depend on it. Its own module, so
 * tests can serve the capability either way.
 */
export function availabilityShipped(): boolean {
  return (BETA_CAPABILITIES.availability as { shipped: boolean }).shipped === true
}
