/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetPointerOpenerForTests } from "@/lib/modal-opener"
import MemberDeleteAction from "@/components/admin/members/MemberDeleteAction"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  cleanup()
  resetPointerOpenerForTests()
  document.body.innerHTML = ""
  push.mockClear()
  vi.unstubAllGlobals()
})

// The member page's own « Supprimer » action (#667): no dead button when ineligible, a
// confirmation dialog otherwise, and a navigation (not an in-place announcement) on success.

describe("MemberDeleteAction — ineligible record", () => {
  it("shows the reason in words instead of a button", () => {
    render(<MemberDeleteAction memberId="vol-1" memberName="Julie Martin" deletion={{ eligible: false, reason: "Cette fiche est encore active. Désactivez-la d'abord." }} />)
    expect(screen.queryByRole("button", { name: /Supprimer/ })).toBeNull()
    expect(screen.getByText(/encore active/)).toBeInTheDocument()
  })
})

describe("MemberDeleteAction — eligible record", () => {
  it("asks for confirmation in an alertdialog naming the person, irreversible", () => {
    render(<MemberDeleteAction memberId="vol-1" memberName="Julie Martin" deletion={{ eligible: true }} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Julie Martin" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer Julie Martin ?" })
    expect(dialog).toHaveTextContent("irréversible")
  })

  it("confirming posts to the delete route and navigates to the members list with the name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    render(<MemberDeleteAction memberId="vol-1" memberName="Julie Martin" deletion={{ eligible: true }} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Julie Martin" }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/members/vol-1/delete", { method: "POST" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/members?deleted=Julie%20Martin"))
  })

  it("a 409 keeps the dialog open with the server's message and does not navigate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Cette fiche a des inscriptions, quel que soit leur statut : elles doivent rester dans l'historique des événements." }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<MemberDeleteAction memberId="vol-1" memberName="Julie Martin" deletion={{ eligible: true }} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Julie Martin" }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("a des inscriptions"))
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("« Annuler » closes without calling the API", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<MemberDeleteAction memberId="vol-1" memberName="Julie Martin" deletion={{ eligible: true }} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Julie Martin" }))
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
