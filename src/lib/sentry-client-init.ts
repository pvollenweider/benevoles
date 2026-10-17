// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import * as Sentry from "@sentry/nextjs"
import { BROWSER_NOISE_ERRORS, NO_PII_DATA_COLLECTION, beforeSendClient, scrubBreadcrumb, scrubReplayEvent, scrubSpan } from "@/lib/sentry-scrub"
import { replayAllowedFor, tracesSampleRateFor } from "@/lib/sentry-client-policy"

/**
 * The browser Sentry SDK, in its own chunk (#773): src/lib/sentry-client-loader.ts imports it once
 * the page is idle, or at the first error. Never import this module statically.
 */

let replayRequested = false
let replayBarred = false

/** Stops the recorder for the rest of this page load, dropping its pending segment (#1042). */
function barReplay(): void {
  if (replayBarred) return
  replayBarred = true
  if (replayRequested) void Sentry.getReplay()?.stop({ flush: false })
}

/** Frame guard: an address change the router hooks did not see (a raw `pushState`) also bars replay. */
function replayStillAllowed(): boolean {
  if (!replayBarred && replayAllowedFor(window.location.href)) return true
  // Not from inside the recorder's own callback.
  setTimeout(barReplay, 0)
  return false
}

/**
 * Session replay, in a further chunk, only once a signed-in back-office page is shown (see the
 * policy), and called again at every navigation with the target address. Heading for an address
 * replay must not record (a public page, a token in the URL: #1042), the recorder is stopped
 * before the address changes, its pending segment dropped, and not restarted until the next full
 * page load: `start()` would open a new session regardless of the sample rate.
 */
export function maybeStartReplay(href: string): void {
  if (replayBarred) return
  if (!replayAllowedFor(href)) {
    barReplay()
    return
  }
  if (replayRequested) return
  replayRequested = true
  void import("@/lib/sentry-replay").then(({ createReplayIntegration }) => {
    // The address may have changed while this chunk was loading.
    if (replayBarred || !replayAllowedFor(window.location.href)) {
      replayBarred = true
      return
    }
    Sentry.addIntegration(createReplayIntegration(replayStillAllowed))
  })
}

export function initSentryClient(): void {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Only report from production builds: local development and E2E runs use the
    // real DSN from .env and used to pollute the production Sentry project.
    enabled: process.env.NODE_ENV === "production",
    // No IP, cookies, headers or other personal data; access tokens are stripped from URLs.
    dataCollection: NO_PII_DATA_COLLECTION,
    beforeSend: beforeSendClient,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
    // Back office only (src/lib/sentry-client-policy.ts): a public page view sends nothing.
    tracesSampler: ({ name }) => tracesSampleRateFor(name, window.location.pathname),
    // Read by the replay integration, which is only added on back-office pages.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Errors from browser extensions, injected scripts and email link scanners (see the list).
    ignoreErrors: BROWSER_NOISE_ERRORS,
    denyUrls: [/^app:\/\//, /inpage\.js/],
    // No release-health session: it sent one request to /monitoring on every page view, the 429
    // Lighthouse reported on the home page once the project's quota was reached (#773).
    integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserSession"),
  })
  // The replay event's URL list goes past beforeSend (#1042).
  Sentry.getClient()?.on("preprocessEvent", scrubReplayEvent)
  maybeStartReplay(window.location.href)
}

export const captureException = Sentry.captureException
export const captureRouterTransitionStart = Sentry.captureRouterTransitionStart
