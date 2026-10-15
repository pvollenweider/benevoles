import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// The organisers' email of a change of answers (#984): one grouped item per admin, merged per
// volunteer, gated by the « à chaque inscription » setting.

const orgFindUnique = vi.hoisted(() => vi.fn())
const adminFindMany = vi.hoisted(() => vi.fn())
const queueDigestItem = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { organization: { findUnique: orgFindUnique }, adminUser: { findMany: adminFindMany } } }))
vi.mock("../notifications/digest", () => ({ queueDigestItem, digestDelayMs: (ms: number) => ms }))

import { queueAnswerChangeNotifications } from "../answer-change-notifications"
import { mergeAnswerChangeItems } from "../answer-changes"

const input = {
  event: { id: "e1", title: "Fête", organizationId: "org-1" },
  volunteerId: "v1",
  volunteerName: "Julie Martin",
  changes: [{ questionId: "meal", label: "Repas ?", from: ["Oui"], to: ["Non"] }],
  changeId: "c-1",
}
const now = new Date("2026-06-04T08:00:00Z")

describe("queueAnswerChangeNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgFindUnique.mockResolvedValue({ notificationSettings: null })
    adminFindMany.mockResolvedValue([{ email: "A@org.ch", name: "Anne" }, { email: "b@org.ch", name: "Bob" }])
    queueDigestItem.mockResolvedValue(null)
  })
  afterEach(() => vi.unstubAllEnvs())

  it("queues one item per active admin of the organisation, grouped per event and address, merged per volunteer", async () => {
    await queueAnswerChangeNotifications(input, now)
    expect(adminFindMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", isActive: true }, select: { email: true, name: true } })
    expect(queueDigestItem).toHaveBeenCalledTimes(2)
    expect(queueDigestItem.mock.calls[0][0]).toMatchObject({
      kind: "answers_changed",
      groupKey: "answers_changed:e1:a@org.ch",
      recipient: { email: "A@org.ch", name: "Anne" },
      organizationId: "org-1",
      base: { eventId: "e1", eventTitle: "Fête" },
      item: { volunteerName: "Julie Martin", changes: [{ questionId: "meal", label: "Repas ?", from: "Oui", to: "Non" }] },
      itemKey: "c-1",
      merge: { key: "volunteer:v1", combine: mergeAnswerChangeItems },
      now,
      delayMs: 5 * 60 * 1000,
    })
  })

  it("returns the rows due at once (no delay), for an immediate delivery", async () => {
    queueDigestItem.mockResolvedValueOnce("row-1").mockResolvedValueOnce(null)
    expect(await queueAnswerChangeNotifications(input, now)).toEqual(["row-1"])
  })

  it("nothing when the organisation turned off the email at each sign-up", async () => {
    orgFindUnique.mockResolvedValue({ notificationSettings: { signupAdminEmail: false } })
    expect(await queueAnswerChangeNotifications(input, now)).toEqual([])
    expect(queueDigestItem).not.toHaveBeenCalled()
  })

  it("the platform's fallback address only when the organisation has no active admin", async () => {
    vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "fallback@x.ch")
    adminFindMany.mockResolvedValue([])
    await queueAnswerChangeNotifications(input, now)
    expect(queueDigestItem).toHaveBeenCalledTimes(1)
    expect(queueDigestItem.mock.calls[0][0].recipient).toEqual({ email: "fallback@x.ch", name: "Admin" })
  })

  it("nothing to say, nothing read", async () => {
    expect(await queueAnswerChangeNotifications({ ...input, changes: [] }, now)).toEqual([])
    expect(orgFindUnique).not.toHaveBeenCalled()
  })
})
