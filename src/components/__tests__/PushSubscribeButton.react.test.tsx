/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import PushSubscribeButton from "../PushSubscribeButton"

// Accessibility of the push reminder button (#271): outcome announced through a status region
// that is mounted from the start, focus moved to it when the button disappears, decorative
// icons hidden from assistive technology.

function mockPushEnvironment({ existing = null as unknown, permission = "granted" } = {}) {
  const sub = { toJSON: () => ({ endpoint: "https://push.example/1", keys: { auth: "a", p256dh: "p" } }) }
  const reg = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe: vi.fn().mockResolvedValue(sub),
    },
  }
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(reg), register: vi.fn().mockResolvedValue(reg) },
  })
  ;(window as unknown as { PushManager: unknown }).PushManager = function PushManager() {}
  ;(window as unknown as { Notification: unknown }).Notification = { requestPermission: vi.fn().mockResolvedValue(permission) }
  vi.stubGlobal("Notification", (window as unknown as { Notification: unknown }).Notification)
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ publicKey: "AAAA" }) }))
}

describe("PushSubscribeButton — accessibility (#271)", () => {
  beforeEach(() => mockPushEnvironment())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders an empty status region from the start, and hides the decorative bell icon", () => {
    const { container } = render(<PushSubscribeButton editToken="tok" />)
    expect(screen.getByRole("status")).toHaveProperty("textContent", "")
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("announces success in the status region and moves focus there when the button goes away", async () => {
    render(<PushSubscribeButton editToken="tok" />)
    const button = screen.getByRole("button", { name: /Recevoir des rappels push/ })
    button.focus()
    fireEvent.click(button)

    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toContain("Rappels push activés"))
    expect(screen.queryByRole("button")).toBeNull()
    expect(document.activeElement).toBe(status)
    expect(status.querySelector("span")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("announces a denied permission the same way", async () => {
    mockPushEnvironment({ permission: "denied" })
    render(<PushSubscribeButton editToken="tok" />)
    fireEvent.click(screen.getByRole("button"))

    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toContain("Notifications bloquées"))
    expect(document.activeElement).toBe(status)
  })

  it("doesn't steal focus on load when the browser is already subscribed", async () => {
    mockPushEnvironment({ existing: { toJSON: () => ({ endpoint: "e", keys: { auth: "a", p256dh: "p" } }) } })
    render(<PushSubscribeButton editToken="tok" />)
    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toContain("Rappels push activés"))
    expect(document.activeElement).not.toBe(status)
  })
})
