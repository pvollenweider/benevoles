import * as Sentry from "@sentry/nextjs"
import { NO_PII_DATA_COLLECTION, scrubBreadcrumb, scrubEvent, scrubSpan } from "./src/lib/sentry-scrub"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
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
})
