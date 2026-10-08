// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { pathnameOf } from "@/lib/sentry-client-policy"

/**
 * Deferred browser Sentry (#773). The SDK used to be initialised before hydration on every page,
 * in the chunk every page shares; it is now imported once the page is idle, or straight away at the
 * first error. Errors thrown before it is ready are kept and sent once it is: no real error is lost.
 *
 * Dependency-free on purpose: instrumentation-client.ts imports this module on every page.
 */

/** What the deferred chunk (src/lib/sentry-client-init.ts) provides. */
export type SentryClientModule = {
  initSentryClient: () => void
  maybeStartReplay: (pathname: string) => void
  captureException: (error: unknown, hint?: { mechanism?: { type: string; handled: boolean } }) => unknown
  captureRouterTransitionStart: (href: string, navigationType: string) => void
}

type Pending = { error: unknown; mechanism?: "onerror" | "onunhandledrejection" }

type LoaderWindow = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout"> & {
  document: Pick<Document, "readyState">
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
}

export type SentryLoaderOptions = {
  load: () => Promise<SentryClientModule>
  win: LoaderWindow
  /** Upper bound of the idle wait once the page has loaded. */
  idleTimeoutMs?: number
}

export function createSentryLoader({ load, win, idleTimeoutMs = 4000 }: SentryLoaderOptions) {
  let sentry: SentryClientModule | null = null
  let loading: Promise<void> | null = null
  const pending: Pending[] = []

  const onError = (event: ErrorEvent) => {
    pending.push({ error: event.error ?? event.message, mechanism: "onerror" })
    void ensureLoaded()
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    // A rejection with a bare DOM Event (a failed resource load) has no stack: once loaded, the
    // SDK's own handler reports it as « captured as promise rejection » and beforeSendClient drops
    // it (BENEVOLAPP-P). Replayed here through captureException, it would read « captured as
    // exception » with this file as its stack and slip past that filter, so it is not kept.
    if (typeof Event !== "undefined" && event.reason instanceof Event) return
    pending.push({ error: event.reason, mechanism: "onunhandledrejection" })
    void ensureLoaded()
  }

  function ensureLoaded(): Promise<void> {
    if (!loading) {
      loading = load().then(
        (mod) => {
          mod.initSentryClient()
          // The SDK's own global handlers take over from here.
          win.removeEventListener("error", onError)
          win.removeEventListener("unhandledrejection", onRejection)
          sentry = mod
          for (const { error, mechanism } of pending.splice(0)) {
            mod.captureException(
              error,
              mechanism ? { mechanism: { type: `auto.browser.global_handlers.${mechanism}`, handled: false } } : undefined,
            )
          }
        },
        () => {
          // Chunk failed to load (offline, blocked): try again at the next error.
          loading = null
        },
      )
    }
    return loading
  }

  function whenIdle(callback: () => void) {
    const schedule = () =>
      win.requestIdleCallback ? win.requestIdleCallback(callback, { timeout: idleTimeoutMs }) : win.setTimeout(callback, 1500)
    if (win.document.readyState === "complete") schedule()
    else win.addEventListener("load", schedule, { once: true })
  }

  return {
    /** Listens for errors at once; loads the SDK when the page is idle. */
    start() {
      win.addEventListener("error", onError)
      win.addEventListener("unhandledrejection", onRejection)
      whenIdle(() => void ensureLoaded())
    },
    /** For error boundaries (global-error.tsx): sends now, or as soon as the SDK is loaded. */
    captureException(error: unknown) {
      if (sentry) sentry.captureException(error)
      else {
        pending.push({ error })
        void ensureLoaded()
      }
    },
    /** instrumentation-client.ts's `onRouterTransitionStart`; before the SDK loads, nothing to trace. */
    onRouterTransitionStart(href: string, navigationType: string) {
      if (!sentry) return
      sentry.captureRouterTransitionStart(href, navigationType)
      sentry.maybeStartReplay(pathnameOf(href))
    },
    /** Test hook. */
    ensureLoaded,
  }
}

const browserLoader =
  typeof window === "undefined" ? null : createSentryLoader({ load: () => import("@/lib/sentry-client-init"), win: window })

export function startSentryClient(): void {
  browserLoader?.start()
}

export function captureClientException(error: unknown): void {
  browserLoader?.captureException(error)
}

export function onSentryRouterTransitionStart(href: string, navigationType: string): void {
  browserLoader?.onRouterTransitionStart(href, navigationType)
}
