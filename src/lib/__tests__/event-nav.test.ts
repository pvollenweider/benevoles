import { describe, it, expect } from "vitest"
import {
  activeTab, eventPrimaryAction, eventSubNav, eventSubPath, eventTabs, inDayOfWindow, primaryIsCurrent, showPrimaryAction,
  type EventNavFacts, type PrimaryFacts,
} from "../event-nav"

const facts: EventNavFacts = { eventId: "e1", publicStatus: "published", startDate: "2026-07-04", endDate: "2026-07-05", today: "2026-06-01" }
const B = "/admin/events/e1"

describe("eventSubPath", () => {
  it("reads the page under the event, ignoring a trailing slash, and refuses other events", () => {
    expect(eventSubPath(B, "e1")).toBe("")
    expect(eventSubPath(`${B}/`, "e1")).toBe("")
    expect(eventSubPath(`${B}/staffing/search`, "e1")).toBe("staffing/search")
    expect(eventSubPath("/admin/events/e10/shifts", "e1")).toBeNull()
    expect(eventSubPath("/admin/events", "e1")).toBeNull()
  })
})

describe("activeTab", () => {
  it.each([
    [B, "overview"], [`${B}/review`, "overview"], [`${B}/day-of`, "day-of"],
    [`${B}/shifts`, "shifts"], [`${B}/staffing`, "shifts"], [`${B}/staffing/search`, "shifts"],
    [`${B}/registrations`, "registrations"], [`${B}/invitations`, "registrations"],
    [`${B}/message`, "communication"],
    [`${B}/share`, "share"], [`${B}/qr`, "share"], [`${B}/pages`, "share"], [`${B}/preview`, "share"],
    [`${B}/print`, "documents"],
    [`${B}/edit`, "settings"], [`${B}/questions`, "settings"], [`${B}/sector-leaders`, "settings"],
  ])("%s → %s", (path, tab) => {
    expect(activeTab(path, "e1")).toBe(tab)
  })

  it("no tab for the « ⋯ » pages or an unknown path", () => {
    expect(activeTab(`${B}/log`, "e1")).toBeNull()
    expect(activeTab(`${B}/duplicate`, "e1")).toBeNull()
    expect(activeTab(`${B}/nope`, "e1")).toBeNull()
  })
})

describe("inDayOfWindow", () => {
  it("from the day before the first day to the last day", () => {
    expect(inDayOfWindow(facts, "2026-07-02")).toBe(false)
    expect(inDayOfWindow(facts, "2026-07-03")).toBe(true)
    expect(inDayOfWindow(facts, "2026-07-04")).toBe(true)
    expect(inDayOfWindow(facts, "2026-07-05")).toBe(true)
    expect(inDayOfWindow(facts, "2026-07-06")).toBe(false)
  })

  it("the day before crosses a month boundary", () => {
    expect(inDayOfWindow({ startDate: "2026-08-01", endDate: "2026-08-01" }, "2026-07-31")).toBe(true)
  })
})

describe("eventTabs", () => {
  const ids = (f: EventNavFacts, path = B) => eventTabs(f, path).map((t) => t.id)

  it("seven tabs outside the day-of window, in task order", () => {
    expect(ids(facts)).toEqual(["overview", "shifts", "registrations", "communication", "share", "documents", "settings"])
  })

  it("« Jour J » after Aperçu the day before and on the event's days, not for an archived event", () => {
    expect(ids({ ...facts, today: "2026-07-03" })).toContain("day-of")
    expect(ids({ ...facts, today: "2026-07-05" })[1]).toBe("day-of")
    expect(ids({ ...facts, today: "2026-07-06" })).not.toContain("day-of")
    expect(ids({ ...facts, today: "2026-07-04", publicStatus: "archived" })).not.toContain("day-of")
    // A draft on its day still gets the entry: the day-of board works on any event.
    expect(ids({ ...facts, today: "2026-07-04", publicStatus: "draft" })).toContain("day-of")
  })

  it("« Jour J » stays while its page is open, even out of the window", () => {
    expect(ids(facts, `${B}/day-of`)).toContain("day-of")
  })

  it("aria-current: page on the tab's first page, true on its other pages, nothing elsewhere", () => {
    const current = (path: string) => eventTabs(facts, path).filter((t) => t.current).map((t) => `${t.id}:${t.current}`)
    expect(current(B)).toEqual(["overview:page"])
    expect(current(`${B}/review`)).toEqual(["overview:true"])
    expect(current(`${B}/shifts`)).toEqual(["shifts:page"])
    expect(current(`${B}/staffing/search`)).toEqual(["shifts:true"])
    expect(current(`${B}/edit`)).toEqual(["settings:page"])
    expect(current(`${B}/questions`)).toEqual(["settings:true"])
    expect(current(`${B}/log`)).toEqual([])
  })

  it("each tab links to its first page", () => {
    expect(eventTabs(facts, B).map((t) => t.href)).toEqual([
      B, `${B}/shifts`, `${B}/registrations`, `${B}/message`, `${B}/share`, `${B}/print`, `${B}/edit`,
    ])
  })
})

