import { describe, it, expect } from "vitest"
import { shiftListText, shiftViewState, type TimelineShift } from "../public-timeline"
import {
  readShiftView,
  readShiftViewHintPlayed,
  saveShiftView,
  saveShiftViewHintPlayed,
  SHIFT_VIEW_HINT_KEY,
  SHIFT_VIEW_KEY,
  shiftViewButtonLook,
  shownShiftView,
  showsRotateHint,
  wideShiftViewQuery,
} from "../shift-view"

const shift = (over: Partial<TimelineShift> = {}): TimelineShift => ({ id: "s", roleName: "Bar", label: "Bar", startTime: "10:00", endTime: "12:00", status: "open", capacity: 3, registered: 1, spotsLeft: 2, ...over })
const state = (over: Partial<Parameters<typeof shiftViewState>[0]> = {}) => shiftViewState({ shift: shift(), selected: false, conflict: false, reserved: false, locked: false, ...over })

describe("one rule for the timeline and the list (#808)", () => {
  it("lets the visitor choose an open shift, and refuses held, conflicting, full, closed and reserved ones", () => {
    expect(state()).toMatchObject({ clickable: true, look: "default" })
    expect(state({ selected: true })).toMatchObject({ clickable: true, look: "selected", selected: true })
    expect(state({ held: "active", selected: true })).toMatchObject({ clickable: false, selected: false })
    expect(state({ conflict: true })).toMatchObject({ clickable: false, look: "unavailable" })
    expect(state({ shift: shift({ status: "full" }) })).toMatchObject({ clickable: false, unavailable: true })
    expect(state({ shift: shift({ status: "full", waitlistEnabled: true }) })).toMatchObject({ clickable: true, waitlistable: true })
    expect(state({ shift: shift({ status: "closed" }) })).toMatchObject({ clickable: false })
    expect(state({ reserved: true })).toMatchObject({ clickable: false, reserved: true })
    // Registrations closed: a selection can still be undone, nothing new chosen.
    expect(state({ locked: true })).toMatchObject({ clickable: false })
    expect(state({ locked: true, selected: true })).toMatchObject({ clickable: true })
  })

  it("writes the list item in plain words", () => {
    const text = (s: TimelineShift, over = {}, opts: { locked: boolean; limitReached?: number } = { locked: false }) => shiftListText(s, state({ shift: s, ...over }), opts)
    expect(text(shift({ label: "Comptoir" }))).toEqual({ title: "10h–12h · Bar (Comptoir)", status: "2 places libres sur 3", details: null })
    expect(text(shift({ startTime: "22:00", endTime: "02:00", minAge: 18, requiresApproval: true }))).toMatchObject({ title: "22h–02h (jusqu'au lendemain) · Bar", details: "18 ans minimum · Sur validation" })
    expect(text(shift(), { held: "requested" }).status).toBe("Demande envoyée")
    expect(text(shift({ status: "full", waitlistEnabled: true })).status).toBe("Complet · file d'attente")
    expect(text(shift(), {}, { locked: false, limitReached: 2 }).status).toBe("Limite de 2 créneaux par personne atteinte · 2 places libres sur 3")
    expect(text(shift(), {}, { locked: true }).status).toBe("Inscriptions fermées · 2 places libres sur 3")
  })

  it("keeps the choice on the device, and copes without storage", () => {
    const store = new Map<string, string>()
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(readShiftView(fake)).toBeNull()
    saveShiftView("liste", fake)
    expect(store.get(SHIFT_VIEW_KEY)).toBe("liste")
    expect(readShiftView(fake)).toBe("liste")
    store.set(SHIFT_VIEW_KEY, "autre")
    expect(readShiftView(fake)).toBeNull()
    const broken = { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } }
    expect(readShiftView(broken)).toBeNull()
    expect(() => saveShiftView("frise", broken)).not.toThrow()
  })

  it("keeps the one-time hint flag on the device, and copes without storage", () => {
    const store = new Map<string, string>()
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(readShiftViewHintPlayed(fake)).toBe(false)
    saveShiftViewHintPlayed(fake)
    expect(store.get(SHIFT_VIEW_HINT_KEY)).toBe("1")
    expect(readShiftViewHintPlayed(fake)).toBe(true)
    const broken = { getItem: (): string | null => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } }
    expect(readShiftViewHintPlayed(broken)).toBe(false)
    expect(() => saveShiftViewHintPlayed(broken)).not.toThrow()
  })
})

