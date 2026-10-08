import { describe, it, expect, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import type { ErrorEvent } from "@sentry/nextjs"
import { isStaffPath, pathnameOf, tracesSampleRateFor, wantsReplay, STAFF_TRACES_SAMPLE_RATE } from "../sentry-client-policy"
import { createSentryLoader, type SentryClientModule } from "../sentry-client-loader"
import { beforeSendClient, isStacklessDomEventRejection } from "../sentry-scrub"

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

  it("loads replay on back-office pages only", () => {
    expect(wantsReplay("/admin/events")).toBe(true)
    expect(wantsReplay("/videos")).toBe(false)
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
    expect(sentry.maybeStartReplay).toHaveBeenCalledWith("/admin/events")
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
    const real = rejection({ type: "TypeError", value: "Failed to fetch" })
    expect(isStacklessDomEventRejection(real)).toBe(false)
    expect(beforeSendClient(real)).toBe(real)
  })

  it("keeps it when it has a stack, or did not come from an unhandled rejection", () => {
    expect(isStacklessDomEventRejection(rejection({ stacktrace: { frames: [{ filename: "app.js" }] } }))).toBe(false)
    expect(isStacklessDomEventRejection(rejection({ mechanism: { type: "generic", handled: true } }))).toBe(false)
    expect(isStacklessDomEventRejection({ type: undefined } as ErrorEvent)).toBe(false)
  })
})

// Regression guards: what every public page downloads (#773).
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
