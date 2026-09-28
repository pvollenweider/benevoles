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
  // Off: it opens the Node inspector (logs "Debugger listening on ws://...") and
  // attaches local variable values to events, which can hold volunteer data.
  includeLocalVariables: false,
  // Next.js throws this when the client disconnects before an in-flight streamed SSR response
  // finishes — tab closed mid-load, navigated away, or (the observed case) an RSC prefetch
  // (`?_rsc=...`) aborted by the browser. A client-side abort, not an app error; nothing to fix
  // on this end.
  ignoreErrors: [/The destination stream closed early/],
})
