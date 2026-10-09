import { describe, it, expect } from "vitest"
import { shiftListText, shiftViewState, type TimelineShift } from "../public-timeline"
import { readShiftView, saveShiftView, SHIFT_VIEW_KEY } from "../shift-view"

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
    expect(text(shift(), {}, { locked: false, limitReached: 2 }).status).toBe("Limite de 2 par personne atteinte · 2 places libres sur 3")
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
})
