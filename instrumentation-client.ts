import { onSentryRouterTransitionStart, startSentryClient } from "./src/lib/sentry-client-loader"
import { installTranslationDomGuard } from "./src/lib/translation-dom-guard"

// Before hydration: a page the browser translated keeps working (src/lib/translation-dom-guard.ts).
installTranslationDomGuard(Node.prototype)

// The Sentry SDK itself loads once the page is idle, or at the first error (#773): see
// src/lib/sentry-client-loader.ts and src/lib/sentry-client-init.ts. This file stays the entry
// point because @sentry/nextjs injects its build-time values (route manifest) here.
startSentryClient()

// App Router: capture navigation transitions as spans (once the SDK is loaded)
export const onRouterTransitionStart = onSentryRouterTransitionStart
