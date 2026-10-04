/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import MemberDuplicatesManager, { type DuplicatePairView } from "@/components/admin/MemberDuplicatesManager"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const pair = (idA: string, idB: string, nameA: string, nameB: string): DuplicatePairView => ({
  memberIdA: idA,
  memberIdB: idB,
  signals: ["name"],
  score: 6,
  reasons: ["Même nom et prénom, après normalisation — un homonyme n'est pas forcément la même personne."],
  memberA: { id: idA, firstName: nameA.split(" ")[0], lastName: nameA.split(" ")[1], active: true },
  memberB: { id: idB, firstName: nameB.split(" ")[0], lastName: nameB.split(" ")[1], active: true },
})

describe("MemberDuplicatesManager", () => {
  it("lists each pair with its reasons in words, and label-in-name buttons naming both members", () => {
    render(
      <MemberDuplicatesManager
        initialPairs={[pair("a", "b", "Jean Dupont", "Jean Dupont")]}
        isOwner={true}
      />,
    )
    expect(screen.getByText(/Même nom et prénom/)).toBeInTheDocument()
    const dismiss = screen.getByRole("button", { name: /^Ignorer.*Jean Dupont et Jean Dupont/ })
    expect(dismiss).toBeInTheDocument()
    const mergeLink = screen.getByRole("link", { name: /^Comparer et fusionner.*Jean Dupont et Jean Dupont/ })
    expect(mergeLink).toHaveAttribute("href", "/admin/members/a/merge?with=b")
  })

  it("shows a plain sentence instead of a merge link for an organizer (not owner)", () => {
    render(<MemberDuplicatesManager initialPairs={[pair("a", "b", "Jean Dupont", "Jean Dupont")]} isOwner={false} />)
    expect(screen.queryByRole("link", { name: /Comparer et fusionner/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Seul·e un·e propriétaire/)).toBeInTheDocument()
  })

  it("dismissing a pair removes it, announces once, and moves focus to the next pair", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
    render(
      <MemberDuplicatesManager
        initialPairs={[pair("a", "b", "Jean Dupont", "Jean Dupont"), pair("c", "d", "Marie Keller", "Marie Keller")]}
        isOwner={true}
      />,
    )
    const firstDismiss = screen.getByRole("button", { name: /^Ignorer.*Jean Dupont et Jean Dupont/ })
    await act(async () => { fireEvent.click(firstDismiss) })

    await waitFor(() => expect(screen.queryByText(/Jean Dupont et Jean Dupont/)).not.toBeInTheDocument())
    expect(screen.getAllByText(/Marie Keller et Marie Keller/).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Paire ignorée : Jean Dupont et Jean Dupont/))
    // Focus moved to the remaining pair's row (not dropped to <body>).
    expect(document.activeElement?.textContent).toMatch(/Marie Keller et Marie Keller/)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("moves focus to the empty-state message once the last pair is dismissed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
    render(<MemberDuplicatesManager initialPairs={[pair("a", "b", "Jean Dupont", "Jean Dupont")]} isOwner={true} />)
    const dismiss = screen.getByRole("button", { name: /^Ignorer/ })
    await act(async () => { fireEvent.click(dismiss) })
    await waitFor(() => expect(screen.getByText(/Aucune paire possible en double/)).toBeInTheDocument())
    expect(document.activeElement?.textContent).toMatch(/Aucune paire possible en double/)
  })

  it("prefilters to the given member's own pairs, with a way back to the full list", () => {
    render(
      <MemberDuplicatesManager
        initialPairs={[pair("a", "b", "Jean Dupont", "Jean Dupont"), pair("c", "d", "Marie Keller", "Marie Keller")]}
        isOwner={true}
        prefilterMemberId="a"
      />,
    )
    expect(screen.getAllByText(/Jean Dupont et Jean Dupont/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Marie Keller et Marie Keller/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Voir toutes les paires" }))
    expect(screen.getAllByText(/Marie Keller et Marie Keller/).length).toBeGreaterThan(0)
  })

  it("a failed dismiss is announced once, through the alert only (not also the status live region)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Panne du serveur." }) }))
    render(<MemberDuplicatesManager initialPairs={[pair("a", "b", "Jean Dupont", "Jean Dupont")]} isOwner={true} />)
    const dismiss = screen.getByRole("button", { name: /^Ignorer/ })
    await act(async () => { fireEvent.click(dismiss) })

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Panne du serveur.")
    expect(screen.getByRole("status")).toHaveTextContent("")
    // The pair is still there: nothing was removed on a failed dismiss.
    expect(screen.getAllByText(/Jean Dupont et Jean Dupont/).length).toBeGreaterThan(0)
  })

  it("shows a named empty state for a prefiltered member with no suggested pair, with an owner's merge-picker link", () => {
    render(
      <MemberDuplicatesManager
        initialPairs={[pair("c", "d", "Marie Keller", "Marie Keller")]}
        isOwner={true}
        prefilterMemberId="x"
        prefilterMemberName="Alix Perret"
      />,
    )
    expect(screen.getByText("Aucun doublon suggéré pour Alix Perret.")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "Chercher une autre fiche à fusionner" })
    expect(link).toHaveAttribute("href", "/admin/members/x/merge")
  })

  it("shows the same empty state for an organizer, with a members-search link prefilled by the name instead", () => {
    render(
      <MemberDuplicatesManager
        initialPairs={[]}
        isOwner={false}
        prefilterMemberId="x"
        prefilterMemberName="Alix Perret"
      />,
    )
    expect(screen.getByText("Aucun doublon suggéré pour Alix Perret.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Chercher une autre fiche à fusionner" })).not.toBeInTheDocument()
    const link = screen.getByRole("link", { name: "Chercher Alix Perret dans les membres" })
    expect(link).toHaveAttribute("href", "/admin/members?q=Alix%20Perret")
  })
})
