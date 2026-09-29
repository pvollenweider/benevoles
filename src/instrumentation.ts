// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env")
    const { assertProductionSecrets } = await import("./lib/production-guards")
    assertProductionSecrets()
    await import("../sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config")
  }
}

// Captures all unhandled server-side request errors (requires @sentry/nextjs >= 8.28.0)
export const onRequestError = Sentry.captureRequestError
