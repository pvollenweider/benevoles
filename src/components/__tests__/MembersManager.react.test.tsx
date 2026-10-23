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

  it("« Annuler » (cancel) returns focus to the row's « Modifier » button — nothing was clicked to open it", async () => {
    setup()
    expect(await screen.findByRole("dialog", { name: "Modifier le membre" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Modifier Alice Verify" })).toHaveFocus()
  })

  it("Escape does the same", async () => {
    setup()
    const dialog = await screen.findByRole("dialog", { name: "Modifier le membre" })
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Modifier Alice Verify" })).toHaveFocus()
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
    expect(screen.getByRole("button", { name: "Modifier Alice Deux" })).toHaveFocus()
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

// #927: at 1280 px the row actions ran past the table's edge (min-w 64rem). #1102: the page is
// wider for this list, so the actions sit on one line (no more stacking), each keeping its own box
// and target size; a table still too wide scrolls in its region.
describe("MembersManager — row actions on one line, never past the table's edge", () => {
  it("lays the actions out in one flex row, in a table of 56rem minimum", () => {
    render(
      <MembersManager
        initialMembers={[member({ id: "a", addressStatus: { kind: "to_verify", since: "2026-03-01T00:00:00.000Z" } })]}
        allTags={[]}
        defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }}
      />,
    )
    const table = screen.getByRole("table", { name: "Liste des membres" })
    expect(table).toHaveClass("min-w-[56rem]")
    expect(table).not.toHaveClass("min-w-[64rem]")
    const edit = screen.getByRole("button", { name: "Modifier Alice Martin" })
    const row = edit.parentElement!
    expect(row).toHaveClass("flex", "flex-nowrap", "gap-1")
    const actions = [
      screen.getByRole("link", { name: "Activité de Alice Martin" }),
      edit,
      screen.getByRole("button", { name: "Doublon ? Voir les doublons possibles de Alice Martin" }),
      screen.getByRole("button", { name: "Désactiver Alice Martin" }),
    ]
    for (const a of actions) {
      expect(a.parentElement).toBe(row)
      expect(a).toHaveClass("min-h-11", "sm:min-h-6")
    }
  })
})

// #1014: absorbed and erased records, behind their own filter, each with one sentence.
describe("MembersManager — absorbed and erased records", () => {
  const members = [
    member({ id: "keep", firstName: "Marie", lastName: "Dupont" }),
    member({ id: "old", firstName: "Paul", lastName: "Ancien", active: false, deletion: { eligible: true } }),
    member({ id: "tomb", firstName: "", lastName: "", email: null, active: false, record: { kind: "merged", keptId: "keep", keptName: "Marie Dupont", deletionDay: "2026-11-14" } }),
    // Eligible for deletion by the rule alone (inactive, no registration): the row still offers no « Supprimer ».
    member({ id: "erased", firstName: "Bénévole", lastName: "effacé", email: null, active: false, deletion: { eligible: true }, record: { kind: "erased", erasedDay: "2026-03-03" } }),
  ]
  const setup = () => render(<MembersManager initialMembers={members} allTags={[]} defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }} />)

  it("are neither listed nor counted by default, and « Inclure inactifs » shows only ordinary inactive members", () => {
    setup()
    expect(screen.getByText("2 membres")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Inclure inactifs" }))
    expect(screen.getByRole("link", { name: "Activité de Paul Ancien" })).toBeInTheDocument()
    expect(screen.queryByText("Fiche fusionnée")).toBeNull()
    expect(screen.queryByText(/Données effacées/)).toBeNull()
  })

  it("their own checkbox, with their number, shows the two row states with their explanation", () => {
    setup()
    fireEvent.click(screen.getByRole("checkbox", { name: "Inclure les fiches fusionnées ou effacées (2)" }))
    const mergedRow = screen.getByText("Fiche fusionnée").closest("tr")!
    expect(mergedRow).toHaveTextContent("Fusionnée dans Marie Dupont · supprimée automatiquement à partir du 14 novembre 2026")
    expect(within(mergedRow).getByRole("link", { name: "Marie Dupont" })).toHaveAttribute("href", "/admin/members/keep")
    expect(within(mergedRow).getByText("14 novembre 2026").tagName).toBe("TIME")
    expect(within(mergedRow).getByRole("link", { name: "Activité de la fiche fusionnée dans Marie Dupont" })).toHaveAttribute("href", "/admin/members/tomb")

    const erasedRow = screen.getByText("Bénévole effacé").closest("tr")!
    expect(erasedRow).toHaveTextContent("Données effacées · gardée pour l'historique (effectifs et heures)")
    expect(within(erasedRow).getByRole("link", { name: "Activité de la fiche effacée le 3 mars 2026" })).toBeInTheDocument()

    // Neither can be edited, deactivated or deleted: no dead buttons on their rows.
    for (const row of [mergedRow, erasedRow]) expect(within(row).queryByRole("button")).toBeNull()
  })

  it("the checkbox is absent when there is no such record", () => {
    render(<MembersManager initialMembers={[members[0], members[1]]} allTags={[]} defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }} />)
    expect(screen.queryByRole("checkbox", { name: /fusionnées ou effacées/ })).toBeNull()
  })

  it("a deep-linked edit never opens for an archived record", () => {
    render(<MembersManager initialMembers={members} allTags={[]} initialEditId="erased" defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }} />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("MembersManager — table layout (#1102)", () => {
  const HINT = /Le tableau est plus large que l'écran/
  const renderList = () => render(
    <MembersManager
      initialMembers={[member({ id: "a", firstName: "Gwendoline", lastName: "Montmollin", email: "gwendoline.de.montmollin@long-address.example.org", phone: "079 123 45 67", tags: ["permis B"] })]}
      allTags={["permis B"]}
      defaultHoursPeriod={{ from: "2026-01-01", to: "2026-12-31" }}
    />,
  )
  const stubWidths = (scrollWidth: number, clientWidth: number) => {
    const sw = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth)
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth)
    return () => { sw.mockRestore(); cw.mockRestore() }
  }

  it("marks its root so the admin page widens for it", () => {
    const { container } = renderList()
    expect(container.firstElementChild).toHaveAttribute("data-admin-wide")
  })

  it("keeps the row actions on one line, with their names unchanged", () => {
    renderList()
    const edit = screen.getByRole("button", { name: "Modifier Gwendoline Montmollin" })
    const actions = edit.parentElement!
    expect(actions).toHaveClass("flex-nowrap", "whitespace-nowrap")
    expect(actions).not.toHaveClass("flex-wrap")
    expect(within(actions).getByRole("link", { name: "Activité de Gwendoline Montmollin" })).toBeInTheDocument()
    expect(within(actions).getByRole("button", { name: "Désactiver Gwendoline Montmollin" })).toBeInTheDocument()
  })

  it("contains the sr-only parts of the action names in the scroll region (no page-level sideways scroll)", () => {
    renderList()
    expect(screen.getByRole("region", { name: "Liste des membres" })).toHaveClass("relative", "overflow-x-auto")
  })

  it("wraps a long address and keeps tags and phone numbers whole", () => {
    renderList()
    expect(screen.getByText("gwendoline.de.montmollin@long-address.example.org")).toHaveClass("[overflow-wrap:anywhere]")
    expect(screen.getByText("079 123 45 67")).toHaveClass("whitespace-nowrap")
    expect(screen.getByText("permis B", { selector: "span" })).toHaveClass("whitespace-nowrap")
  })

  it("shows no scroll cue when the table fits", () => {
    const restore = stubWidths(1246, 1246)
    try {
      renderList()
      expect(screen.queryByText(HINT)).toBeNull()
      expect(screen.getByRole("region", { name: "Liste des membres" })).not.toHaveAttribute("aria-describedby")
    } finally { restore() }
  })

  it("shows the cue, as the region's description, when the table is wider than its region", () => {
    const restore = stubWidths(1076, 341)
    try {
      renderList()
      const hint = screen.getByText(HINT)
      const region = screen.getByRole("region", { name: "Liste des membres" })
      expect(region).toHaveAttribute("aria-describedby", hint.id)
      // Before the region in reading order.
      expect(hint.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally { restore() }
  })
})
