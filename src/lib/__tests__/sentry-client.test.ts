import { describe, it, expect, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import type { ErrorEvent } from "@sentry/nextjs"
import { isStaffPath, pathnameOf, replayAllowedFor, tracesSampleRateFor, urlCarriesSecret, STAFF_TRACES_SAMPLE_RATE } from "../sentry-client-policy"
import { browserSentryAllowedOn, createSentryLoader, type SentryClientModule } from "../sentry-client-loader"
import { beforeSendClient, isInjectedEvalRefusal, isInterruptedPageStream, isStacklessDomEventRejection, isStacklessNetworkRejection } from "../sentry-scrub"

// Deferred browser Sentry (#773).

describe("sentry client policy", () => {
  it("recognizes the back-office paths only", () => {
    for (const p of ["/admin", "/admin/events/abc", "/super-admin", "/super-admin/organizations"]) expect(isStaffPath(p)).toBe(true)
    for (const p of ["/", "/doc", "/videos/X", "/administration", "/super-administrator", "/spectacle-cirque-2026"]) expect(isStaffPath(p)).toBe(false)
  })

  it("traces back-office pages only, from the span name or else the location", () => {
    expect(tracesSampleRateFor("/admin/events/[id]", "/")).toBe(STAFF_TRACES_SAMPLE_RATE)
    expect(tracesSampleRateFor("/doc", "/admin")).toBe(0)
    expect(tracesSampleRateFor("GET", "/super-admin")).toBe(STAFF_TRACES_SAMPLE_RATE)
    expect(tracesSampleRateFor(undefined, "/")).toBe(0)
  })

  it("loads replay on signed-in back-office pages only", () => {
    expect(replayAllowedFor("/admin/events")).toBe(true)
    expect(replayAllowedFor("https://www.benevol.app/super-admin/organizations?page=2")).toBe(true)
    expect(replayAllowedFor("/videos")).toBe(false)
  })

  // #1042: the recorder keeps the page address as is, past beforeSend.
  it("never replays the public admin pages, token or not, with or without a trailing slash", () => {
    for (const p of [
      "/admin/login", "/admin/forgot-password", "/admin/reset-password", "/admin/accept-invite",
      "/admin/reactivate", "/admin/reactivate/confirm", "/admin/keep", "/admin/keep/",
      "https://www.benevol.app/admin/reset-password", "/admin/accept-invite#x",
    ]) expect(replayAllowedFor(p)).toBe(false)
  })

  it("never replays an address carrying a token or an email address, raw or encoded", () => {
    const secret = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const tokenQuery = new URLSearchParams({ token: secret }).toString()
    for (const href of [
      `/admin/events?${tokenQuery}`,
      `/admin/events?x=1&${new URLSearchParams({ t: secret })}`,
      `/admin/login?${new URLSearchParams({ callbackUrl: `/admin/keep?${tokenQuery}` })}`,
      "/admin/members?q=jane%40example.org",
      "/admin/members?q=%E0%A4%A",
    ]) expect(replayAllowedFor(href)).toBe(false)
    expect(urlCarriesSecret("/admin/events?tab=shifts")).toBe(false)
    expect(urlCarriesSecret(`/my/${secret}`)).toBe(true)
  })

  it("extracts the path of an href", () => {
    expect(pathnameOf("/admin/events?x=1#y")).toBe("/admin/events")
    expect(pathnameOf("https://www.benevol.app/doc")).toBe("/doc")
  })
})

function fakeWindow(readyState: DocumentReadyState = "complete") {
  const target = new EventTarget()
  const idle: (() => void)[] = []
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    setTimeout: ((cb: () => void) => {
      idle.push(cb)
      return 0
    }) as unknown as Window["setTimeout"],
    requestIdleCallback: (cb: () => void) => {
      idle.push(cb)
      return 0
    },
    document: { readyState },
    runIdle: () => idle.splice(0).forEach((cb) => cb()),
  }
}

