/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within, waitFor, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import RegistrationsManager from "../admin/RegistrationsManager"
import { heldAnnouncement } from "@/lib/registrations-list"
import { UNDO_MS } from "@/lib/use-delayed-action"

// The registrations page's table and shift filter, as assistive technologies see them (#555).
const bar = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 1 }
const accueil = { id: "s2", roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "14:00", endTime: "16:00", capacity: 3, registrationCount: 1 }
const reg = (id: string, first: string, shift: typeof bar) => ({
  id, status: "active", source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: `v-${id}`, firstName: first, lastName: "Martin", email: `${id}@x.ch`, phone: null },
  shift, isLeader: false, checkedInAt: null,
})
const renderManager = () => render(
  <RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[bar, accueil]} initialRegistrations={[reg("r1", "Alice", bar), reg("r2", "Bob", accueil)]} />,
)

// The count paragraph: always the number of rows on the list, never a live region itself.
const hiddenCount = () => screen.getAllByText(/^\d+ inscriptions? affichées?$/).find((el) => !el.closest("[role=status]"))!
const outcome = () => screen.getByRole("status")

describe("RegistrationsManager — table and shift filter semantics", () => {
  afterEach(cleanup)

  it("captions the table, with column headers only", () => {
    renderManager()
    const table = screen.getByRole("table", { name: "Inscriptions" })
    expect(within(table).getAllByRole("columnheader").length).toBeGreaterThan(0)
    expect(within(table).queryAllByRole("rowheader")).toEqual([])
  })

  it("names the shift filter and filters with the keyboard", () => {
    renderManager()
    const filter = screen.getByRole("combobox", { name: "Filtrer par créneau" })
    expect(filter).toHaveTextContent("Tous les créneaux")
    fireEvent.keyDown(filter, { key: "a" })
    expect(screen.getByRole("listbox", { name: "Filtrer par créneau" })).toBeInTheDocument()
    fireEvent.keyDown(filter, { key: "Enter" })
    expect(hiddenCount()).toHaveTextContent("1 inscription affichée")
    expect(screen.queryByText("Alice Martin")).toBeNull()
    expect(screen.getByText("Bob Martin")).toBeInTheDocument()
  })
})

// #574: one live region on the page. A filter change says how many rows are left there; an
// addition or a removal says only its result, while the hidden count follows the list.
describe("RegistrationsManager — count announcements", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("has a single live region, the outcome one, and a hidden count that is not live", () => {
    renderManager()
    expect(document.querySelectorAll("[role=status], [aria-live]")).toHaveLength(1)
    expect(hiddenCount()).toHaveTextContent("2 inscriptions affichées")
    expect(hiddenCount()).not.toHaveAttribute("role")
    expect(hiddenCount()).not.toHaveAttribute("aria-live")
    expect(outcome()).toHaveTextContent("")
  })

  it("announces the count in the outcome region when the shift filter changes", async () => {
    renderManager()
    const filter = screen.getByRole("combobox", { name: "Filtrer par créneau" })
    fireEvent.keyDown(filter, { key: "a" })
    fireEvent.keyDown(filter, { key: "Enter" })
    await waitFor(() => expect(outcome().textContent).toBe("1 inscription affichée"))
    expect(hiddenCount()).toHaveTextContent("1 inscription affichée")
  })

  it("announces the count at once when the role filter changes", async () => {
    renderManager()
    fireEvent.change(screen.getByLabelText("Filtrer par poste"), { target: { value: "Bar" } })
    await waitFor(() => expect(outcome().textContent).toBe("1 inscription affichée"))
    fireEvent.change(screen.getByLabelText("Filtrer par poste"), { target: { value: "" } })
    await waitFor(() => expect(outcome().textContent).toBe("2 inscriptions affichées"))
  })

  it("waits for the typing to pause before announcing the search count", () => {
    vi.useFakeTimers()
    renderManager()
    const search = screen.getByLabelText("Rechercher un bénévole")
    fireEvent.change(search, { target: { value: "A" } })
    act(() => { vi.advanceTimersByTime(400) })
    fireEvent.change(search, { target: { value: "Al" } })
    act(() => { vi.advanceTimersByTime(400) })
    // Each keystroke restarts the wait: nothing said yet.
    expect(outcome().textContent).toBe("")
    expect(hiddenCount()).toHaveTextContent("1 inscription affichée")
    act(() => { vi.advanceTimersByTime(200) })
    expect(outcome().textContent).toBe("1 inscription affichée")
  })

  it("says only the removal after a bulk removal, the hidden count following the list", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
    renderManager()
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByRole("button", { name: "Retirer de leur créneau (1)" }))
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }))
    await waitFor(() => expect(outcome().textContent).toBe(heldAnnouncement(1, UNDO_MS / 1000)))
    expect(hiddenCount()).toHaveTextContent("1 inscription affichée")
    expect(screen.queryByText("Alice Martin")).toBeNull()
  })

  // Review of #580: the region holds one message at a time, the count never sits next to a result.
  it("replaces an action result and its journal link with the count after a filter change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ done: 1, changedIds: ["r1"] }) }))
    renderManager()
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent (1)" }))
    await waitFor(() => expect(outcome()).toHaveTextContent("1 personne marquée présente."))
    expect(within(outcome()).getByRole("link", { name: "Voir cette action dans le journal" })).toBeInTheDocument()
    expect(outcome()).not.toHaveClass("sr-only")

    fireEvent.change(screen.getByLabelText("Filtrer par poste"), { target: { value: "Accueil" } })
    await waitFor(() => expect(outcome().textContent).toBe("1 inscription affichée"))
    expect(outcome()).toHaveClass("sr-only")
    expect(within(outcome()).queryByRole("link")).toBeNull()
    expect(document.querySelectorAll("[role=status], [aria-live]")).toHaveLength(1)
  })

  it("replaces the count with the result after an action, without repeating the count", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
    renderManager()
    fireEvent.change(screen.getByLabelText("Filtrer par poste"), { target: { value: "Bar" } })
    await waitFor(() => expect(outcome().textContent).toBe("1 inscription affichée"))
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByRole("button", { name: "Retirer de leur créneau (1)" }))
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }))
    await waitFor(() => expect(outcome().textContent).toBe(heldAnnouncement(1, UNDO_MS / 1000)))
    expect(outcome().textContent).not.toMatch(/affichée/)
    expect(hiddenCount()).toHaveTextContent("0 inscription affichée")
  })

  it("never lets a count written a frame late overwrite a newer action result", async () => {
    // Frames run only when the test says so.
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
    const flushFrames = () => act(() => { frames.splice(0).forEach((cb) => cb(0)) })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ done: 2, alreadyLeader: 0 }) }))
    renderManager()
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Martin, /))
    fireEvent.click(screen.getByRole("button", { name: "Rendre responsable" }))
    // The filter changes: its count waits for the next frame.
    fireEvent.change(screen.getByLabelText("Filtrer par poste"), { target: { value: "Bar" } })
    fireEvent.click(screen.getByRole("button", { name: "Désigner" }))
    // The result is written at once, before that frame.
    const result = "2 responsables ajoutés.Voir cette action dans le journal"
    await waitFor(() => expect(outcome().textContent).toBe(result))
    flushFrames()
    expect(outcome().textContent).toBe(result)
  })
})
