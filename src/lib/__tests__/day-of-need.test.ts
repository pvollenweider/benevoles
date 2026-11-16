import { describe, it, expect } from "vitest"
import {
  defaultNeedWindow, needCreatedAnnouncement, notificationBlockedText,
} from "../day-of-need"
import { addShiftToBoard, type DayOfBoard, type DayOfShift } from "../day-of"
import {
  checkAllSelectable, openShiftsPush, openShiftsPushTtlSeconds, registeredOnLocalDay,
  shiftOverlapsLocalDay, type Candidate, type EventShiftRef, type OpenShift,
} from "../open-shifts"

// « Ajouter un besoin » on « Jour J » (#1304).
const TZ = "Europe/Zurich"
const ref = (id: string, date: string, startTime: string, endTime: string): EventShiftRef => ({ id, roleName: "Bar", label: "Bar", date, startTime, endTime })
const open = (s: EventShiftRef, placesLeft = 2): OpenShift => ({ ...s, placesLeft, reservedTags: [] })

describe("defaultNeedWindow", () => {
  it("rounds the start down to the previous quarter hour, so the need begins now", () => {
    expect(defaultNeedWindow(new Date("2026-07-04T12:07:00Z"), TZ)).toEqual({ date: "2026-07-04", startTime: "14:00", endTime: "16:00" })
    expect(defaultNeedWindow(new Date("2026-07-04T12:14:59Z"), TZ)).toEqual({ date: "2026-07-04", startTime: "14:00", endTime: "16:00" })
    expect(defaultNeedWindow(new Date("2026-07-04T12:15:00Z"), TZ)).toEqual({ date: "2026-07-04", startTime: "14:15", endTime: "16:15" })
  })

  it("keeps the local day at midnight and lets the end run past it", () => {
    // 23:50 in Zurich (21:50 UTC): still today, and a two-hour need ends at 01:45 tomorrow.
    expect(defaultNeedWindow(new Date("2026-07-04T21:50:00Z"), TZ)).toEqual({ date: "2026-07-04", startTime: "23:45", endTime: "01:45" })
  })

  it("uses the organisation's zone, not the server's", () => {
    expect(defaultNeedWindow(new Date("2026-07-04T12:07:00Z"), "America/New_York")).toEqual({ date: "2026-07-04", startTime: "08:00", endTime: "10:00" })
  })
})

describe("« Inscrits aujourd'hui »: a shift overlapping the local day (#1304)", () => {
  it("counts a night shift begun the day before, and one ending at midnight sharp does not count", () => {
    expect(shiftOverlapsLocalDay(ref("n", "2026-07-04", "22:00", "04:00"), "2026-07-05", TZ)).toBe(true)
    expect(shiftOverlapsLocalDay(ref("m", "2026-07-03", "20:00", "00:00"), "2026-07-04", TZ)).toBe(false)
    expect(shiftOverlapsLocalDay(ref("d", "2026-07-04", "10:00", "12:00"), "2026-07-04", TZ)).toBe(true)
    expect(shiftOverlapsLocalDay(ref("d", "2026-07-05", "10:00", "12:00"), "2026-07-04", TZ)).toBe(false)
  })

  it("reads daylight-saving days on real instants, spring forward and fall back", () => {
    expect(shiftOverlapsLocalDay(ref("s", "2026-03-28", "22:00", "06:00"), "2026-03-29", TZ)).toBe(true)
    expect(shiftOverlapsLocalDay(ref("s", "2026-03-28", "20:00", "00:00"), "2026-03-29", TZ)).toBe(false)
    expect(shiftOverlapsLocalDay(ref("f", "2026-10-24", "23:00", "03:00"), "2026-10-25", TZ)).toBe(true)
    expect(shiftOverlapsLocalDay(ref("f", "2026-10-24", "20:00", "00:00"), "2026-10-25", TZ)).toBe(false)
  })

  it("keeps active registrations only, and answers by volunteer", () => {
    const shifts = [ref("today", "2026-07-04", "10:00", "12:00"), ref("yesterday", "2026-07-03", "20:00", "00:00")]
    const ids = registeredOnLocalDay([
      { volunteerId: "ana", shiftId: "today", status: "active" },
      { volunteerId: "bob", shiftId: "today", status: "waiting" },
      { volunteerId: "carla", shiftId: "yesterday", status: "active" },
    ], shifts, "2026-07-04", TZ)
    expect([...ids]).toEqual(["ana"])
  })
})

