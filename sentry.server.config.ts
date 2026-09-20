import * as Sentry from "@sentry/nextjs"
import { scrubBreadcrumb, scrubEvent } from "./src/lib/sentry-scrub"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Only report from production builds: local development and E2E runs use the
  // real DSN from .env and used to pollute the production Sentry project.
  enabled: process.env.NODE_ENV === "production",
  // No IP, cookies or request headers; access tokens are stripped from URLs.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
  tracesSampleRate: 0.1,
  // Off: it opens the Node inspector (logs "Debugger listening on ws://...") and
  // attaches local variable values to events, which can hold volunteer data.
  includeLocalVariables: false,
  enableLogs: true,
})
