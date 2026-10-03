/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react"
import PushSubscribeButton from "../PushSubscribeButton"

// Accessibility of the push reminder button (#271): outcome announced through a status region
// that is mounted from the start, focus moved to it when the button disappears, decorative
// icons hidden from assistive technology.

type FetchAnswer = { ok: boolean; status?: number; json: () => Promise<unknown> }

/**
 * Browser with service worker and Push API. `keyAnswer` answers GET /api/public/push (a pending
 * promise keeps the button in "checking"); `saveAnswer` answers the POST.
 */
function mockPushEnvironment({
  existing = null as unknown,
  permission = "granted",
  keyAnswer = Promise.resolve({ ok: true, json: async () => ({ publicKey: "AAAA" }) }) as Promise<FetchAnswer>,
  saveAnswer = () => Promise.resolve({ ok: true, json: async () => ({ ok: true }) }) as Promise<FetchAnswer>,
  registered = true,
} = {}) {
  const sub = { toJSON: () => ({ endpoint: "https://push.example/1", keys: { auth: "a", p256dh: "p" } }) }
  const reg = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe: vi.fn().mockResolvedValue(sub),
    },
  }
  const register = vi.fn().mockResolvedValue(reg)
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(reg), getRegistration: vi.fn().mockResolvedValue(registered ? reg : undefined), register },
  })
  ;(window as unknown as { PushManager: unknown }).PushManager = function PushManager() {}
  ;(window as unknown as { Notification: unknown }).Notification = { requestPermission: vi.fn().mockResolvedValue(permission) }
  vi.stubGlobal("Notification", (window as unknown as { Notification: unknown }).Notification)
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => (init?.method === "POST" ? saveAnswer() : keyAnswer))
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, register, reg }
}