function fakeSentry() {
  return {
    initSentryClient: vi.fn(),
    maybeStartReplay: vi.fn(),
    captureException: vi.fn(),
    captureRouterTransitionStart: vi.fn(),
  } satisfies SentryClientModule
}

function errorEvent(error: unknown): Event {
  return Object.assign(new Event("error"), { error, message: String(error) })
}

describe("sentry client loader", () => {
  it("does not load the SDK before the page is idle", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const load = vi.fn(async () => sentry)
    createSentryLoader({ load, win }).start()
    expect(load).not.toHaveBeenCalled()
    win.runIdle()
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(sentry.initSentryClient).toHaveBeenCalledTimes(1))
  })

  it("waits for the load event when the document is still loading", () => {
    const win = fakeWindow("loading")
    const load = vi.fn(async () => fakeSentry())
    createSentryLoader({ load, win }).start()
    win.runIdle()
    expect(load).not.toHaveBeenCalled()
    win.dispatchEvent(new Event("load"))
    win.runIdle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("loads at once on an early error and sends it, as unhandled", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const loader = createSentryLoader({ load: async () => sentry, win })
    loader.start()
    const boom = new Error("boom")
    win.dispatchEvent(errorEvent(boom))
    await loader.ensureLoaded()
    expect(sentry.initSentryClient).toHaveBeenCalledTimes(1)
    expect(sentry.captureException).toHaveBeenCalledWith(boom, {
      mechanism: { type: "auto.browser.global_handlers.onerror", handled: false },
    })
  })

  it("keeps an early unhandled rejection", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const loader = createSentryLoader({ load: async () => sentry, win })
    loader.start()
    const reason = new Error("rejected")
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }))
    await loader.ensureLoaded()
    expect(sentry.captureException).toHaveBeenCalledWith(reason, {
      mechanism: { type: "auto.browser.global_handlers.onunhandledrejection", handled: false },
    })
  })

  it("does not keep an early rejection whose reason is a bare DOM Event (BENEVOLAPP-P)", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const loader = createSentryLoader({ load: async () => sentry, win })
    loader.start()
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Event("error") }))
    await loader.ensureLoaded()
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it("stops listening once the SDK is loaded (its own handlers take over)", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const loader = createSentryLoader({ load: async () => sentry, win })
    loader.start()
    await loader.ensureLoaded()
    win.dispatchEvent(errorEvent(new Error("later")))
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it("sends an error boundary's error before and after loading", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const loader = createSentryLoader({ load: async () => sentry, win })
    loader.start()
    const first = new Error("first")
    loader.captureException(first)
    await loader.ensureLoaded()
    expect(sentry.captureException).toHaveBeenCalledWith(first, undefined)
    const second = new Error("second")
    loader.captureException(second)
    expect(sentry.captureException).toHaveBeenLastCalledWith(second)
  })

  it("retries at the next error when the chunk fails to load", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(sentry)
    const loader = createSentryLoader({ load, win })
    loader.start()
    const boom = new Error("boom")
    win.dispatchEvent(errorEvent(boom))
    await loader.ensureLoaded()
    expect(sentry.initSentryClient).not.toHaveBeenCalled()
    win.dispatchEvent(errorEvent(new Error("again")))
    await loader.ensureLoaded()
    expect(sentry.captureException).toHaveBeenCalledTimes(2)
  })

  it("forwards router transitions once loaded, and starts replay for the target path", async () => {
    const win = fakeWindow()
    const sentry = fakeSentry()
    const loader = createSentryLoader({ load: async () => sentry, win })
    loader.start()
    loader.onRouterTransitionStart("/admin", "push")
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled()
    await loader.ensureLoaded()
    loader.onRouterTransitionStart("/admin/events?tab=1", "push")
    expect(sentry.captureRouterTransitionStart).toHaveBeenCalledWith("/admin/events?tab=1", "push")
    expect(sentry.maybeStartReplay).toHaveBeenCalledWith("/admin/events?tab=1")
    // Replay is stopped before the transition is traced (#1042).
    expect(sentry.maybeStartReplay.mock.invocationCallOrder[0]).toBeLessThan(sentry.captureRouterTransitionStart.mock.invocationCallOrder[0])
  })
})

