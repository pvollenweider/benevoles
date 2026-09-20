import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // Off: it opens the Node inspector (logs "Debugger listening on ws://...") and
  // attaches local variable values to events, which can hold volunteer data.
  includeLocalVariables: false,
  enableLogs: true,
})
