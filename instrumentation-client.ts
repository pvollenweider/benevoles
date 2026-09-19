import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  // iOS browsers (Firefox, Brave) inject scripts into WKWebView (app:/// origin)
  // that throw on missing globals (__firefox__, DarkReader, window.ethereum). Not app code.
  ignoreErrors: [/__firefox__/, /DarkReader/, /window\.ethereum/],
  denyUrls: [/^app:\/\//],
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
})

// App Router: capture navigation transitions as spans
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
