// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { replayIntegration } from "@sentry/nextjs"
import { scrubReplayFrame } from "@/lib/sentry-scrub"

/**
 * Sentry session replay (the rrweb recorder, the largest part of the SDK), loaded on demand by
 * src/lib/sentry-client-init.ts on back-office pages only (#773). Never import it statically.
 * Its custom frames (breadcrumbs, spans) have their URLs scrubbed of tokens (#1042).
 */
export function createReplayIntegration(stillAllowed: () => boolean) {
  return replayIntegration({
    maskAllText: true,
    blockAllMedia: true,
    // Dropped once the page has moved to an address replay must not record, scrubbed otherwise.
    beforeAddRecordingEvent: (frame) => (stillAllowed() ? scrubReplayFrame(frame) : null),
  })
}
