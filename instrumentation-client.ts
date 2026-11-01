import { config as zodConfig } from "zod/v4/core"
import { onSentryRouterTransitionStart, startSentryClient } from "./src/lib/sentry-client-loader"

// The enforced script policy refuses eval (src/lib/security-headers.ts). Zod would otherwise probe
// for it with `new Function` before its first object schema (caught, but reported by the browser
// as a policy violation); without the probe it validates the same way. Set before any schema.
zodConfig({ jitless: true })

// The Sentry SDK itself loads once the page is idle, or at the first error (#773): see
// src/lib/sentry-client-loader.ts and src/lib/sentry-client-init.ts. This file stays the entry
// point because @sentry/nextjs injects its build-time values (route manifest) here.
startSentryClient()

// App Router: capture navigation transitions as spans (once the SDK is loaded)
export const onRouterTransitionStart = onSentryRouterTransitionStart
