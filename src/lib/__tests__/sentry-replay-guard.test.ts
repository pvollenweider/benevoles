import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// #1042: session replay never records an address that carries a token, including after a later
// navigation, and its own envelope is scrubbed.

const stop = vi.hoisted(() => vi.fn(async () => {}))
const addIntegration = vi.hoisted(() => vi.fn())
const on = vi.hoisted(() => vi.fn())
const createReplayIntegration = vi.hoisted(() => vi.fn((guard: () => boolean) => ({ name: "Replay", guard })))

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  addIntegration,
  getReplay: () => ({ stop }),
  getClient: () => ({ on }),
  captureException: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}))
vi.mock("@/lib/sentry-replay", () => ({ createReplayIntegration }))

const SECRET = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
const withToken = (path: string, param = "token") => `https://www.benevol.app${path}?${param}=${SECRET}`

async function freshInit(href: string) {
  vi.resetModules()
  vi.stubGlobal("window", { location: { href, pathname: new URL(href).pathname } })
  return import("../sentry-client-init")
}

function moveTo(href: string) {
  ;(window as unknown as { location: { href: string } }).location.href = href
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("session replay guard (#1042)", () => {
  beforeEach(() => {
    stop.mockClear()
    addIntegration.mockClear()
    on.mockClear()
    createReplayIntegration.mockClear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("starts replay on a signed-in back-office page and hooks the replay event scrubber", async () => {
    const mod = await freshInit("https://www.benevol.app/admin/events")
    mod.initSentryClient()
    await flush()
    expect(addIntegration).toHaveBeenCalledTimes(1)
    expect(on).toHaveBeenCalledWith("preprocessEvent", expect.any(Function))
  })

  it("never loads replay on a token page", async () => {
    for (const href of [withToken("/admin/reset-password"), withToken("/admin/accept-invite"), withToken("/admin/events")]) {
      const mod = await freshInit(href)
      mod.initSentryClient()
      await flush()
    }
    expect(createReplayIntegration).not.toHaveBeenCalled()
    expect(addIntegration).not.toHaveBeenCalled()
  })

  it("stops the running recorder, without flushing, before a navigation to a token address, and never restarts it", async () => {
    const mod = await freshInit("https://www.benevol.app/admin/events")
    mod.initSentryClient()
    await flush()
    mod.maybeStartReplay(withToken("/admin/keep"))
    expect(stop).toHaveBeenCalledWith({ flush: false })
    mod.maybeStartReplay("/admin/events")
    await flush()
    expect(addIntegration).toHaveBeenCalledTimes(1)
  })

  it("does not add the recorder when the address changed while its chunk was loading", async () => {
    const mod = await freshInit("https://www.benevol.app/admin/events")
    mod.initSentryClient()
    moveTo(withToken("/admin/events"))
    await flush()
    expect(addIntegration).not.toHaveBeenCalled()
  })

  it("drops recording frames once the address carries a token, even without a router transition", async () => {
    const mod = await freshInit("https://www.benevol.app/admin/events")
    mod.initSentryClient()
    await flush()
    const guard = createReplayIntegration.mock.calls[0][0]
    expect(guard()).toBe(true)
    moveTo(withToken("/admin/events", "t"))
    expect(guard()).toBe(false)
    await flush()
    expect(stop).toHaveBeenCalledWith({ flush: false })
  })
})
