import { describe, it, expect, vi } from "vitest"
import { loadMemberActivity } from "@/lib/member-activity-data"

// Member activity (#488): read through the organisation-scoped client only.
const db = (member: object | null) => ({
  volunteer: { findFirst: vi.fn().mockResolvedValue(member) },
  memberInvite: { findMany: vi.fn().mockResolvedValue([]) },
  registration: { findMany: vi.fn().mockResolvedValue([]) },
  sectorLeader: { findMany: vi.fn().mockResolvedValue([]) },
  orgLog: { findMany: vi.fn().mockResolvedValue([]) },
})

describe("loadMemberActivity", () => {
  it("returns nothing for a member of another organisation, reading no fact", async () => {
    const d = db(null)
    expect(await loadMemberActivity(d as never, "vol-b")).toBeNull()
    expect(d.registration.findMany).not.toHaveBeenCalled()
    expect(d.memberInvite.findMany).not.toHaveBeenCalled()
  })

  it("reads the member's own facts, sector leaders by email case-insensitively, org log entries of this member", async () => {
    const d = db({ id: "vol-a", firstName: "Julie", lastName: "M", email: "julie@x.ch", active: true })
    const out = await loadMemberActivity(d as never, "vol-a")
    expect(out?.member.firstName).toBe("Julie")
    expect(d.registration.findMany.mock.calls[0][0].where).toEqual({ volunteerId: "vol-a" })
    expect(d.memberInvite.findMany.mock.calls[0][0].where).toEqual({ volunteerId: "vol-a" })
    expect(d.sectorLeader.findMany.mock.calls[0][0].where).toEqual({ email: { equals: "julie@x.ch", mode: "insensitive" } })
    expect(d.orgLog.findMany.mock.calls[0][0].where).toEqual({ entityType: "Member", entityId: "vol-a" })
  })

  it("skips sector leaders for a member without email", async () => {
    const d = db({ id: "vol-a", firstName: "J", lastName: "M", email: null, active: true })
    await loadMemberActivity(d as never, "vol-a")
    expect(d.sectorLeader.findMany).not.toHaveBeenCalled()
  })
})