describe("eventSubNav", () => {
  it("lists the pages of a tab that groups several, the current one marked", () => {
    const nav = eventSubNav(`${B}/questions`, "e1")!
    expect(nav.tabLabel).toBe("Réglages")
    expect(nav.links.map((l) => `${l.label}:${l.current ?? "-"}`)).toEqual(["Informations:-", "Questions:page", "Responsables de secteur:-"])
  })

  it("a nested page marks its parent with true", () => {
    const nav = eventSubNav(`${B}/staffing/search`, "e1")!
    expect(nav.links.find((l) => l.current)).toEqual({ label: "Où manque-t-il du monde ?", href: `${B}/staffing`, current: "true" })
  })

  it("nothing for single-page tabs, the overview, the review step and the menu pages", () => {
    expect(eventSubNav(`${B}/message`, "e1")).toBeNull()
    expect(eventSubNav(`${B}/print`, "e1")).toBeNull()
    expect(eventSubNav(B, "e1")).toBeNull()
    expect(eventSubNav(`${B}/review`, "e1")).toBeNull()
    expect(eventSubNav(`${B}/log`, "e1")).toBeNull()
  })

  it("Partage groups the links, the QR code, the pages and the volunteer preview", () => {
    expect(eventSubNav(`${B}/share`, "e1")!.links.map((l) => l.href)).toEqual([`${B}/share`, `${B}/qr`, `${B}/pages`, `${B}/preview`])
  })
})

describe("eventPrimaryAction", () => {
  const p: PrimaryFacts = { ...facts, publicStatus: "draft", shiftCount: 0, isListed: true }

  it("empty draft: add shifts; draft with shifts: publish", () => {
    expect(eventPrimaryAction(p)).toEqual({ kind: "link", label: "Ajouter des créneaux", href: `${B}/shifts`, path: "shifts" })
    expect(eventPrimaryAction({ ...p, shiftCount: 3 })).toEqual({ kind: "publish", path: "review" })
  })

  it("published: share the link, or open « Jour J » in its window (the day before included)", () => {
    const pub = { ...p, publicStatus: "published", shiftCount: 3 }
    expect(eventPrimaryAction(pub)).toMatchObject({ label: "Partager le lien", href: `${B}/share` })
    expect(eventPrimaryAction({ ...pub, today: "2026-07-03" })).toMatchObject({ label: "Ouvrir le jour J", href: `${B}/day-of` })
    expect(eventPrimaryAction({ ...pub, today: "2026-07-05" })).toMatchObject({ label: "Ouvrir le jour J" })
  })

  it("finished: the summary; archived: nothing", () => {
    expect(eventPrimaryAction({ ...p, publicStatus: "published", shiftCount: 3, today: "2026-07-06" })).toMatchObject({ label: "Voir le résumé", href: `${B}/print#reports-summary` })
    expect(eventPrimaryAction({ ...p, publicStatus: "archived", shiftCount: 3 })).toBeNull()
  })

  it("is current on the page it leads to", () => {
    const share = eventPrimaryAction({ ...p, publicStatus: "published", shiftCount: 3 })!
    expect(primaryIsCurrent(share, `${B}/share`, "e1")).toBe(true)
    expect(primaryIsCurrent(share, `${B}/qr`, "e1")).toBe(false)
    expect(primaryIsCurrent({ kind: "publish", path: "review" }, `${B}/review`, "e1")).toBe(true)
  })

  it("leaves step 2 of the creation assistant its own « Continuer » as the one primary (#1098)", () => {
    const publish = { kind: "publish", path: "review" } as const
    expect(showPrimaryAction(publish, `${B}/shifts`, "e1", true)).toBe(false)
    expect(showPrimaryAction(publish, `${B}/shifts`, "e1", false)).toBe(true)
    // Another page with a stray ?wizard keeps its primary; the page it leads to never shows it.
    expect(showPrimaryAction(publish, `${B}/registrations`, "e1", true)).toBe(true)
    expect(showPrimaryAction(publish, `${B}/review`, "e1", false)).toBe(false)
  })
})

describe("eventDatesLabel", () => {
  it("one day, several days in a month, across months and years", async () => {
    const { eventDatesLabel } = await import("../event-nav")
    expect(eventDatesLabel("2026-07-04", "2026-07-04")).toBe("4 juillet 2026")
    expect(eventDatesLabel("2026-07-04", "2026-07-05")).toBe("4 au 5 juillet 2026")
    expect(eventDatesLabel("2026-06-30", "2026-07-02")).toBe("30 juin au 2 juillet 2026")
    expect(eventDatesLabel("2026-12-31", "2027-01-01")).toBe("31 décembre 2026 au 1 janvier 2027")
  })
})
