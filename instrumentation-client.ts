import * as Sentry from "@sentry/nextjs"
import { scrubBreadcrumb, scrubEvent } from "./src/lib/sentry-scrub"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
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
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  // iOS browsers (Firefox, Brave) inject scripts into WKWebView (app:/// origin)
  // that throw on missing globals (__firefox__, DarkReader, window.ethereum). Not app code.
  // MetaMask (and other wallet extensions' inpage.js) likewise auto-connects on every page
  // load and throws when its own extension backend isn't reachable — nothing to do with this
  // site, which has no Web3/crypto code at all.
  ignoreErrors: [/__firefox__/, /DarkReader/, /window\.ethereum/, /MetaMask/],
  denyUrls: [/^app:\/\//, /inpage\.js/],
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
})

// App Router: capture navigation transitions as spans
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
