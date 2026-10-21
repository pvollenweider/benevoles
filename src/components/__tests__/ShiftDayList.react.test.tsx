/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

import ShiftDayList from "../ShiftDayList"
import type { TimelineShift } from "@/lib/public-timeline"

const shift = (id: string, over: Partial<TimelineShift> = {}): TimelineShift => ({
  id, roleName: "Buvette", label: "Buvette", startTime: "18:00", endTime: "22:00", status: "open", capacity: 4, registered: 2, spotsLeft: 2, ...over,
})

// #1023: the role's limit per person reached, said visibly in the list item, which is its whole name.
describe("ShiftDayList and the role's limit per person", () => {
  afterEach(cleanup)

  it("shows the limit in the item's visible text, in the timeline's words", () => {
    const onToggle = vi.fn()
    render(<ShiftDayList shifts={[shift("a"), shift("b", { roleName: "Accueil", label: "Accueil", startTime: "10:00", endTime: "12:00" })]} shows={[]} selected={new Set()} onToggle={onToggle} limitReachedRoles={new Map([["Buvette", 2]])} dayLabel="samedi 24 octobre" />)
    const item = screen.getByRole("button", { name: /^18h–22h · Buvette/ })
    expect(item).toHaveTextContent("Limite de 2 créneaux par personne atteinte · 2 places libres sur 4")
    expect(item).toHaveAccessibleName("18h–22h · Buvette Limite de 2 créneaux par personne atteinte · 2 places libres sur 4")
    // Still pressable: the page says why it isn't added.
    fireEvent.click(item)
    expect(onToggle).toHaveBeenCalledWith("a", "open")
    expect(screen.getByRole("button", { name: /Accueil/ })).not.toHaveTextContent(/Limite/)
  })

  it("says nothing of the limit when it is not reached, nor on a selected item", () => {
    const { rerender } = render(<ShiftDayList shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi 24 octobre" />)
    expect(screen.getByRole("button")).not.toHaveTextContent(/Limite/)
    rerender(<ShiftDayList shifts={[shift("a")]} shows={[]} selected={new Set(["a"])} onToggle={() => {}} limitReachedRoles={new Map([["Buvette", 1]])} dayLabel="samedi 24 octobre" />)
    expect(screen.getByRole("button")).toHaveTextContent("Sélectionné")
    expect(screen.getByRole("button")).not.toHaveTextContent(/Limite/)
  })

  it("lets a stronger reason win: full", () => {
    render(<ShiftDayList shifts={[shift("a", { status: "full", spotsLeft: 0, registered: 4 })]} shows={[]} selected={new Set()} onToggle={() => {}} limitReachedRoles={new Map([["Buvette", 2]])} dayLabel="samedi 24 octobre" />)
    expect(screen.getByRole("button")).toHaveTextContent("Complet")
    expect(screen.getByRole("button")).not.toHaveTextContent(/Limite/)
  })
})

// « Voir qui est inscrit » (#1068): a line under each shift with other confirmed volunteers.
describe("ShiftDayList with the roster", () => {
  afterEach(cleanup)
  const entry = (shiftId: string, names: string[], othersCount: number, own = false) =>
    ({ shiftId, label: "Buvette", date: "2031-06-06T00:00:00.000Z", startTime: "18:00", endTime: "22:00", names, othersCount, own })

  it("says who, read as the button's description, « M. » spoken as an initial; nothing without the switch", () => {
    const roster = new Map([["a", entry("a", ["Aline M.", "Luc D."], 2)], ["b", entry("b", [], 3)]])
    const shifts = [shift("a"), shift("b", { startTime: "10:00", endTime: "12:00" }), shift("c", { startTime: "08:00", endTime: "09:00" })]
    const { rerender } = render(<ShiftDayList shifts={shifts} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi" roster={roster} />)
    const a = screen.getByRole("button", { name: /^18h–22h/ })
    expect(a).toHaveAccessibleDescription("Sur ce créneau : Aline, initiale M, Luc, initiale D et 2 autres bénévoles.")
    expect(document.getElementById("roster-list-a")!.querySelector('[aria-hidden="true"]')!.textContent).toBe("Sur ce créneau : Aline\u00a0M., Luc\u00a0D. et 2 autres bénévoles.")
    expect(screen.getByRole("button", { name: /^10h–12h/ })).toHaveAccessibleDescription("Sur ce créneau : 3 autres bénévoles, sans nom affiché.")
    // Nobody else: no line.
    expect(document.getElementById("roster-list-c")).toBeNull()
    rerender(<ShiftDayList shifts={shifts} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi" roster={new Map([["a", entry("a", ["Chloé D.", "Élodie B."], 0)]])} />)
    // The initial's period ends the sentence: never « B.. ».
    expect(document.getElementById("roster-list-a")!.querySelector('[aria-hidden="true"]')!.textContent).toBe("Sur ce créneau : Chloé\u00a0D. et Élodie\u00a0B.")
    rerender(<ShiftDayList shifts={shifts} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi" roster={null} />)
    expect(screen.queryByText(/Sur ce créneau/)).toBeNull()
  })

  it("« Avec toi » on the viewer's own shift; the reason of a shift that can't be chosen is kept", () => {
    render(
      <>
        <p id="reserved-msg">Réservé à certains membres.</p>
        <ShiftDayList shifts={[shift("a"), shift("r", { startTime: "10:00", endTime: "12:00" })]} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi" reservedShiftIds={new Set(["r"])} reservedMessageId="reserved-msg"
          roster={new Map([["a", entry("a", ["Aline M."], 0, true)], ["r", entry("r", ["Zoé R."], 0)]])} />
      </>,
    )
    expect(screen.getByRole("button", { name: /^18h–22h/ })).toHaveAccessibleDescription("Avec toi : Aline, initiale M.")
    expect(screen.getByRole("button", { name: /^10h–12h/ })).toHaveAccessibleDescription("Sur ce créneau : Zoé, initiale R. Réservé à certains membres.")
  })
})
