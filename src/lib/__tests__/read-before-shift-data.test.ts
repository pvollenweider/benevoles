import { describe, it, expect, vi, beforeEach } from "vitest"

const eventFindFirst = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { event: { findFirst: eventFindFirst } } }))

import { readBeforePagesForEvent, withReadBeforeShiftPages } from "../read-before-shift-data"
import type { NotificationPayload } from "../notifications/types"

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

  it("puts the pages on the first shift, once, so a sent email never shows a dead link", async () => {
    eventFindFirst.mockResolvedValue(event)
    const prepared = await withReadBeforeShiftPages(payload({
      eventId: "evt-1",
      shifts: [
        { label: "Caisse 1", roleName: "Caisse" },
        { label: "Caisse 2", roleName: "Caisse" },
      ],
    }))
    const shifts = prepared.data.shifts as { readBefore?: { title: string }[] }[]
    expect(shifts[0].readBefore).toEqual([{ title: "Tenir la caisse", url: "http://localhost:3000/fete/caisse" }])
    expect(shifts[1].readBefore).toBeUndefined()
  })

  it("leaves a waiting-list confirmation untouched: no event, no shift, no link", async () => {
    const waiting = { kind: "waitlist_confirmation" as const, recipient: { email: "lea@example.org" }, data: { shiftLabel: "Caisse", waitingPosition: 2 } }
    const prepared = await withReadBeforeShiftPages(waiting)
    expect(prepared).toBe(waiting)
    expect(eventFindFirst).not.toHaveBeenCalled()
  })
})
