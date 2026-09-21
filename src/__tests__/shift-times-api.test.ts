import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const create = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { shift: { create, update: vi.fn() } } }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))

const validShift = {
  eventId: "evt-a",
  roleName: "Caisse",
  label: "Caisse",
  date: "2026-09-25",
  startTime: "22:00",
  endTime: "23:30",
  capacity: 2,
}

function post(body: unknown) {
  return new Request("http://localhost/api/admin/shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function patch(body: unknown) {
  return new Request("http://localhost/api/admin/shifts/s1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("shift times: 00:00 to 23:59, overnight by an earlier end", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
      shift: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    create.mockResolvedValue({ id: "s1" })
  })

  it("POST refuses hours above 23, negative and malformed times with a readable message", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    for (const [startTime, endTime] of [
      ["24:00", "26:00"],
      ["25:30", "26:00"],
      ["-2:-15", "-1:-15"],
      ["9:00", "10:00"],
      ["08:00", "12:60"],
    ]) {
      const res = await POST(post({ ...validShift, startTime, endTime }))
      expect(res.status).toBe(400)
      expect(typeof (await res.json()).error).toBe("string")
    }
    expect(create).not.toHaveBeenCalled()
  })

  it("POST refuses identical start and end", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const res = await POST(post({ ...validShift, startTime: "08:00", endTime: "08:00" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/différente/)
  })

  it("POST accepts a normal shift and an overnight one (end earlier than start)", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    expect((await POST(post(validShift))).status).toBe(201)
    expect((await POST(post({ ...validShift, startTime: "22:00", endTime: "02:00" }))).status).toBe(201)
    expect((await POST(post({ ...validShift, startTime: "00:00", endTime: "02:00" }))).status).toBe(201)
    expect(create).toHaveBeenCalledTimes(3)
  })

  it("PATCH refuses invalid times before touching the database", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    for (const body of [{ endTime: "26:00" }, { startTime: "24:00" }, { startTime: "-2:-15" }, { startTime: "10:00", endTime: "10:00" }]) {
      const res = await PATCH(patch(body), { params: Promise.resolve({ id: "s1" }) })
      expect(res.status).toBe(400)
    }
  })
})