describe("stackless DOM Event rejections (BENEVOLAPP-P)", () => {
  const rejection = (overrides: Record<string, unknown> = {}): ErrorEvent =>
    ({
      type: undefined,
      exception: {
        values: [
          {
            type: "Event",
            value: "Event `Event` (type=error) captured as promise rejection",
            mechanism: { type: "auto.browser.global_handlers.onunhandledrejection", handled: false },
            ...overrides,
          },
        ],
      },
    }) as ErrorEvent

  it("drops the rejection of a bare DOM Event", () => {
    expect(isStacklessDomEventRejection(rejection())).toBe(true)
    expect(beforeSendClient(rejection())).toBeNull()
    expect(isStacklessDomEventRejection(rejection({ value: "Event `ProgressEvent` (type=abort) captured as promise rejection" }))).toBe(true)
  })

  it("keeps real errors", () => {
    const real = rejection({ type: "TypeError", value: "Cannot read properties of undefined (reading 'id')" })
    expect(isStacklessDomEventRejection(real)).toBe(false)
    expect(beforeSendClient(real)).toBe(real)
  })

  it("keeps it when it has a stack, or did not come from an unhandled rejection", () => {
    expect(isStacklessDomEventRejection(rejection({ stacktrace: { frames: [{ filename: "app.js" }] } }))).toBe(false)
    expect(isStacklessDomEventRejection(rejection({ mechanism: { type: "generic", handled: true } }))).toBe(false)
    expect(isStacklessDomEventRejection({ type: undefined } as ErrorEvent)).toBe(false)
  })
})

describe("stackless network failures (Safari « Load failed » after a deploy)", () => {
  const rejection = (overrides: Record<string, unknown> = {}): ErrorEvent =>
    ({
      type: undefined,
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Load failed",
            mechanism: { type: "auto.browser.global_handlers.onunhandledrejection", handled: false },
            ...overrides,
          },
        ],
      },
    }) as ErrorEvent

  it("drops the browsers' network failure messages", () => {
    for (const value of ["Load failed", "Failed to fetch", "NetworkError when attempting to fetch resource."]) {
      expect(isStacklessNetworkRejection(rejection({ value }))).toBe(true)
      expect(beforeSendClient(rejection({ value }))).toBeNull()
    }
  })

  it("keeps it with a stack, from another mechanism, another type or another message", () => {
    expect(isStacklessNetworkRejection(rejection({ stacktrace: { frames: [{ filename: "app.js" }] } }))).toBe(false)
    expect(isStacklessNetworkRejection(rejection({ mechanism: { type: "generic", handled: true } }))).toBe(false)
    expect(isStacklessNetworkRejection(rejection({ type: "Error" }))).toBe(false)
    expect(isStacklessNetworkRejection(rejection({ value: "Load failed: /api/admin/events" }))).toBe(false)
    expect(isStacklessNetworkRejection({ type: undefined } as ErrorEvent)).toBe(false)
  })
})