describe("registrations closed on the day (#1304)", () => {
  const opensAt = new Date("2026-07-10T16:00:00Z")
  const closesAt = new Date("2026-07-01T20:00:00Z")

  it("names what blocks: the switch, an opening date not reached, a closing date passed", () => {
    expect(notificationBlockedText({ open: false, reason: "closed", opensAt: null, closesAt: null }, TZ)).toContain("case « Inscriptions ouvertes »")
    expect(notificationBlockedText({ open: false, reason: "not_yet", opensAt, closesAt: null }, TZ)).toContain("date d'ouverture, le vendredi 10 juillet à 18h, n'est pas atteinte")
    expect(notificationBlockedText({ open: false, reason: "ended", opensAt: null, closesAt }, TZ)).toContain("date de fermeture, le mercredi 1 juillet à 22h, est passée")
    expect(notificationBlockedText({ open: false, reason: "not_published", opensAt: null, closesAt: null }, TZ)).toContain("n'est pas publié")
    expect(notificationBlockedText({ open: true, closesAt: null }, TZ)).toBeNull()
  })
})

describe("the created need on the board (#1304)", () => {
  const shift = (over: Partial<DayOfShift> & { id: string }): DayOfShift => ({
    roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "14:00", endTime: "16:00", capacity: 2,
    displayOrder: 0, contactName: null, contactPhone: null, people: [], ...over,
  })
  const board = (): DayOfBoard => ({
    inProgress: [{ key: "2026-07-04T13:00", date: "2026-07-04", startTime: "13:00", shifts: [shift({ id: "run", startTime: "13:00" })] }],
    upcoming: [],
    earlier: [],
    laterCount: 2,
  })

  it("inserts a running shift at once, and a later one is only counted", () => {
    const now = new Date("2026-07-04T12:00:00Z") // 14:00 in Zurich
    const running = addShiftToBoard(board(), shift({ id: "new" }), now, TZ)
    expect(running.phase).toBe("in_progress")
    expect(running.board.inProgress.map((g) => g.key)).toEqual(["2026-07-04T13:00", "2026-07-04T14:00"])
    expect(running.board.laterCount).toBe(2)

    const later = addShiftToBoard(board(), shift({ id: "later", startTime: "18:00", endTime: "20:00" }), now, TZ)
    expect(later.phase).toBe("later")
    expect(later.board.laterCount).toBe(3)
    expect(later.board.inProgress).toEqual(board().inProgress)
  })

  it("leaves another day out, and never adds twice", () => {
    const now = new Date("2026-07-04T12:00:00Z")
    expect(addShiftToBoard(board(), shift({ id: "tomorrow", date: "2026-07-05" }), now, TZ)).toEqual({ board: board(), phase: null })
    const once = addShiftToBoard(board(), shift({ id: "new" }), now, TZ)
    expect(addShiftToBoard(once.board, shift({ id: "new" }), now, TZ).board).toEqual(once.board)
  })

  it("says where the shift is, or which filter hides it", () => {
    const base = { name: "Bar", hours: "de 14h à 16h", missing: 2, laterCount: 3, hiddenBySearch: false, hiddenBySector: false }
    expect(needCreatedAnnouncement({ ...base, phase: "in_progress" })).toContain("Il est affiché sur le tableau.")
    expect(needCreatedAnnouncement({ ...base, phase: "later" })).toContain("compté dans « Encore 3 créneaux plus tard aujourd'hui », pas listé")
    expect(needCreatedAnnouncement({ ...base, phase: "in_progress", hiddenBySearch: true })).toContain("masqué par la recherche")
    expect(needCreatedAnnouncement({ ...base, phase: "in_progress", hiddenBySector: true })).toContain("masqué par le filtre de secteur")
  })
})

describe("« Tout cocher » (#1304)", () => {
  const candidate = (id: string, selectable: boolean) => ({ member: { id }, selectable }) as Candidate
  const listed = [candidate("ana", true), candidate("bob", false), candidate("carla", true)]

  it("ticks the selectable people of the list shown, never the others", () => {
    expect([...checkAllSelectable(new Set(), listed)]).toEqual(["ana", "carla"])
  })

  it("keeps an existing tick and stops at the 200-recipient cap", () => {
    const already = new Set(["zoe"])
    expect([...checkAllSelectable(already, listed, 2)]).toEqual(["zoe", "ana"])
    expect(checkAllSelectable(new Set(), listed, 1).size).toBe(1)
  })
})

describe("push of an « open shifts » send (#1304)", () => {
  const shifts = [open(ref("bar", "2026-07-04", "22:00", "02:00"), 2)]

  it("writes a short title and the need", () => {
    expect(openShiftsPush(shifts, "Fête")).toEqual({ title: "Fête : on cherche encore du monde", body: "Bar : 2 places libres." })
    expect(openShiftsPush([...shifts, open(ref("acc", "2026-07-05", "10:00", "12:00"), 1)], "Fête").body).toBe("2 créneaux à compléter, à partir de Bar.")
  })

  it("ends with the shift, never after the three days used elsewhere", () => {
    expect(openShiftsPushTtlSeconds(shifts, new Date("2026-07-04T20:00:00Z"), TZ)).toBe(14_400)
    expect(openShiftsPushTtlSeconds(shifts, new Date("2026-07-05T01:00:00Z"), TZ)).toBe(0)
  })
})
