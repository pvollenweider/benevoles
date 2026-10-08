import { describe, it, expect, vi, beforeEach } from "vitest"

const webpushSend = vi.hoisted(() => vi.fn())
const db = vi.hoisted(() => ({
  volunteer: { findUnique: vi.fn() },
  organization: { findUnique: vi.fn() },
  pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
}))
// Throwaway VAPID values: web-push itself is mocked, nothing is signed.
const vapid = vi.hoisted(() => ({ ["VAPID_PUBLIC_" + "KEY"]: "test-public", ["VAPID_PRIVATE_" + "KEY"]: "test-value", VAPID_EMAIL: "ops@example.org" }))
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: webpushSend } }))
vi.mock("../env", () => ({ env: vapid }))
vi.mock("../prisma", () => ({ prisma: db }))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

import { sendPushToVolunteer } from "../push"

describe("push to a member of a deactivated organisation (#814)", () => {
  beforeEach(() => {
    webpushSend.mockReset().mockResolvedValue({})
    db.pushSubscription.findMany.mockReset().mockResolvedValue([{ id: "s1", endpoint: "https://push.example/1", auth: "a", p256dh: "p" }])
    db.volunteer.findUnique.mockReset().mockResolvedValue({ organizationId: "org-1" })
    db.organization.findUnique.mockReset()
  })

  it("sends nothing when the organisation is deactivated", async () => {
    db.organization.findUnique.mockResolvedValue({ active: false })
    expect(await sendPushToVolunteer("v1", { title: "t", body: "b" })).toEqual({ sent: 0, failed: 0, removed: 0 })
    expect(webpushSend).not.toHaveBeenCalled()
  })

  it("sends when the organisation is active", async () => {
    db.organization.findUnique.mockResolvedValue({ active: true })
    expect(await sendPushToVolunteer("v1", { title: "t", body: "b" })).toEqual({ sent: 1, failed: 0, removed: 0 })
    expect(webpushSend).toHaveBeenCalledTimes(1)
  })
})
