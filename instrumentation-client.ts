import * as Sentry from "@sentry/nextjs"
import { BROWSER_NOISE_ERRORS, NO_PII_DATA_COLLECTION, scrubBreadcrumb, scrubEvent, scrubSpan } from "./src/lib/sentry-scrub"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Only report from production builds: local development and E2E runs use the
  // real DSN from .env and used to pollute the production Sentry project.
  enabled: process.env.NODE_ENV === "production",
  // No IP, cookies, headers or other personal data; access tokens are stripped from URLs.
  dataCollection: NO_PII_DATA_COLLECTION,
  beforeSend: scrubEvent,
  beforeSendSpan: scrubSpan,
  beforeBreadcrumb: scrubBreadcrumb,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  // Errors from browser extensions, injected scripts and email link scanners (see the list).
  ignoreErrors: BROWSER_NOISE_ERRORS,
  denyUrls: [/^app:\/\//, /inpage\.js/],
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
})

// App Router: capture navigation transitions as spans
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
