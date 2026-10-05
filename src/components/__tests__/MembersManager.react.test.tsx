/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetPointerOpenerForTests } from "@/lib/modal-opener"
import MembersManager from "@/components/admin/MembersManager"
import type { Member } from "@/lib/members-list"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }))

// « Adresses à vérifier » (#599): deep-linked edit modal focus fallback, debounced result count.

const member = (over: Partial<Member> & { id: string }): Member => ({
  firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: null, tags: [], active: true,
  hoursTotal: 0, hoursAttested: 0, lastShiftDate: null, lastPresenceDate: null, notes: null,
  addressStatus: { kind: "ok" }, deletion: { eligible: false, reason: "Cette fiche est encore active. Désactivez-la d'abord." }, ...over,
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

// Permanent deletion (#667): row action, confirmation, focus after deletion, announcement.
describe("MembersManager — deleting a member", () => {
  const period = { from: "2026-01-01", to: "2026-12-31" }

  afterEach(() => vi.unstubAllGlobals())

  it("shows « Supprimer » only for an eligible row, never a dead button for the others", () => {
    const members = [
      member({ id: "a", lastName: "Eligible", deletion: { eligible: true } }),
      member({ id: "b", lastName: "Active", active: true, deletion: { eligible: false, reason: "Cette fiche est encore active. Désactivez-la d'abord." } }),
    ]
    render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    expect(screen.getByRole("button", { name: "Supprimer Alice Eligible" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Supprimer Alice Active" })).toBeNull()
  })

  it("asks for confirmation in an alertdialog naming the person, irreversible, listing what goes with it", () => {
    const members = [member({ id: "a", lastName: "Un", deletion: { eligible: true } })]
    render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Alice Un" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer Alice Un ?" })
    expect(dialog).toHaveTextContent("irréversible")
    expect(dialog).toHaveTextContent("invitations")
  })

  it("« Annuler » closes without calling the API", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const members = [member({ id: "a", lastName: "Un", deletion: { eligible: true } })]
    render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Alice Un" }))
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("confirming posts to the delete route, announces the outcome, and moves focus to the next row's action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const members = [
      member({ id: "a", lastName: "Un", deletion: { eligible: true } }),
      member({ id: "b", lastName: "Deux" }),
    ]
    const { rerender } = render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Alice Un" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer Alice Un ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/members/a/delete", { method: "POST" }))
    await waitFor(() => expect(screen.getByText("Alice Un supprimé·e.")).toBeInTheDocument())
    // Simulates router.refresh() landing with the member gone (members is a direct prop, not
    // internal state — a real refresh would re-render this component with a new prop the same way).
    rerender(<MembersManager initialMembers={[members[1]]} allTags={[]} defaultHoursPeriod={period} />)
    expect(screen.getByRole("button", { name: "Éditer Alice Deux" })).toHaveFocus()
  })

  it("falls back to the page heading when no row remains", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const members = [member({ id: "a", lastName: "Seule", deletion: { eligible: true } })]
    const { rerender } = render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Alice Seule" }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    rerender(<MembersManager initialMembers={[]} allTags={[]} defaultHoursPeriod={period} />)
    expect(screen.getByRole("heading", { level: 1, name: "Membres" })).toHaveFocus()
  })

  it("a 409 from the route keeps the dialog open with the server's message, offers to retry, and moves focus to the retry button — never closes to flash the row's own button", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Cette fiche a des inscriptions, quel que soit leur statut : elles doivent rester dans l'historique des événements." }) })
    vi.stubGlobal("fetch", fetchMock)
    const members = [member({ id: "a", lastName: "Un", deletion: { eligible: true } })]
    render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Alice Un" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer Alice Un ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("a des inscriptions"))
    // The dialog is still here, with the row's own action never regaining focus in between.
    expect(screen.getByRole("alertdialog", { name: "Supprimer Alice Un ?" })).toBeInTheDocument()
    const retryButton = within(dialog).getByRole("button", { name: "Réessayer" })
    expect(retryButton).toHaveFocus()
    expect(screen.getByRole("button", { name: "Supprimer Alice Un" })).toBeInTheDocument()
  })

  it("retrying after a failure succeeds and closes the dialog normally", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Connexion impossible." }) })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const members = [member({ id: "a", lastName: "Un", deletion: { eligible: true } })]
    render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Alice Un" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer Alice Un ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Connexion impossible."))
    fireEvent.click(within(dialog).getByRole("button", { name: "Réessayer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() => expect(screen.getByText("Alice Un supprimé·e.")).toBeInTheDocument())
  })
})

describe("MembersManager — deactivating a member, failure keeps the dialog open (#667 accessibility review)", () => {
  const period = { from: "2026-01-01", to: "2026-12-31" }
  afterEach(() => vi.unstubAllGlobals())

  it("a failed deactivation keeps the dialog open with the server's message and moves focus to the retry button", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "La désactivation n'a pas abouti." }) })
    vi.stubGlobal("fetch", fetchMock)
    const members = [member({ id: "a", lastName: "Un", active: true })]
    render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={period} />)
    fireEvent.click(screen.getByRole("button", { name: "Désactiver Alice Un" }))
    const dialog = screen.getByRole("alertdialog", { name: "Désactiver Alice Un ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Désactiver" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La désactivation n'a pas abouti."))
    expect(screen.getByRole("alertdialog", { name: "Désactiver Alice Un ?" })).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Réessayer" })).toHaveFocus()
  })
})

describe("MembersManager — ?deleted= from the member page (#667)", () => {
  it("announces the deletion and focuses the heading, once", async () => {
    const members = [member({ id: "b", lastName: "Reste" })]
    render(
      <MembersManager initialMembers={members} allTags={[]} initialDeletedName="Julie Martin" defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }} />,
    )
    await waitFor(() => expect(screen.getByText("Julie Martin supprimé·e.")).toBeInTheDocument())
    expect(screen.getByRole("heading", { level: 1, name: "Membres" })).toHaveFocus()
  })
})
