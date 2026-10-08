// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { replayIntegration } from "@sentry/nextjs"

/**
 * Sentry session replay (the rrweb recorder, the largest part of the SDK), loaded on demand by
 * src/lib/sentry-client-init.ts on back-office pages only (#773). Never import it statically.
 */
export function createReplayIntegration() {
  return replayIntegration({ maskAllText: true, blockAllMedia: true })
}