describe("PushSubscribeButton — accessibility (#271)", () => {
  beforeEach(() => mockPushEnvironment())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders an empty status region from the start, and hides the decorative bell icon", async () => {
    const { container } = render(<PushSubscribeButton editToken="tok" />)
    expect(screen.getByRole("status")).toHaveProperty("textContent", "")
    await screen.findByRole("button", { name: /Recevoir des rappels push/ })
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("announces success in the status region and moves focus there when the button goes away", async () => {
    render(<PushSubscribeButton editToken="tok" />)
    const button = await screen.findByRole("button", { name: /Recevoir des rappels push/ })
    button.focus()
    fireEvent.click(button)

    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toContain("Rappels push activés"))
    expect(screen.queryByRole("button")).toBeNull()
    // Focus moves in an effect after the render that shows the text: wait for it too.
    await waitFor(() => expect(document.activeElement).toBe(status))
    expect(status.querySelector("span")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("announces a denied permission the same way", async () => {
    mockPushEnvironment({ permission: "denied" })
    render(<PushSubscribeButton editToken="tok" />)
    fireEvent.click(await screen.findByRole("button"))

    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toContain("Notifications bloquées"))
    // Focus moves in an effect after the render that shows the text: wait for it too.
    await waitFor(() => expect(document.activeElement).toBe(status))
  })

  it("doesn't steal focus on load when the browser is already subscribed", async () => {
    mockPushEnvironment({ existing: { toJSON: () => ({ endpoint: "e", keys: { auth: "a", p256dh: "p" } }) } })
    render(<PushSubscribeButton editToken="tok" />)
    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toContain("Rappels push activés"))
    expect(document.activeElement).not.toBe(status)
  })

  it("never shows the button while an existing subscription is being relinked", async () => {
    let accept!: (v: FetchAnswer) => void
    mockPushEnvironment({
      existing: { toJSON: () => ({ endpoint: "e", keys: { auth: "a", p256dh: "p" } }) },
      saveAnswer: () => new Promise<FetchAnswer>((r) => { accept = r }),
    })
    render(<PushSubscribeButton editToken="tok" />)
    await waitFor(() => expect(accept).toBeDefined())
    expect(screen.queryByRole("button")).toBeNull()
    await act(async () => accept({ ok: true, json: async () => ({ ok: true }) }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Rappels push activés"))
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("offers the button when no service worker is registered yet", async () => {
    mockPushEnvironment({ registered: false })
    render(<PushSubscribeButton editToken="tok" />)
    expect(await screen.findByRole("button", { name: /rappels/i })).toBeTruthy()
  })
})

// Without VAPID keys, and when subscribing fails (#534).
describe("PushSubscribeButton — availability and failure (#534)", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows no button while the server's key is being checked, only the empty status region", () => {
    mockPushEnvironment({ keyAnswer: new Promise<FetchAnswer>(() => {}) })
    render(<PushSubscribeButton editToken="tok" />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByRole("status")).toHaveProperty("textContent", "")
  })

  it("renders nothing when the server has no key, and never registers the service worker", async () => {
    const { fetchMock, register } = mockPushEnvironment({ keyAnswer: Promise.resolve({ ok: true, json: async () => ({ publicKey: null }) }) })
    const { container } = render(<PushSubscribeButton editToken="tok" />)
    await waitFor(() => expect(container.innerHTML).toBe(""))
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/api/public/push"])
    expect(screen.queryByRole("button")).toBeNull()
    expect(register).not.toHaveBeenCalled()
  })

  it("a press with no key found says push is unavailable and moves focus to the status", async () => {
    // The key couldn't be read on load (network): the button is offered, the press reads it again.
    let calls = 0
    const { fetchMock, register } = mockPushEnvironment()
    fetchMock.mockImplementation(() => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ ok: true, json: async () => ({ publicKey: null }) })
    })
    render(<PushSubscribeButton editToken="tok" />)
    const button = await screen.findByRole("button", { name: /Recevoir des rappels push/ })
    button.focus()
    fireEvent.click(button)

    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toBe("Les rappels push ne sont pas disponibles pour le moment."))
    expect(screen.queryByRole("button")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(status))
    expect(register).not.toHaveBeenCalled()
  })

  it("on failure the button stays, keeps the focus, is aria-disabled while loading, and the status says so", async () => {
    const save: { answer?: (a: FetchAnswer) => void } = {}
    mockPushEnvironment({ saveAnswer: () => new Promise<FetchAnswer>((r) => { save.answer = r }) })
    render(<PushSubscribeButton editToken="tok" />)
    const button = await screen.findByRole("button", { name: /Recevoir des rappels push/ })
    button.focus()
    fireEvent.click(button)

    await waitFor(() => expect(button.getAttribute("aria-disabled")).toBe("true"))
    expect(button.hasAttribute("disabled")).toBe(false)
    expect(document.activeElement).toBe(button)

    // Refused by the server, e.g. a token that isn't an active registration's.
    await waitFor(() => expect(save.answer).toBeDefined())
    save.answer?.({ ok: false, status: 404, json: async () => ({ error: "Inscription introuvable" }) })
    const status = screen.getByRole("status")
    await waitFor(() => expect(status.textContent).toBe("Les rappels n'ont pas pu être activés. Réessaie dans un moment."))
    expect(screen.getByRole("button", { name: /Recevoir des rappels push/ })).toBe(button)
    expect(button.hasAttribute("aria-disabled")).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it("a second press while loading sends nothing more", async () => {
    const { fetchMock } = mockPushEnvironment({ saveAnswer: () => new Promise<FetchAnswer>(() => {}) })
    render(<PushSubscribeButton editToken="tok" />)
    const button = await screen.findByRole("button", { name: /Recevoir des rappels push/ })
    const posts = () => fetchMock.mock.calls.filter((c) => c[1]?.method === "POST").length
    fireEvent.click(button)
    await waitFor(() => expect(posts()).toBe(1))
    fireEvent.click(button)
    fireEvent.click(button)
    await new Promise((r) => setTimeout(r, 20))
    expect(posts()).toBe(1)
  })

  it("an existing subscription the server refuses on load is not said to be active", async () => {
    mockPushEnvironment({
      existing: { toJSON: () => ({ endpoint: "e", keys: { auth: "a", p256dh: "p" } }) },
      saveAnswer: () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }),
    })
    render(<PushSubscribeButton editToken="tok" />)
    await screen.findByRole("button", { name: /Recevoir des rappels push/ })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByRole("status").textContent).toBe("")
    expect(screen.getByRole("button", { name: /Recevoir des rappels push/ })).toBeTruthy()
  })
})
