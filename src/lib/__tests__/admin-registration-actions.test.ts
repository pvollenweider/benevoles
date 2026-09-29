import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  logEvent: vi.fn(),
  sendNotification: vi.fn(),
  promoteNextInWaitlist: vi.fn(),
  tagVolunteerAsResponsable: vi.fn(),
}))
vi.mock("../event-log", () => ({ logEvent: m.logEvent }))
vi.mock("../notifications", () => ({ sendNotification: m.sendNotification }))
vi.mock("../notifications/outbox", () => ({ enqueueAndDeliver: (payloads: unknown[]) => { payloads.forEach((p) => m.sendNotification(p)); return Promise.resolve() } }))
vi.mock("../waitlist", () => ({ promoteNextInWaitlist: m.promoteNextInWaitlist }))
vi.mock("../sector-leaders", () => ({ tagVolunteerAsResponsable: m.tagVolunteerAsResponsable }))
vi.mock("../report-error", () => ({ reportError: () => () => {} }))

import { cancelRegistrations, resendManagementLinks, addSectorLeader } from "../admin-registration-actions"
import type { OrgScopedPrisma } from "../prisma-org"

const actor = { type: "admin" as const, id: "admin-1" }

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.logEvent.mockResolvedValue("log-1")
  m.promoteNextInWaitlist.mockResolvedValue(undefined)
  m.tagVolunteerAsResponsable.mockResolvedValue(undefined)
  m.sendNotification.mockResolvedValue({ ok: true })
})

describe("cancelRegistrations", () => {
  it("skips rows no longer live, reopens a full shift, one promotion per freed spot, in sequence", async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 }) // cancelled meanwhile
      .mockResolvedValueOnce({ count: 1 })
    const shiftUpdateMany = vi.fn()
    const db = {
      registration: { updateMany, count: vi.fn().mockResolvedValue(3) },
      shift: { findFirst: vi.fn().mockResolvedValue({ capacity: 5, status: "full" }), updateMany: shiftUpdateMany },
    } as unknown as OrgScopedPrisma
    const t = (id: string) => ({ id, eventId: "e1", shiftId: "s1", status: "active" })

    const ids = await cancelRegistrations(db, actor, [t("r1"), t("r2"), t("r3")])

    expect(ids).toEqual(["r1", "r3"])
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: { not: "cancelled" } }, data: { status: "cancelled" } })
    expect(m.logEvent).toHaveBeenCalledTimes(2)
    expect(shiftUpdateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "open" } })
    expect(m.promoteNextInWaitlist).toHaveBeenCalledTimes(2)
  })
})

describe("resendManagementLinks", () => {
  it("sends one email per volunteer and skips volunteers without email", async () => {
    const ev = { title: "F", organization: { slug: "a" } }
    const v = (id: string, email: string | null) => ({ id, firstName: "A", lastName: "B", email })
    const res = await resendManagementLinks([
      { editToken: "t1", volunteer: v("v1", "a@x.com"), event: ev },
      { editToken: "t2", volunteer: v("v1", "a@x.com"), event: ev },
      { editToken: "t3", volunteer: v("v2", null), event: ev },
    ])
    expect(m.sendNotification).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ sent: 1, failed: 0, skipped: 1 })
  })

  it("counts failures", async () => {
    m.sendNotification.mockResolvedValue({ ok: false })
    const res = await resendManagementLinks([
      { editToken: "t1", volunteer: { id: "v1", firstName: "A", lastName: "B", email: "a@x.com" }, event: { title: "F", organization: { slug: "a" } } },
    ])
    expect(res).toEqual({ sent: 0, failed: 1, skipped: 0 })
  })
})

describe("addSectorLeader", () => {
  const ctx = { organizationId: "org-a", actor, event: { id: "e1", title: "F", organization: { slug: "a" } } }

  it("reports an existing leader without creating or emailing", async () => {
    const create = vi.fn()
    const db = { sectorLeader: { findFirst: vi.fn().mockResolvedValue({ id: "l1" }), create } } as unknown as OrgScopedPrisma
    expect((await addSectorLeader(db, ctx, { roleName: "Bar", name: "A", email: "a@x.com" })).status).toBe("exists")
    expect(create).not.toHaveBeenCalled()
    expect(m.sendNotification).not.toHaveBeenCalled()
  })

  it("creates, logs, tags and emails a new leader", async () => {
    const leader = { id: "l2", roleName: "Bar", name: "A", email: "a@x.com", token: "tok" }
    const db = { sectorLeader: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(leader) } } as unknown as OrgScopedPrisma
    expect((await addSectorLeader(db, ctx, { roleName: "Bar", name: "A", email: "a@x.com" })).status).toBe("created")
    expect(m.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "sectorleader.added" }))
    expect(m.tagVolunteerAsResponsable).toHaveBeenCalledWith("org-a", "a@x.com")
    expect(m.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ kind: "sector_leader_invite" }))
  })
})
