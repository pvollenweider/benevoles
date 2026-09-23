import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.hoisted(() => vi.fn())
const sectorLeaderFindFirst = vi.hoisted(() => vi.fn())
const volunteerFindFirst = vi.hoisted(() => vi.fn())
const volunteerUpdate = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({
  prisma: {
    sectorLeader: { findMany, findFirst: sectorLeaderFindFirst },
    volunteer: { findFirst: volunteerFindFirst, update: volunteerUpdate },
  },
}))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("../notifications", () => ({ sendNotification: sendNotificationMock }))

import { notifySectorLeadersOfSignup, tagVolunteerAsResponsable, untagVolunteerIfNoLongerResponsable } from "../sector-leaders"

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

describe("tagVolunteerAsResponsable", () => {
  beforeEach(() => vi.clearAllMocks())

  it("adds the tag when the volunteer exists and doesn't have it yet", async () => {
    volunteerFindFirst.mockResolvedValue({ id: "vol-1", tags: ["cuisine"] })
    await tagVolunteerAsResponsable("org-a", "a@x.com")
    expect(volunteerFindFirst).toHaveBeenCalledWith({ where: { organizationId: "org-a", email: "a@x.com" } })
    expect(volunteerUpdate).toHaveBeenCalledWith({ where: { id: "vol-1" }, data: { tags: { push: "responsable" } } })
  })

  it("does nothing when the tag is already there", async () => {
    volunteerFindFirst.mockResolvedValue({ id: "vol-1", tags: ["responsable"] })
    await tagVolunteerAsResponsable("org-a", "a@x.com")
    expect(volunteerUpdate).not.toHaveBeenCalled()
  })

  it("does nothing when no volunteer matches (manual email not yet a member)", async () => {
    volunteerFindFirst.mockResolvedValue(null)
    await tagVolunteerAsResponsable("org-a", "unknown@x.com")
    expect(volunteerUpdate).not.toHaveBeenCalled()
  })
})

describe("untagVolunteerIfNoLongerResponsable", () => {
  beforeEach(() => vi.clearAllMocks())

  it("removes the tag when the volunteer has no remaining sector-leader role in the org", async () => {
    sectorLeaderFindFirst.mockResolvedValue(null)
    volunteerFindFirst.mockResolvedValue({ id: "vol-1", tags: ["responsable", "cuisine"] })
    await untagVolunteerIfNoLongerResponsable("org-a", "a@x.com")
    expect(sectorLeaderFindFirst).toHaveBeenCalledWith({ where: { email: "a@x.com", event: { organizationId: "org-a" } } })
    expect(volunteerUpdate).toHaveBeenCalledWith({ where: { id: "vol-1" }, data: { tags: ["cuisine"] } })
  })

  it("keeps the tag when the volunteer still leads another role/event", async () => {
    sectorLeaderFindFirst.mockResolvedValue({ id: "l2" })
    await untagVolunteerIfNoLongerResponsable("org-a", "a@x.com")
    expect(volunteerFindFirst).not.toHaveBeenCalled()
    expect(volunteerUpdate).not.toHaveBeenCalled()
  })

  it("does nothing when the volunteer doesn't have the tag", async () => {
    sectorLeaderFindFirst.mockResolvedValue(null)
    volunteerFindFirst.mockResolvedValue({ id: "vol-1", tags: ["cuisine"] })
    await untagVolunteerIfNoLongerResponsable("org-a", "a@x.com")
    expect(volunteerUpdate).not.toHaveBeenCalled()
  })
})
