import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const server = vi.hoisted(() => ({ createSignupRequest: vi.fn(), confirmSignupRequest: vi.fn(), signupRequestState: vi.fn(), signupBlocked: vi.fn() }))
const limiter = vi.hoisted(() => ({ ok: true }))
vi.mock("@/lib/signup-server", () => server)
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ ok: limiter.ok, remaining: 1, retryAfter: 0 })), getClientIp: () => "203.0.113.1" }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
// The operator's switch (#810), stored as a platform setting: open unless a test closes it.
const setting = vi.hoisted(() => ({ value: null as null | { closed: boolean } }))
vi.mock("@/lib/prisma", () => ({ prisma: { platformSetting: { findUnique: vi.fn(async () => (setting.value ? { value: setting.value } : null)) } } }))

import { DESCRIPTION_SHORT_MESSAGE, SIGNUP_ACCEPTED_MESSAGE, SIGNUP_CLOSED_MESSAGE, SIGNUP_MIN_FILL_MS } from "@/lib/signup"

const post = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const form = (over: object = {}) => ({ organizationName: "Fête du village", contactName: "Camille", email: "camille@example.org", description: "Fête de village, une centaine de bénévoles sur deux jours.", website: "", startedAt: Date.now() - SIGNUP_MIN_FILL_MS - 1000, ...over })

describe("POST /api/public/signup (#810, part 4b)", () => {
  beforeEach(() => {
    server.createSignupRequest.mockReset().mockResolvedValue({ queued: true })
    server.signupBlocked.mockReset().mockResolvedValue(false)
    limiter.ok = true
  })

  // #810, part 5: a blocked sign-up gets the same answer, nothing stored.
  it("answers the same and stores nothing when the block list stops the sign-up", async () => {
    server.signupBlocked.mockResolvedValueOnce(true)
    const { POST } = await import("@/app/api/public/signup/route")
    const res = await POST(post("http://localhost/api/public/signup", form()))
    expect(res.status).toBe(202)
    expect((await res.json()).message).toBe(SIGNUP_ACCEPTED_MESSAGE)
    expect(server.signupBlocked).toHaveBeenCalledWith("camille@example.org", "203.0.113.1")
    expect(server.createSignupRequest).not.toHaveBeenCalled()
  })
  afterEach(() => { delete process.env.SIGNUP; setting.value = null })

  it("stores the request and gives the one answer", async () => {
    const { POST } = await import("@/app/api/public/signup/route")
    const res = await POST(post("http://localhost/api/public/signup", form()))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true, message: SIGNUP_ACCEPTED_MESSAGE })
    expect(server.createSignupRequest).toHaveBeenCalledWith(expect.objectContaining({ organizationName: "Fête du village", email: "camille@example.org" }))
  })

  it("answers the same, storing nothing, for a script, a known address or too many requests", async () => {
    const { POST } = await import("@/app/api/public/signup/route")
    for (const body of [form({ website: "http://spam" }), form({ startedAt: Date.now() })]) {
      const res = await POST(post("http://localhost/api/public/signup", body))
      expect(res.status).toBe(202)
      expect((await res.json()).message).toBe(SIGNUP_ACCEPTED_MESSAGE)
    }
    limiter.ok = false
    expect((await POST(post("http://localhost/api/public/signup", form()))).status).toBe(202)
    expect(server.createSignupRequest).not.toHaveBeenCalled()
    // A known address: createSignupRequest queues nothing, the answer does not change.
    limiter.ok = true
    server.createSignupRequest.mockResolvedValueOnce({ queued: false })
    expect((await (await POST(post("http://localhost/api/public/signup", form()))).json()).message).toBe(SIGNUP_ACCEPTED_MESSAGE)
  })

  it("tells a malformed field, and is closed by SIGNUP=off", async () => {
    const { POST } = await import("@/app/api/public/signup/route")
    const bad = await POST(post("http://localhost/api/public/signup", form({ email: "camille" })))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: "Indiquez une adresse email valide, par exemple nom@exemple.org.", field: "email" })
    const short = await POST(post("http://localhost/api/public/signup", form({ description: "Une fête." })))
    expect(await short.json()).toEqual({ error: DESCRIPTION_SHORT_MESSAGE, field: "description" })
    expect(server.createSignupRequest).not.toHaveBeenCalled()
    process.env.SIGNUP = "off"
    const closed = await POST(post("http://localhost/api/public/signup", form()))
    expect(closed.status).toBe(403)
    expect((await closed.json()).error).toBe(SIGNUP_CLOSED_MESSAGE)
    // The super admin's switch closes it too, without a deploy.
    delete process.env.SIGNUP
    setting.value = { closed: true }
    expect((await POST(post("http://localhost/api/public/signup", form()))).status).toBe(403)
    expect(server.createSignupRequest).not.toHaveBeenCalled()
  })
})

describe("POST /api/public/signup/confirm (#810, part 4b)", () => {
  beforeEach(() => {
    server.confirmSignupRequest.mockReset()
    limiter.ok = true
  })
  afterEach(() => { delete process.env.SIGNUP; setting.value = null })

  it("confirms with the button and hands back the account activation link", async () => {
    server.confirmSignupRequest.mockResolvedValue({ ok: true, inviteUrl: "http://localhost/admin/accept-invite?token=x", organizationSlug: "fete" })
    const { POST } = await import("@/app/api/public/signup/confirm/route")
    const res = await POST(post("http://localhost/api/public/signup/confirm", { token: "abc" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, inviteUrl: "http://localhost/admin/accept-invite?token=x" })
  })

  it("explains an unknown, expired, used or taken request, and refuses without a link or when closed", async () => {
    const { POST } = await import("@/app/api/public/signup/confirm/route")
    for (const [reason, status] of [["unknown", 404], ["expired", 409], ["used", 409], ["taken", 409]] as const) {
      server.confirmSignupRequest.mockResolvedValueOnce({ ok: false, reason })
      const res = await POST(post("http://localhost/api/public/signup/confirm", { token: "abc" }))
      expect(res.status).toBe(status)
      expect((await res.json()).code).toBe(reason)
    }
    expect((await POST(post("http://localhost/api/public/signup/confirm", {}))).status).toBe(400)
    process.env.SIGNUP = "off"
    expect((await POST(post("http://localhost/api/public/signup/confirm", { token: "abc" }))).status).toBe(403)
  })
})
