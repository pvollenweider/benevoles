import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ tagVolunteerAsResponsable: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

// Lightweight check-in (#399).
describe("GET /api/admin/events/[id]/export/attendance", () => {
  const event = {
    id: "evt-a", title: "Fête d'été", slug: "fete", organization: { timeZone: "Europe/Zurich" },
    registrations: [
      { phone: null, checkedInAt: new Date("2026-07-04T08:05:00Z"), volunteer: { firstName: "Alice", lastName: "Martin", email: "a@x.ch", phone: "079 1" }, shift: { roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" } },
      { phone: "078 2", checkedInAt: null, volunteer: { firstName: "Bob", lastName: "Durand", email: null, phone: null }, shift: { roleName: "Bar", label: "Bar soir", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "20:00" } },
      { phone: null, checkedInAt: null, attendanceStatus: "absent", volunteer: { firstName: "Camille", lastName: "Rochat", email: "camille.rochat@example.org", phone: null }, shift: { roleName: "Bar", label: "Bar soir", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "20:00" } },
    ],
  }

  it("streams a CSV attachment of the confirmed registrations", async () => {
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(event) } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/attendance/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-a/export/attendance"), { params: Promise.resolve({ id: "evt-a" }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="presences-fete-d-ete.csv"')
    const lines = (await res.text()).split("\r\n")
    // « Présent » and « Pointé le » as before; the recorded absence in its own column after them
    // (#1141). `text()` drops the BOM the file starts with.
    expect(lines[0]).toBe("Prénom;Nom;Email;Téléphone;Poste;Créneau;Date;Début;Fin;Présent;Pointé le;Absence notée;Parti avant la fin")
    expect(lines[1]).toBe("Alice;Martin;a@x.ch;079 1;Bar;;2026-07-04;10:00;12:00;oui;04.07.2026 10:05;;")
    expect(lines[2]).toBe("Bob;Durand;;078 2;Bar;Bar soir;2026-07-04;18:00;20:00;non;;;")
    expect(lines[3]).toBe("Camille;Rochat;camille.rochat@example.org;;Bar;Bar soir;2026-07-04;18:00;20:00;non;;oui;")
  })

  it("returns 404 for an event outside the organization", async () => {
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(null) } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/attendance/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-b/export/attendance"), { params: Promise.resolve({ id: "evt-b" }) })
    expect(res.status).toBe(404)
  })
})

