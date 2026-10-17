import { describe, it, expect, vi, beforeEach } from "vitest"

// Push sending (#468): one per device, gone subscriptions removed, outcomes counted on the message.
const m = vi.hoisted(() => ({
  send: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  count: vi.fn(),
  update: vi.fn().mockResolvedValue({}),
}))
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: m.send } }))
// Test-only placeholder values for the VAPID pair.
vi.mock("@/lib/env", () => ({ env: { VAPID_PUBLIC_KEY: "test-public", ["VAPID_" + "PRIVATE_KEY"]: "test-value", VAPID_EMAIL: "a@b.c" } }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: { findMany: m.findMany, deleteMany: m.deleteMany, count: m.count },
    targetedMessage: { update: m.update },
    // The organisation check of every push (#814): an active one.
    volunteer: { findUnique: vi.fn().mockResolvedValue({ organizationId: "org-1" }) },
    organization: { findUnique: vi.fn().mockResolvedValue({ active: true, outboundEmailApprovedAt: new Date("2026-01-01T00:00:00Z"), admins: [] }) },
  },
}))

const sub = (id: string) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, auth: "a", p256dh: "p" })

describe("sendTargetedPush", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends one notification per device with each recipient's own link, removes gone ones, counts outcomes", async () => {
    m.findMany.mockImplementation(async ({ where }: { where: { volunteerId: string } }) =>
      where.volunteerId === "alice" ? [sub("a1"), sub("a2")] : [sub("b1")])
    m.send.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("a2")) throw Object.assign(new Error("gone"), { statusCode: 410 })
    })
    const { sendTargetedPush } = await import("@/lib/push")
    const outcome = await sendTargetedPush("msg-1", [{ volunteerId: "alice", url: "/my/tok-a" }, { volunteerId: "bob", url: "/my/tok-b" }], { title: "T", body: "B", tag: "message-msg-1" })
    expect(outcome).toEqual({ sent: 2, failed: 1, removed: 1 })
    expect(m.send).toHaveBeenCalledTimes(3)
    const payloads = m.send.mock.calls.map((c) => JSON.parse(c[1]))
    expect(payloads.filter((p) => p.url === "/my/tok-a")).toHaveLength(2)
    expect(payloads.filter((p) => p.url === "/my/tok-b")).toHaveLength(1)
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a2"] } } })
    expect(m.update).toHaveBeenCalledWith({ where: { id: "msg-1" }, data: { pushSent: { increment: 2 }, pushFailed: { increment: 1 } } })
  })

  // #1041: rows stored before the endpoint check are never contacted; they count as failed (so the
  // message history adds up) and stay stored.
  it("never contacts stored endpoints outside the Web Push services", async () => {
    m.findMany.mockResolvedValue([
      sub("ok"),
      { id: "bad-host", endpoint: "https://push.example.com/x", auth: "a", p256dh: "p" },
      { id: "bad-port", endpoint: "https://fcm.googleapis.com:8443/x", auth: "a", p256dh: "p" },
    ])
    m.send.mockResolvedValue({})
    const { sendPushToVolunteer } = await import("@/lib/push")
    expect(await sendPushToVolunteer("alice", { title: "T", body: "B" })).toEqual({ sent: 1, failed: 2, removed: 0 })
    expect(m.send).toHaveBeenCalledTimes(1)
    expect(m.send.mock.calls[0][0].endpoint).toBe("https://fcm.googleapis.com/fcm/send/ok")
    expect(m.deleteMany).not.toHaveBeenCalled()
  })

  it("hands web-push a finite timeout", async () => {
    m.findMany.mockResolvedValue([sub("a1")])
    m.send.mockResolvedValue({})
    const { sendPushToVolunteer, PUSH_SEND_TIMEOUT_MS } = await import("@/lib/push")
    await sendPushToVolunteer("alice", { title: "T", body: "B" })
    expect(PUSH_SEND_TIMEOUT_MS).toBe(10_000)
    expect(m.send.mock.calls[0][2]).toEqual({ TTL: 3 * 24 * 3600, timeout: 10_000 })
  })

  it("gives up on a send that never settles and counts it failed", async () => {
    vi.useFakeTimers()
    try {
      m.findMany.mockResolvedValue([sub("slow"), sub("fast")])
      m.send.mockImplementation((s: { endpoint: string }) => s.endpoint.endsWith("slow") ? new Promise(() => {}) : Promise.resolve({}))
      const { sendPushToVolunteer, PUSH_SEND_DEADLINE_MS } = await import("@/lib/push")
      const pending = sendPushToVolunteer("alice", { title: "T", body: "B" })
      await vi.advanceTimersByTimeAsync(PUSH_SEND_DEADLINE_MS + 1)
      expect(await pending).toEqual({ sent: 1, failed: 1, removed: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it("sends to every recipient of a large message, a few at a time", async () => {
    m.findMany.mockImplementation(async ({ where }: { where: { volunteerId: string } }) => [sub(where.volunteerId)])
    let inFlight = 0
    let peak = 0
    m.send.mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
    })
    const { sendTargetedPush } = await import("@/lib/push")
    const targets = Array.from({ length: 12 }, (_, i) => ({ volunteerId: `v${i}`, url: `/my/t${i}` }))
    expect(await sendTargetedPush("msg-2", targets, { title: "T", body: "B", tag: "x" })).toEqual({ sent: 12, failed: 0, removed: 0 })
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(5)
  })

  it("counts the devices of the recipients", async () => {
    m.count.mockResolvedValue(3)
    const { pushDeviceCount } = await import("@/lib/push")
    expect(await pushDeviceCount(["alice", "bob"])).toBe(3)
    expect(m.count).toHaveBeenCalledWith({ where: { volunteerId: { in: ["alice", "bob"] } } })
    expect(await pushDeviceCount([])).toBe(0)
  })
})