describe("interrupted page stream (« Connection closed. »)", () => {
  const exception = (overrides: Record<string, unknown> = {}) => ({
    type: "Error",
    value: "Connection closed.",
    mechanism: { type: "generic", handled: true },
    stacktrace: { frames: [{ filename: "app:///_next/static/chunks/x.js", function: "r", lineno: 1, colno: 1 }, { filename: "app:///_next/static/chunks/x.js", function: "r", lineno: 2, colno: 2 }] },
    ...overrides,
  })
  const event = (...values: Record<string, unknown>[]): ErrorEvent => ({ type: undefined, exception: { values } }) as ErrorEvent

  it("drops the React Server Components client's interrupted stream", () => {
    const e = event(exception())
    expect(isInterruptedPageStream(e)).toBe(true)
    expect(beforeSendClient(e)).toBeNull()
  })

  it("keeps a message that only mentions the words, or another error type", () => {
    for (const value of ["Connection closed", "Connection closed. Retrying", "WebSocket Connection closed."]) {
      const e = event(exception({ value }))
      expect(isInterruptedPageStream(e), value).toBe(false)
      expect(beforeSendClient(e), value).toBe(e)
    }
    const typed = event(exception({ type: "TypeError" }))
    expect(isInterruptedPageStream(typed)).toBe(false)
    expect(beforeSendClient(typed)).toBe(typed)
  })

  it("keeps it when one exception among several is not the exact message, or when there is none", () => {
    const mixed = event(exception(), exception({ value: "boom" }))
    expect(isInterruptedPageStream(mixed)).toBe(false)
    expect(beforeSendClient(mixed)).toBe(mixed)
    const none = { type: undefined } as ErrorEvent
    expect(isInterruptedPageStream(none)).toBe(false)
    expect(beforeSendClient(none)).toBe(none)
  })
  // Firefox's wording for the same interruption (Sentry issue 164148668): no stack at all.
  it("drops Firefox's « Error in input stream » when it has no stack", () => {
    const firefox = event({ type: "TypeError", value: "Error in input stream", mechanism: { type: "generic", handled: true } })
    expect(isInterruptedPageStream(firefox)).toBe(true)
    expect(beforeSendClient(firefox)).toBeNull()
  })

  it("keeps Firefox's message when a stack frame could point at our code, or with another type or wording", () => {
    const framed = event(exception({ type: "TypeError", value: "Error in input stream" }))
    expect(isInterruptedPageStream(framed)).toBe(false)
    expect(beforeSendClient(framed)).toBe(framed)
    for (const [type, value] of [["Error", "Error in input stream"], ["TypeError", "Error in input stream while parsing"], ["TypeError", "error in input stream"]]) {
      const e = event({ type, value })
      expect(isInterruptedPageStream(e), `${type}: ${value}`).toBe(false)
      expect(beforeSendClient(e), `${type}: ${value}`).toBe(e)
    }
  })
})

// Regression guards: what every public page downloads (#773).
describe("string evaluation refused by the script policy, from an injected script", () => {
  const CHROME =
    "Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script: script-src 'self' 'nonce-abc' 'strict-dynamic' 'sha256-xyz'"
  const WEBKIT = "Refused to evaluate a string as JavaScript because 'unsafe-eval' or 'trusted-types-eval' is not an allowed source of script in the following Content Security Policy directive: \"script-src 'self'\".\n"
  const anonymous = [{ filename: "<anonymous>", function: "eval" }, { filename: "<anonymous>", function: "injFunc", lineno: 1, colno: 156 }, { filename: "<anonymous>", lineno: 1, colno: 172 }]
  const value = (overrides: Record<string, unknown> = {}) => ({
    type: "EvalError",
    value: CHROME,
    mechanism: { type: "auto.browser.global_handlers.onerror", handled: false },
    stacktrace: { frames: anonymous },
    ...overrides,
  })
  const event = (...values: Record<string, unknown>[]): ErrorEvent => ({ type: undefined, exception: { values } }) as ErrorEvent

  it("drops the event seen in production (three anonymous frames)", () => {
    expect(isInjectedEvalRefusal(event(value()))).toBe(true)
    expect(beforeSendClient(event(value()))).toBeNull()
  })

  it("drops the WebKit wording, and an event without any stack", () => {
    expect(isInjectedEvalRefusal(event(value({ value: WEBKIT })))).toBe(true)
    expect(isInjectedEvalRefusal(event(value({ stacktrace: undefined })))).toBe(true)
    expect(isInjectedEvalRefusal(event(value({ stacktrace: { frames: [] } })))).toBe(true)
    expect(isInjectedEvalRefusal(event(value({ stacktrace: { frames: [{ filename: "chrome-extension://abc/content.js" }] } })))).toBe(true)
  })

  it("keeps it when a frame is in the app (Sentry app:/// path or a full URL)", () => {
    for (const filename of ["app:///_next/static/chunks/x.js", "https://benevol.app/_next/static/chunks/x.js"]) {
      const e = event(value({ stacktrace: { frames: [...anonymous, { filename }] } }))
      expect(isInjectedEvalRefusal(e)).toBe(false)
      expect(beforeSendClient(e)).toBe(e)
    }
  })

  it("keeps an EvalError that is not about the script policy", () => {
    const e = event(value({ value: "Code generation from strings disallowed for this context" }))
    expect(isInjectedEvalRefusal(e)).toBe(false)
    expect(beforeSendClient(e)).toBe(e)
  })

  it("keeps another error with anonymous frames only", () => {
    const e = event(value({ type: "TypeError", value: "x is not a function" }))
    expect(isInjectedEvalRefusal(e)).toBe(false)
    expect(beforeSendClient(e)).toBe(e)
  })

  it("keeps an event with two exception values when only one matches", () => {
    const e = event(value(), value({ type: "Error", value: "boom" }))
    expect(isInjectedEvalRefusal(e)).toBe(false)
    expect(beforeSendClient(e)).toBe(e)
    expect(isInjectedEvalRefusal({ type: undefined } as ErrorEvent)).toBe(false)
  })
})

