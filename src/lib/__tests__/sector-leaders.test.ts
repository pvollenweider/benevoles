import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { sectorLeader: { findMany } } }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("../notifications", () => ({ sendNotification: sendNotificationMock }))

import { notifySectorLeadersOfSignup } from "../sector-leaders"

describe("notifySectorLeadersOfSignup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendNotificationMock.mockResolvedValue({ ok: true })
  })

  it("does nothing when the role has no leader", async () => {
    findMany.mockResolvedValue([])
    await notifySectorLeadersOfSignup({
      eventId: "evt-1",
      eventTitle: "Festival",
      orgSlug: "org-a",
      volunteerName: "Bob L",
      shift: { roleName: "Bar", label: "Bar", date: new Date("2026-06-01"), startTime: "18:00", endTime: "22:00" },
    })
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it("notifies every leader of that role", async () => {
    findMany.mockResolvedValue([
      { id: "l1", roleName: "Bar", name: "Alice", email: "a@x.com", token: "tok-a" },
      { id: "l2", roleName: "Bar", name: "Zoe", email: "z@x.com", token: "tok-z" },
    ])
    await notifySectorLeadersOfSignup({
      eventId: "evt-1",
      eventTitle: "Festival",
      orgSlug: "org-a",
      volunteerName: "Bob L",
      shift: { roleName: "Bar", label: "Bar", date: new Date("2026-06-01"), startTime: "18:00", endTime: "22:00" },
    })
    expect(sendNotificationMock).toHaveBeenCalledTimes(2)
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sector_leader_new_signup",
        recipient: { email: "a@x.com", name: "Alice" },
        data: expect.objectContaining({ roleName: "Bar", volunteerName: "Bob L", token: "tok-a" }),
      }),
    )
  })

  it("swallows a send failure for one leader without throwing", async () => {
    findMany.mockResolvedValue([{ id: "l1", roleName: "Bar", name: "Alice", email: "a@x.com", token: "tok-a" }])
    sendNotificationMock.mockRejectedValue(new Error("smtp down"))
    await expect(
      notifySectorLeadersOfSignup({
        eventId: "evt-1",
        eventTitle: "Festival",
        orgSlug: "org-a",
        volunteerName: "Bob L",
        shift: { roleName: "Bar", label: "Bar", date: new Date("2026-06-01"), startTime: "18:00", endTime: "22:00" },
      }),
    ).resolves.toBeUndefined()
  })
})
