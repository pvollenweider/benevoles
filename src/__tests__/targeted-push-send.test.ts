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
  },
}))

const sub = (id: string) => ({ id, endpoint: `https://push/${id}`, auth: "a", p256dh: "p" })

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

  it("counts the devices of the recipients", async () => {
    m.count.mockResolvedValue(3)
    const { pushDeviceCount } = await import("@/lib/push")
    expect(await pushDeviceCount(["alice", "bob"])).toBe(3)
    expect(m.count).toHaveBeenCalledWith({ where: { volunteerId: { in: ["alice", "bob"] } } })
    expect(await pushDeviceCount([])).toBe(0)
  })
})
