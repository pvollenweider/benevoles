/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { resetPointerOpenerForTests } from "@/lib/modal-opener"
import MembersManager from "@/components/admin/MembersManager"
import type { Member } from "@/lib/members-list"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

// « Adresses à vérifier » (#599): deep-linked edit modal focus fallback, debounced result count.

const member = (over: Partial<Member> & { id: string }): Member => ({
  firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: null, tags: [], active: true,
  hoursTotal: 0, hoursAttested: 0, lastShiftDate: null, lastPresenceDate: null, notes: null,
  addressStatus: { kind: "ok" }, ...over,
})

afterEach(() => {
  cleanup()
  resetPointerOpenerForTests()
  document.body.innerHTML = ""
})

describe("MembersManager — deep-linked edit modal (?edit=id), no opener recorded", () => {
  const members = [
    member({ id: "a", lastName: "Verify", addressStatus: { kind: "to_verify", since: "2026-03-01T00:00:00.000Z" } }),
    member({ id: "b", lastName: "Dupont" }),
  ]
  const setup = () => render(
    <MembersManager
      initialMembers={members}
      allTags={[]}
      initialEditId="a"
      defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }}
    />,
  )

  it("« Annuler » (cancel) returns focus to the row's « Éditer » button — nothing was clicked to open it", async () => {
    setup()
    expect(await screen.findByRole("dialog", { name: "Modifier le membre" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Éditer Alice Verify" })).toHaveFocus()
  })

  it("Escape does the same", async () => {
    setup()
    const dialog = await screen.findByRole("dialog", { name: "Modifier le membre" })
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Éditer Alice Verify" })).toHaveFocus()
  })

  it("falls back to the page heading when the row isn't there any more", async () => {
    // Deep-linked for a member that, by the time of cancelling, is no longer in the (client-only)
    // filtered view — simulated here by a members list that no longer contains that id at all.
    render(
      <MembersManager
        initialMembers={[member({ id: "ghost" })]}
        allTags={[]}
        initialEditId="missing"
        defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }}
      />,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("MembersManager — debounced result-count announcement", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const members = [
    member({ id: "a", firstName: "Zoé", lastName: "Roy" }),
    member({ id: "b", firstName: "Bob", lastName: "Durand" }),
  ]
  const setup = () => render(
    <MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }} />,
  )

  it("announces nothing on first render", () => {
    setup()
    const regions = screen.getAllByRole("status", { hidden: true })
    for (const r of regions) expect(r).toHaveTextContent("")
  })

  it("debounces the search box: typing several characters announces once, after the pause, not per keystroke", () => {
    setup()
    const search = screen.getByPlaceholderText("Rechercher (nom, email, téléphone)…")
    fireEvent.change(search, { target: { value: "B" } })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.change(search, { target: { value: "Bo" } })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.change(search, { target: { value: "Bob" } })
    // Still well inside the debounce window since the last keystroke: nothing announced yet.
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.queryByText("1 membre affiché.")).toBeNull()
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText("1 membre affiché.")).toBeInTheDocument()
  })

  it("announces the zero-results case in words", () => {
    setup()
    const search = screen.getByPlaceholderText("Rechercher (nom, email, téléphone)…")
    fireEvent.change(search, { target: { value: "nobody-matches-this" } })
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText("Aucun membre ne correspond.")).toBeInTheDocument()
  })

  it("also announces a discrete filter change (checkbox), after the same short pause", () => {
    setup()
    fireEvent.click(screen.getByRole("checkbox", { name: /Inclure inactifs/ }))
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText("2 membres affichés.")).toBeInTheDocument()
  })
})
