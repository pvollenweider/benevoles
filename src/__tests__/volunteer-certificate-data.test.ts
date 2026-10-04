import { describe, it, expect, vi } from "vitest"
import { loadVolunteerHourData } from "@/lib/volunteer-certificate-data"

// Volunteer certificate (#556): read through the organisation-scoped client only, same
// cross-tenant discipline as loadMemberActivity.
const db = (member: object | null) => ({
  volunteer: { findFirst: vi.fn().mockResolvedValue(member) },
  registration: { findMany: vi.fn().mockResolvedValue([]) },
})

describe("loadVolunteerHourData", () => {
  it("returns nothing for a member of another organisation, reading no registration (cross-tenant)", async () => {
    const d = db(null)
    expect(await loadVolunteerHourData(d as never, "vol-b")).toBeNull()
    expect(d.registration.findMany).not.toHaveBeenCalled()
  })

  it("reads only the member's own active registrations, with the fields the counting rules need", async () => {
    const d = db({ id: "vol-a", firstName: "Julie", lastName: "M" })
    const out = await loadVolunteerHourData(d as never, "vol-a")
    expect(out?.member.firstName).toBe("Julie")
    expect(d.registration.findMany.mock.calls[0][0].where).toEqual({ volunteerId: "vol-a", status: "active" })
    const select = d.registration.findMany.mock.calls[0][0].select
    expect(select).toMatchObject({ id: true, status: true, checkedInAt: true })
    expect(select.shift.select).toMatchObject({ id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true })
    expect(select.event.select).toEqual({ id: true, title: true })
  })
})