describe("browser Sentry only on the allowed domains (#1335)", () => {
  it("runs on benevol.app and its organisations' subdomains", () => {
    for (const host of ["benevol.app", "www.benevol.app", "ape-chateauneuf.benevol.app", "WWW.Benevol.App", "benevol.app."]) {
      expect(browserSentryAllowedOn(host, "benevol.app"), host).toBe(true)
    }
  })

  it("does not run on another instance of the published image", () => {
    for (const host of ["localhost", "127.0.0.1", "benevoles.example.org", "benevol.app.example.org", "notbenevol.app"]) {
      expect(browserSentryAllowedOn(host, "benevol.app"), host).toBe(false)
    }
  })

  it("runs anywhere when no domain is set (an image built with its own DSN)", () => {
    expect(browserSentryAllowedOn("benevoles.example.org", undefined)).toBe(true)
    expect(browserSentryAllowedOn("localhost", " , ")).toBe(true)
  })

  it("accepts a list of domains", () => {
    expect(browserSentryAllowedOn("app.example.org", "benevol.app, example.org")).toBe(true)
    expect(browserSentryAllowedOn("example.net", "benevol.app, example.org")).toBe(false)
  })

  it("is set to benevol.app for the published image", () => {
    const root = path.join(__dirname, "..", "..", "..")
    expect(fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf-8")).toContain("NEXT_PUBLIC_SENTRY_ALLOWED_HOSTS=benevol.app")
    expect(fs.readFileSync(path.join(root, "Dockerfile"), "utf-8")).toContain("ENV NEXT_PUBLIC_SENTRY_ALLOWED_HOSTS=$NEXT_PUBLIC_SENTRY_ALLOWED_HOSTS")
  })
})

describe("client bundle guards", () => {
  const root = path.join(__dirname, "..", "..", "..")
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf-8")
  const staticImports = (src: string) => [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1])

  it("loads the Sentry SDK only through a dynamic import", () => {
    for (const f of ["instrumentation-client.ts", "src/lib/sentry-client-loader.ts", "src/lib/sentry-client-policy.ts", "src/app/global-error.tsx"]) {
      expect(staticImports(read(f)).filter((m) => m.startsWith("@sentry/")), f).toEqual([])
    }
    expect(read("src/lib/sentry-client-loader.ts")).toContain('import("@/lib/sentry-client-init")')
    expect(read("src/lib/sentry-client-init.ts")).not.toMatch(/replayIntegration/)
  })

  it("keeps zod out of the video modules bundled for the browser", () => {
    for (const f of ["src/lib/video-catalog.ts", "src/lib/video-feedback.ts"]) {
      expect(staticImports(read(f)), f).not.toContain("zod")
    }
  })
})
