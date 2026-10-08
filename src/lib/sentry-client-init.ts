// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import * as Sentry from "@sentry/nextjs"
import { BROWSER_NOISE_ERRORS, NO_PII_DATA_COLLECTION, beforeSendClient, scrubBreadcrumb, scrubSpan } from "@/lib/sentry-scrub"
import { tracesSampleRateFor, wantsReplay } from "@/lib/sentry-client-policy"

/**
 * The browser Sentry SDK, in its own chunk (#773): src/lib/sentry-client-loader.ts imports it once
 * the page is idle, or at the first error. Never import this module statically.
 */

let replayRequested = false

/** Session replay, in a further chunk, only once a back-office page is shown (see the policy). */
export function maybeStartReplay(pathname: string): void {
  if (replayRequested || !wantsReplay(pathname)) return
  replayRequested = true
  void import("@/lib/sentry-replay").then(({ createReplayIntegration }) => {
    Sentry.addIntegration(createReplayIntegration())
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
  maybeStartReplay(window.location.pathname)
}

export const captureException = Sentry.captureException
export const captureRouterTransitionStart = Sentry.captureRouterTransitionStart
