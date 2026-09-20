import * as Sentry from "@sentry/nextjs"
import { scrubBreadcrumb, scrubEvent } from "./src/lib/sentry-scrub"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // No IP, cookies or request headers; access tokens are stripped from URLs.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // Off: it opens the Node inspector (logs "Debugger listening on ws://...") and
  // attaches local variable values to events, which can hold volunteer data.
  includeLocalVariables: false,
  enableLogs: true,
})