describe("default view by screen width and event setting (#1407)", () => {
  it("shows the choice made on the page, then the one kept on the device, then the event's rule", () => {
    expect(shownShiftView("frise", "liste", false, null)).toBe("frise")
    expect(shownShiftView(null, "frise", false, null)).toBe("frise")
    expect(shownShiftView(null, "liste", true, 0)).toBe("liste")
    expect(shownShiftView(null, "frise", false, 640)).toBe("frise")
    expect(shownShiftView(null, null, false, 404)).toBe("liste")
    expect(shownShiftView(null, null, true, 404)).toBe("frise")
  })

  it("learns the view at once when the width cannot change it", () => {
    // Setting « Frise »: always, without waiting for the width (no « auto » double render).
    expect(shownShiftView(null, null, null, 0)).toBe("frise")
    // Setting « Liste », or automatic on a long event: never.
    expect(shownShiftView(null, null, null, null)).toBe("liste")
    expect(shownShiftView(null, null, true, null)).toBe("liste")
  })

  it("leaves the view to CSS only while the width is unknown and the threshold is positive", () => {
    expect(shownShiftView(null, null, null, 404)).toBe("auto")
    expect(shownShiftView("liste", null, null, 404)).toBe("liste")
    expect(shownShiftView(null, null, null, 320)).toBe("auto")
  })

  it("marks the pressed button, or lets the breakpoint mark it", () => {
    expect(shiftViewButtonLook("frise", "frise")).toBe("on")
    expect(shiftViewButtonLook("liste", "frise")).toBe("off")
    expect(shiftViewButtonLook("frise", "auto")).toBe("on-when-wide")
    expect(shiftViewButtonLook("liste", "auto")).toBe("on-when-narrow")
  })

  it("builds the page's own media query from the width", () => {
    expect(wideShiftViewQuery(404)).toBe("(min-width: 404px)")
    expect(wideShiftViewQuery(320)).toBe("(min-width: 320px)")
    expect(wideShiftViewQuery(640)).toBe("(min-width: 640px)")
  })
})

describe("« Tourne le téléphone » in the list view (#1407, part D)", () => {
  const base = {
    view: "liste" as const,
    chosen: null,
    saved: null,
    kept: null,
    from: 404,
    coarsePointer: true,
    portrait: true,
    screenLongSide: 844,
  }

  it("shows it on a touch device held upright whose screen could show the timeline", () => {
    expect(showsRotateHint(base)).toBe(true)
    // The screen's long side exactly at the threshold is enough.
    expect(showsRotateHint({ ...base, screenLongSide: 404 })).toBe(true)
  })

  it("hides it once a choice was made, on this page or on the device, or a shift kept the view", () => {
    expect(showsRotateHint({ ...base, chosen: "liste" })).toBe(false)
    expect(showsRotateHint({ ...base, saved: "liste" })).toBe(false)
    expect(showsRotateHint({ ...base, kept: "liste" })).toBe(false)
  })

  it("hides it when the timeline is shown or its width is unknown", () => {
    expect(showsRotateHint({ ...base, view: "frise" })).toBe(false)
    expect(showsRotateHint({ ...base, view: "auto" })).toBe(false)
  })

  it("hides it when the setting or the event leaves no readable width to turn to", () => {
    expect(showsRotateHint({ ...base, from: null })).toBe(false)
    expect(showsRotateHint({ ...base, from: 0 })).toBe(false)
  })

  it("hides it off a touch device, held sideways, or on a screen too short", () => {
    expect(showsRotateHint({ ...base, coarsePointer: false })).toBe(false)
    expect(showsRotateHint({ ...base, coarsePointer: null })).toBe(false)
    expect(showsRotateHint({ ...base, portrait: false })).toBe(false)
    expect(showsRotateHint({ ...base, portrait: null })).toBe(false)
    expect(showsRotateHint({ ...base, screenLongSide: null })).toBe(false)
    expect(showsRotateHint({ ...base, screenLongSide: 403 })).toBe(false)
  })
})
