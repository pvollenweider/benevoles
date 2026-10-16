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
