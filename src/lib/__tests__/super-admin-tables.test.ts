import { describe, it, expect } from "vitest"
import { ORG_SORT_COLS, ORG_SORT_LABELS, VIDEO_SORT_COLS, VIDEO_SORT_LABELS, orgSortKey, orgState, usefulPercent, videoSortKey, type OrgRow } from "../super-admin-tables"
import { sortAnnouncement, sortRows } from "../table-sort"
import type { FeedbackSummaryRow } from "../video-feedback"

// Sortable super admin tables (#820): columns and sort keys.

const org = (over: Partial<OrgRow> & { name: string }): OrgRow => ({
  slug: over.name.toLowerCase(),
  active: true,
  suspendedAt: null,
  publicationApprovedAt: "2026-01-01T00:00:00.000Z",
  outboundEmailApprovedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  _count: { events: 0, admins: 1, volunteers: 0 },
  ...over,
})

describe("orgState", () => {
  it("tells suspended, deactivated, waiting for validation and active apart", () => {
    expect(orgState(org({ name: "A", active: false, suspendedAt: "2026-02-01T00:00:00.000Z" }))).toBe("suspended")
    expect(orgState(org({ name: "A", active: false }))).toBe("deactivated")
    expect(orgState(org({ name: "A", publicationApprovedAt: null }))).toBe("pending")
    expect(orgState(org({ name: "A", outboundEmailApprovedAt: null }))).toBe("pending")
    expect(orgState(org({ name: "A" }))).toBe("active")
  })
})

describe("organisations sort", () => {
  const orgs = [
    org({ name: "Zèbre", createdAt: "2026-03-01T00:00:00.000Z", _count: { events: 3, admins: 1, volunteers: 120 } }),
    org({ name: "Abeille", active: false, createdAt: "2025-06-01T00:00:00.000Z", _count: { events: 12, admins: 2, volunteers: 9 } }),
    org({ name: "école", publicationApprovedAt: null, createdAt: "2026-01-10T00:00:00.000Z", _count: { events: 0, admins: 1, volunteers: 0 } }),
    org({ name: "Mouette", active: false, suspendedAt: "2026-02-01T00:00:00.000Z", _count: { events: 1, admins: 1, volunteers: 40 } }),
  ]
  const names = (rows: OrgRow[]) => rows.map((o) => o.name)

  it("finds the largest organisations by members or events", () => {
    expect(names(sortRows(orgs, { col: "membres", dir: "desc" }, orgSortKey))[0]).toBe("Zèbre")
    expect(names(sortRows(orgs, { col: "evenements", dir: "desc" }, orgSortKey))[0]).toBe("Abeille")
  })

  it("sorts names with accents in French order", () => {
    expect(names(sortRows(orgs, { col: "nom", dir: "asc" }, orgSortKey))).toEqual(["Abeille", "école", "Mouette", "Zèbre"])
  })

  it("sorts by state: active, waiting, deactivated, suspended", () => {
    expect(names(sortRows(orgs, { col: "etat", dir: "asc" }, orgSortKey))).toEqual(["Zèbre", "école", "Abeille", "Mouette"])
  })

  it("sorts by creation date", () => {
    expect(names(sortRows(orgs, { col: "creation", dir: "asc" }, orgSortKey))[0]).toBe("Abeille")
  })

  it("has a label for every column", () => {
    for (const col of ORG_SORT_COLS) expect(ORG_SORT_LABELS[col]).toBeTruthy()
  })

  it("says which end comes first for a date or a state", () => {
    expect(sortAnnouncement({ col: "creation", dir: "desc" }, ORG_SORT_LABELS)).toBe("Trié par date de création, de la plus récente à la plus ancienne")
    expect(sortAnnouncement({ col: "etat", dir: "asc" }, ORG_SORT_LABELS)).toBe("Trié par état, des actives aux suspendues")
    expect(sortAnnouncement({ col: "membres", dir: "desc" }, ORG_SORT_LABELS)).toBe("Trié par membres, décroissant")
  })
})

describe("video feedback sort", () => {
  const row = (videoId: string, title: string | null, yes: number, no: number): FeedbackSummaryRow =>
    ({ videoId, title, revision: 1, current: true, yes, no, total: yes + no })
  const rows = [row("A", "Créer un événement", 2, 1), row("B", "Accueil", 66, 34), row("C", null, 0, 3), row("D", "Badges", 0, 0)]
  const ids = (r: FeedbackSummaryRow[]) => r.map((x) => x.videoId)

  it("rounds the share of « Oui », with nothing for a video without answers", () => {
    expect(usefulPercent(rows[0])).toBe(67)
    expect(usefulPercent(rows[2])).toBe(0)
    expect(usefulPercent(rows[3])).toBeNull()
  })

  it("sorts by the exact share, videos without answers last", () => {
    expect(ids(sortRows(rows, { col: "utile", dir: "asc" }, videoSortKey))).toEqual(["C", "B", "A", "D"])
    expect(ids(sortRows(rows, { col: "utile", dir: "desc" }, videoSortKey))).toEqual(["A", "B", "C", "D"])
  })

  it("sorts by title, a video gone from the catalogue last", () => {
    expect(ids(sortRows(rows, { col: "video", dir: "asc" }, videoSortKey))).toEqual(["B", "D", "A", "C"])
  })

  it("sorts by Non and by total", () => {
    expect(ids(sortRows(rows, { col: "non", dir: "desc" }, videoSortKey))[0]).toBe("B")
    expect(ids(sortRows(rows, { col: "total", dir: "asc" }, videoSortKey))[0]).toBe("D")
    expect(videoSortKey(rows[1], "oui")).toBe(66)
    expect(videoSortKey(rows[1], "revision")).toBe(1)
  })

  it("has a label for every column", () => {
    for (const col of VIDEO_SORT_COLS) expect(VIDEO_SORT_LABELS[col]).toBeTruthy()
  })
})