// Attendance actions (#399, #1141): one conditional write per row, on a fake org-scoped client
// that applies the `where` like the database would.
describe("setAttendance", () => {
  type Row = { id: string; shiftId: string; status: string; checkedInAt: Date | null; attendanceStatus: string | null; attendanceAt: Date | null; attendanceBy: string | null }
  const row = (id: string, over: Partial<Row> = {}): Row => ({ id, shiftId: "s1", status: "active", checkedInAt: null, attendanceStatus: null, attendanceAt: null, attendanceBy: null, ...over })
  const target = (r: Row) => ({ id: r.id, eventId: "evt-a", shiftId: "s1", status: r.status })
  const actor = { type: "admin", id: "adm-1" } as never
  const now = new Date("2026-07-04T08:05:00Z")
  const earlier = new Date("2026-07-04T07:55:00Z")

  type StatusCond = string | null | { not: "left_early" }
  type Where = { id: string; status: string; shiftId: string; checkedInAt: null | { not: null }; attendanceStatus?: StatusCond; OR?: { attendanceStatus: StatusCond }[] }
  function fakeDb(rows: Row[]) {
    const updateManyAndReturn = vi.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      // The `attendanceStatus` predicate: absent, exactly "left_early", "not left_early", or the
      // OR that keeps NULL statuses in (Prisma's `not` alone leaves them out in SQL).
      const statusMatch = (x: Row, w: StatusCond): boolean => {
        if (w === null) return x.attendanceStatus === null
        if (typeof w === "object" && w !== null) return x.attendanceStatus !== w.not
        return x.attendanceStatus === w
      }
      const statusOk = (x: Row): boolean => {
        if (where.OR) return where.OR.some((cond) => statusMatch(x, cond.attendanceStatus))
        if (!("attendanceStatus" in where)) return true
        return statusMatch(x, where.attendanceStatus as StatusCond)
      }
      const r = rows.find((x) =>
        x.id === where.id && x.status === where.status && x.shiftId === where.shiftId
        && (where.checkedInAt === null ? x.checkedInAt === null : x.checkedInAt !== null)
        && statusOk(x))
      if (!r) return []
      Object.assign(r, data)
      // Like UPDATE … RETURNING: the arrival is the one the database holds after the write.
      return [{ id: r.id, checkedInAt: r.checkedInAt }]
    })
    const findMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => rows.filter((r) => where.id.in.includes(r.id)))
    return { updateManyAndReturn, findMany, db: { registration: { updateManyAndReturn, findMany } } as never }
  }

  beforeEach(() => vi.clearAllMocks())

  it("check_in: an expected person becomes present; the write tests the status, the check-in and the absence", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1")]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, rows.map(target), "check_in", now)
    expect(results).toEqual([{ id: "r1", changed: true, state: "present", checkedInAt: now.toISOString() }])
    expect(fake.updateManyAndReturn).toHaveBeenCalledTimes(1)
    expect(fake.updateManyAndReturn.mock.calls[0][0]).toEqual({
      where: { id: "r1", status: "active", shiftId: "s1", checkedInAt: null, attendanceStatus: null },
      data: { checkedInAt: now, attendanceStatus: null, attendanceAt: null, attendanceBy: null },
      select: { id: true, checkedInAt: true },
    })
    // The log entry of #399, unchanged.
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent.mock.calls[0][0]).toEqual({
      eventId: "evt-a", actor, action: "registration.checked_in", entityType: "Registration", entityId: "r1",
      changes: { checkedInAt: { from: null, to: now.toISOString() }, shiftId: { from: "s1", to: "s1" } },
    })
    // Nothing to read back when every row changed.
    expect(fake.findMany).not.toHaveBeenCalled()
  })

  it("undo_check_in: a present person becomes expected again, with the log entry of #399", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1", { checkedInAt: earlier })]
    const fake = fakeDb(rows)
    expect(await setAttendance(fake.db, actor, rows.map(target), "undo_check_in", now)).toEqual([{ id: "r1", changed: true, state: "expected", checkedInAt: null }])
    expect(fake.updateManyAndReturn.mock.calls[0][0]).toEqual({
      // Any row with a check-in time whose status is not left_early (see the mixed row below).
      where: { id: "r1", status: "active", shiftId: "s1", checkedInAt: { not: null }, OR: [{ attendanceStatus: null }, { attendanceStatus: { not: "left_early" } }] },
      data: { checkedInAt: null, attendanceStatus: null, attendanceAt: null, attendanceBy: null },
      select: { id: true, checkedInAt: true },
    })
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "registration.check_in_undone", changes: { checkedInAt: { from: "set", to: null }, shiftId: { from: "s1", to: "s1" } } })
  })

  it("mark_absent: an expected person becomes absent, with the time and the admin who recorded it", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1")]
    const fake = fakeDb(rows)
    expect(await setAttendance(fake.db, actor, rows.map(target), "mark_absent", now)).toEqual([{ id: "r1", changed: true, state: "absent", checkedInAt: null }])
    expect(fake.updateManyAndReturn.mock.calls[0][0]).toEqual({
      where: { id: "r1", status: "active", shiftId: "s1", checkedInAt: null, attendanceStatus: null },
      data: { checkedInAt: null, attendanceStatus: "absent", attendanceAt: now, attendanceBy: "adm-1" },
      select: { id: true, checkedInAt: true },
    })
    expect(rows[0]).toMatchObject({ checkedInAt: null, attendanceStatus: "absent", attendanceAt: now, attendanceBy: "adm-1" })
    expect(logEvent.mock.calls[0][0]).toEqual({
      eventId: "evt-a", actor, action: "registration.marked_absent", entityType: "Registration", entityId: "r1",
      changes: { attendance: { from: "expected", to: "absent" }, shiftId: { from: "s1", to: "s1" } },
    })
  })

  it("undo_absent: an absent person becomes expected again and the three columns are cleared", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1", { attendanceStatus: "absent", attendanceAt: earlier, attendanceBy: "adm-2" })]
    const fake = fakeDb(rows)
    expect(await setAttendance(fake.db, actor, rows.map(target), "undo_absent", now)).toEqual([{ id: "r1", changed: true, state: "expected", checkedInAt: null }])
    expect(fake.updateManyAndReturn.mock.calls[0][0].where).toEqual({ id: "r1", status: "active", shiftId: "s1", checkedInAt: null, attendanceStatus: "absent" })
    expect(rows[0]).toMatchObject({ checkedInAt: null, attendanceStatus: null, attendanceAt: null, attendanceBy: null })
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "registration.absence_undone", changes: { attendance: { from: "absent", to: "expected" }, shiftId: { from: "s1", to: "s1" } } })
  })

  it("mark_left_early: a present person is marked gone before the end, keeping the arrival", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1", { checkedInAt: earlier })]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, [{ ...target(rows[0]), checkedInAt: earlier.toISOString() }], "mark_left_early", now)
    expect(results).toEqual([{ id: "r1", changed: true, state: "left_early", checkedInAt: earlier.toISOString() }])
    expect(fake.updateManyAndReturn.mock.calls[0][0]).toEqual({
      where: { id: "r1", status: "active", shiftId: "s1", checkedInAt: { not: null }, OR: [{ attendanceStatus: null }, { attendanceStatus: { not: "left_early" } }] },
      data: { attendanceStatus: "left_early", attendanceAt: now, attendanceBy: "adm-1" },
      select: { id: true, checkedInAt: true },
    })
    // The arrival is untouched, the departure time and author are recorded.
    expect(rows[0]).toMatchObject({ checkedInAt: earlier, attendanceStatus: "left_early", attendanceAt: now, attendanceBy: "adm-1" })
    expect(logEvent.mock.calls[0][0]).toEqual({
      eventId: "evt-a", actor, action: "registration.marked_left_early", entityType: "Registration", entityId: "r1",
      changes: { attendance: { from: "present", to: "left_early" }, shiftId: { from: "s1", to: "s1" } },
    })
  })

  it("mark_left_early returns the arrival the write kept, even when the caller did not pass it", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1", { checkedInAt: earlier })]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, rows.map(target), "mark_left_early", now)
    expect(results).toEqual([{ id: "r1", changed: true, state: "left_early", checkedInAt: earlier.toISOString() }])
    // The write itself returned the arrival: no extra read.
    expect(fake.findMany).not.toHaveBeenCalled()
    expect(rows[0].attendanceStatus).toBe("left_early")
  })

  it("returns the arrival the database kept, not the one the caller read", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    // The caller's page showed the presence recorded at `earlier`; another device undid and
    // re-recorded it at `reRecorded` before this departure was written.
    const reRecorded = new Date("2026-07-04T08:01:00Z")
    const rows = [row("r1", { checkedInAt: reRecorded })]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, [{ ...target(rows[0]), checkedInAt: earlier.toISOString() }], "mark_left_early", now)
    expect(results).toEqual([{ id: "r1", changed: true, state: "left_early", checkedInAt: reRecorded.toISOString() }])
    expect(rows[0].checkedInAt).toBe(reRecorded)
  })

  it("a stale target that read the row as expected still returns the arrival another device re-recorded", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    // The page showed an expected row (`checkedInAt: null`): another device undid the presence
    // and recorded it again before this departure write succeeded.
    const reRecorded = new Date("2026-07-04T08:02:00Z")
    const rows = [row("r1", { checkedInAt: reRecorded })]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, [{ ...target(rows[0]), checkedInAt: null }], "mark_left_early", now)
    expect(results).toEqual([{ id: "r1", changed: true, state: "left_early", checkedInAt: reRecorded.toISOString() }])
    // A successful departure never carries a null arrival.
    expect(results[0].checkedInAt).not.toBeNull()
  })

  it("undo_left_early: a left-early person is present again, keeping the arrival and clearing the departure columns", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1", { checkedInAt: earlier, attendanceStatus: "left_early", attendanceAt: earlier, attendanceBy: "adm-2" })]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, [{ ...target(rows[0]), checkedInAt: earlier.toISOString() }], "undo_left_early", now)
    expect(results).toEqual([{ id: "r1", changed: true, state: "present", checkedInAt: earlier.toISOString() }])
    expect(fake.updateManyAndReturn.mock.calls[0][0]).toEqual({
      where: { id: "r1", status: "active", shiftId: "s1", checkedInAt: { not: null }, attendanceStatus: "left_early" },
      data: { attendanceStatus: null, attendanceAt: null, attendanceBy: null },
      select: { id: true, checkedInAt: true },
    })
    expect(rows[0]).toEqual(row("r1", { checkedInAt: earlier }))
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "registration.departure_undone", changes: { attendance: { from: "left_early", to: "present" }, shiftId: { from: "s1", to: "s1" } } })
  })

  it("undo_check_in is refused on a left-early row: the departure is undone first", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const left = () => row("r1", { checkedInAt: earlier, attendanceStatus: "left_early", attendanceAt: earlier, attendanceBy: "adm-2" })
    const rows = [left()]
    const fake = fakeDb(rows)
    expect(await setAttendance(fake.db, actor, rows.map(target), "undo_check_in", now)).toEqual([{ id: "r1", changed: false, state: "left_early", checkedInAt: earlier.toISOString() }])
    // The write was attempted with the present predicate, which excludes left_early: nothing matched.
    expect(fake.updateManyAndReturn.mock.calls[0][0].where).toEqual({ id: "r1", status: "active", shiftId: "s1", checkedInAt: { not: null }, OR: [{ attendanceStatus: null }, { attendanceStatus: { not: "left_early" } }] })
    expect(rows[0]).toEqual(left())
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a stale departure request changes nothing and returns the state recorded meanwhile", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    // The page showed the person present; another device marked them absent meanwhile.
    const rows = [row("r1", { attendanceStatus: "absent", attendanceAt: earlier, attendanceBy: "adm-2" })]
    const fake = fakeDb(rows)
    expect(await setAttendance(fake.db, actor, [{ ...target(rows[0]), checkedInAt: null }], "mark_left_early", now)).toEqual([{ id: "r1", changed: false, state: "absent", checkedInAt: null }])
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("the shift stays in the departure predicate: a moved row is reported as moved, not written", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1", { shiftId: "s2", checkedInAt: earlier })]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, [{ id: "r1", eventId: "evt-a", shiftId: "s1", status: "active", checkedInAt: earlier.toISOString() }], "mark_left_early", now)
    expect(results).toEqual([{ id: "r1", changed: false, state: "present", checkedInAt: earlier.toISOString(), moved: true }])
    expect(rows[0]).toEqual(row("r1", { shiftId: "s2", checkedInAt: earlier }))
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a stale request changes nothing, logs nothing and returns the state recorded meanwhile", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    // The page showed both as expected; another device marked Nadia absent and Olivier present.
    const rows = [row("nadia", { attendanceStatus: "absent", attendanceAt: earlier, attendanceBy: "adm-2" }), row("olivier", { checkedInAt: earlier })]
    const before = structuredClone(rows)
    const fake = fakeDb(rows)
    expect(await setAttendance(fake.db, actor, rows.map(target), "check_in", now)).toEqual([
      { id: "nadia", changed: false, state: "absent", checkedInAt: null },
      { id: "olivier", changed: false, state: "present", checkedInAt: earlier.toISOString() },
    ])
    expect(await setAttendance(fake.db, actor, rows.map(target), "mark_absent", now)).toEqual([
      { id: "nadia", changed: false, state: "absent", checkedInAt: null },
      { id: "olivier", changed: false, state: "present", checkedInAt: earlier.toISOString() },
    ])
    expect(rows).toEqual(before)
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("present and absent never replace each other directly: the undo of the other state changes nothing either", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("nadia", { attendanceStatus: "absent", attendanceAt: earlier, attendanceBy: "adm-2" }), row("olivier", { checkedInAt: earlier })]
    const before = structuredClone(rows)
    const fake = fakeDb(rows)
    // « Annuler la présence » does not clear an absence, « Annuler l'absence » does not clear a presence.
    expect((await setAttendance(fake.db, actor, [target(rows[0])], "undo_check_in", now))[0]).toEqual({ id: "nadia", changed: false, state: "absent", checkedInAt: null })
    expect((await setAttendance(fake.db, actor, [target(rows[1])], "undo_absent", now))[0]).toEqual({ id: "olivier", changed: false, state: "present", checkedInAt: earlier.toISOString() })
    expect(rows).toEqual(before)
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("inactive registrations are skipped: no write, no log, their state read back", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1"), row("r2", { status: "waiting" }), row("r3", { status: "cancelled", checkedInAt: earlier })]
    const fake = fakeDb(rows)
    for (const transition of ["check_in", "mark_absent"] as const) {
      fake.updateManyAndReturn.mockClear()
      logEvent.mockClear()
      rows[0].checkedInAt = null
      rows[0].attendanceStatus = null
      const results = await setAttendance(fake.db, actor, rows.map(target), transition, now)
      expect(results.map((r) => [r.id, r.changed])).toEqual([["r1", true], ["r2", false], ["r3", false]])
      expect(results[1]).toEqual({ id: "r2", changed: false, state: "expected", checkedInAt: null })
      expect(fake.updateManyAndReturn).toHaveBeenCalledTimes(1)
      expect(fake.updateManyAndReturn.mock.calls[0][0].where.id).toBe("r1")
      expect(logEvent).toHaveBeenCalledTimes(1)
    }
    expect(rows[1]).toEqual(row("r2", { status: "waiting" }))
    expect(rows[2]).toEqual(row("r3", { status: "cancelled", checkedInAt: earlier }))
  })

  it("a registration that became inactive after the page was read is refused by the write itself", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    // The route read it as active; it was cancelled before the write.
    const rows = [row("r1", { status: "cancelled" })]
    const fake = fakeDb(rows)
    expect(await setAttendance(fake.db, actor, [{ id: "r1", eventId: "evt-a", shiftId: "s1", status: "active" }], "mark_absent", now)).toEqual([{ id: "r1", changed: false, state: "expected", checkedInAt: null }])
    expect(fake.updateManyAndReturn.mock.calls[0][0].where.status).toBe("active")
    expect(rows[0].attendanceStatus).toBeNull()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a row selected twice is written and logged once, and reported at each position", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1")]
    const fake = fakeDb(rows)
    const results = await setAttendance(fake.db, actor, [target(rows[0]), target(rows[0])], "mark_absent", now)
    expect(results).toEqual([{ id: "r1", changed: true, state: "absent", checkedInAt: null }, { id: "r1", changed: true, state: "absent", checkedInAt: null }])
    expect(fake.updateManyAndReturn).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledTimes(1)
  })

  it("an absence recorded by something else than an admin account keeps no author id", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    const rows = [row("r1")]
    const fake = fakeDb(rows)
    await setAttendance(fake.db, { type: "system" } as never, rows.map(target), "mark_absent", now)
    expect(rows[0].attendanceBy).toBeNull()
  })

  // Rolling deployment: the previous release's check-in, which knows only `checkedInAt`, ran on
  // a row this release had marked absent. Both marks are set.
  describe("a row with both a check-in and « absent » (previous release during a rolling deployment)", () => {
    const mixed = () => row("r1", { checkedInAt: earlier, attendanceStatus: "absent", attendanceAt: earlier, attendanceBy: "adm-2" })

    it("« Annuler la présence » accepts it and leaves the four columns null", async () => {
      const { setAttendance } = await import("@/lib/admin-registration-actions")
      const rows = [mixed()]
      const fake = fakeDb(rows)
      expect(await setAttendance(fake.db, actor, rows.map(target), "undo_check_in", now)).toEqual([{ id: "r1", changed: true, state: "expected", checkedInAt: null }])
      expect(rows[0]).toEqual(row("r1"))
      expect(logEvent).toHaveBeenCalledTimes(1)
      expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "registration.check_in_undone" })
    })

    it("is reported as present by every other action, which changes nothing", async () => {
      const { setAttendance } = await import("@/lib/admin-registration-actions")
      for (const transition of ["check_in", "mark_absent", "undo_absent"] as const) {
        const rows = [mixed()]
        const fake = fakeDb(rows)
        expect(await setAttendance(fake.db, actor, rows.map(target), transition, now), transition).toEqual([{ id: "r1", changed: false, state: "present", checkedInAt: earlier.toISOString() }])
        expect(rows[0]).toEqual(mixed())
      }
      expect(logEvent).not.toHaveBeenCalled()
    })
  })

  // The shift is part of the predicate: a swap committed after the caller read the row.
  describe("a registration that changed shift", () => {
    it("between the caller's read and the write: nothing is written or logged, and it is reported as moved", async () => {
      const { setAttendance } = await import("@/lib/admin-registration-actions")
      for (const transition of ["check_in", "mark_absent"] as const) {
        // The route read it on s1; the swap moved it to s2 before the write.
        const rows = [row("r1", { shiftId: "s2" })]
        const fake = fakeDb(rows)
        const results = await setAttendance(fake.db, actor, [{ id: "r1", eventId: "evt-a", shiftId: "s1", status: "active" }], transition, now)
        expect(results, transition).toEqual([{ id: "r1", changed: false, state: "expected", checkedInAt: null, moved: true }])
        expect(fake.updateManyAndReturn.mock.calls[0][0].where.shiftId).toBe("s1")
        expect(rows[0]).toEqual(row("r1", { shiftId: "s2" }))
      }
      expect(logEvent).not.toHaveBeenCalled()
    })

    it("since the client's page was read (`observedShiftId`): no write is even tried, and it is reported as moved with its state on the new shift", async () => {
      const { setAttendance } = await import("@/lib/admin-registration-actions")
      // The page showed r1 on s1; the route reads it on s2, already present there.
      const rows = [row("r1", { shiftId: "s2", checkedInAt: earlier }), row("r2")]
      const fake = fakeDb(rows)
      const results = await setAttendance(fake.db, actor, [
        { id: "r1", eventId: "evt-a", shiftId: "s2", status: "active", observedShiftId: "s1" },
        { id: "r2", eventId: "evt-a", shiftId: "s1", status: "active", observedShiftId: "s1" },
      ], "mark_absent", now)
      expect(results).toEqual([
        { id: "r1", changed: false, state: "present", checkedInAt: earlier.toISOString(), moved: true },
        { id: "r2", changed: true, state: "absent", checkedInAt: null },
      ])
      expect(fake.updateManyAndReturn).toHaveBeenCalledTimes(1)
      expect(fake.updateManyAndReturn.mock.calls[0][0].where.id).toBe("r2")
      expect(logEvent).toHaveBeenCalledTimes(1)
      expect(logEvent.mock.calls[0][0]).toMatchObject({ entityId: "r2" })
    })

    it("a caller that says nothing about the shift it saw is not told « moved »", async () => {
      const { setAttendance } = await import("@/lib/admin-registration-actions")
      const rows = [row("r1", { checkedInAt: earlier })]
      const fake = fakeDb(rows)
      const [result] = await setAttendance(fake.db, actor, [{ id: "r1", eventId: "evt-a", shiftId: "s1", status: "active", observedShiftId: null }], "check_in", now)
      expect(result).toEqual({ id: "r1", changed: false, state: "present", checkedInAt: earlier.toISOString() })
      expect(result).not.toHaveProperty("moved")
    })
  })

  it("a row that disappeared before the read-back is reported as gone, with no invented state", async () => {
    const { setAttendance } = await import("@/lib/admin-registration-actions")
    // Deleted after the route read it: the write matches nothing and the read-back finds nothing.
    const fake = fakeDb([])
    const results = await setAttendance(fake.db, actor, [{ id: "r1", eventId: "evt-a", shiftId: "s1", status: "active" }], "mark_absent", now)
    expect(results).toEqual([{ id: "r1", changed: false, state: null, checkedInAt: null, gone: true }])
    expect(logEvent).not.toHaveBeenCalled()
  })
})
