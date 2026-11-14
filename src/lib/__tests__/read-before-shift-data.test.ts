import { describe, it, expect, vi, beforeEach } from "vitest"

const eventFindFirst = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { event: { findFirst: eventFindFirst } } }))

import { readBeforePagesForEvent, withReadBeforeShiftPages } from "../read-before-shift-data"
import type { NotificationPayload } from "../notifications/types"
import { withReadBeforeOnce } from "../shift-info"

const event = {
  slug: "fete",
  publicStatus: "published",
  organization: { slug: "asso" },
  pages: [
    { slug: "caisse", title: "Tenir la caisse", roleNames: ["Caisse"], displayOrder: 0 },
    { slug: "parking", title: "Plan du parking", roleNames: ["Parking"], displayOrder: 1 },
    { slug: "general", title: "Infos générales", roleNames: [], displayOrder: 2 },
  ],
}

const payload = (data: Record<string, unknown>): NotificationPayload => ({
  kind: "registration_confirmation",
  recipient: { email: "lea@example.org" },
  data,
})

describe("read-before-shift pages resolved for emails (#1324)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("builds the links of the pages attached to the confirmed postes, in page order", async () => {
    eventFindFirst.mockResolvedValue(event)
    expect(await readBeforePagesForEvent("evt-1", ["Caisse", "Parking"])).toEqual([
      { title: "Tenir la caisse", url: "http://localhost:3000/fete/caisse" },
      { title: "Plan du parking", url: "http://localhost:3000/fete/parking" },
    ])
    // A page attached to no poste is never « to read before your shift ».
    expect((await readBeforePagesForEvent("evt-1", ["Caisse"])).some((p) => p.title === "Infos générales")).toBe(false)
  })

  it("does not link an unpublished event, nor when the page was deleted since it was queued", async () => {
    eventFindFirst.mockResolvedValue({ ...event, publicStatus: "draft" })
    expect(await readBeforePagesForEvent("evt-1", ["Caisse"])).toEqual([])
    eventFindFirst.mockResolvedValue({ ...event, pages: [{ slug: "autre", title: "Autre", roleNames: ["Caisse"], displayOrder: 0 }] })
    expect(await readBeforePagesForEvent("evt-1", ["Caisse"])).toEqual([{ title: "Autre", url: "http://localhost:3000/fete/autre" }])
    eventFindFirst.mockResolvedValue({ ...event, pages: [] })
    expect(await readBeforePagesForEvent("evt-1", ["Caisse"])).toEqual([])
  })

  it("puts each page on the shifts of its own poste, never under another poste's shift", async () => {
    eventFindFirst.mockResolvedValue(event)
    const prepared = await withReadBeforeShiftPages(payload({
      eventId: "evt-1",
      shifts: [
        { label: "Buvette", roleName: "Buvette" },
        { label: "Parking nord", roleName: "Parking" },
        { label: "Caisse 1", roleName: "Caisse" },
        { label: "Caisse 2", roleName: "Caisse" },
      ],
    }))
    const shifts = prepared.data.shifts as { readBefore?: { title: string }[] }[]
    expect(shifts[0].readBefore).toBeUndefined()
    expect(shifts[1].readBefore).toEqual([{ title: "Plan du parking", url: "http://localhost:3000/fete/parking" }])
    expect(shifts[2].readBefore).toEqual([{ title: "Tenir la caisse", url: "http://localhost:3000/fete/caisse" }])
    expect(shifts[3].readBefore).toEqual(shifts[2].readBefore)
  })

  it("gives no link to a shift marked as a waiting-list place or a request", async () => {
    eventFindFirst.mockResolvedValue(event)
    const prepared = await withReadBeforeShiftPages(payload({
      eventId: "evt-1",
      shifts: [
        { label: "Caisse 1", roleName: "Caisse", waitlist: true },
        { label: "Parking nord", roleName: "Parking", requiresApproval: true },
      ],
    }))
    expect((prepared.data.shifts as { readBefore?: unknown }[]).every((s) => s.readBefore === undefined)).toBe(true)
  })

  it("leaves a waiting-list confirmation untouched: no event, no shift, no link", async () => {
    const waiting = { kind: "waitlist_confirmation" as const, recipient: { email: "lea@example.org" }, data: { shiftLabel: "Caisse", waitingPosition: 2 } }
    const prepared = await withReadBeforeShiftPages(waiting)
    expect(prepared).toBe(waiting)
    expect(eventFindFirst).not.toHaveBeenCalled()
  })

  it("keeps a page once in an email, under the first shift of its poste", () => {
    const caisse = [{ title: "Tenir la caisse", url: "https://asso.example/fete/caisse" }]
    const parking = [{ title: "Plan du parking", url: "https://asso.example/fete/parking" }]
    const once = withReadBeforeOnce([{ readBefore: [] }, { readBefore: caisse }, { readBefore: parking }, { readBefore: caisse }])
    expect(once.map((s) => s.readBefore)).toEqual([[], caisse, parking, []])
  })
})
