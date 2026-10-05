/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetPointerOpenerForTests } from "@/lib/modal-opener"
import MemberEraseAction from "@/components/admin/members/MemberEraseAction"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  cleanup()
  resetPointerOpenerForTests()
  document.body.innerHTML = ""
  refresh.mockClear()
  vi.unstubAllGlobals()
})

const counts = { registrations: 3, upcomingLive: 1, invites: 1, answers: 2, pushSubscriptions: 0, sectorLeaders: 0, tombstones: 0 }

// The member page's « Effacer les données personnelles » action (#516).

function openDialog() {
  render(<MemberEraseAction memberId="vol-1" memberName="Julie Martin" erasure={{ kind: "eligible", counts }} timeZone="Europe/Zurich" />)
  fireEvent.click(screen.getByRole("button", { name: "Effacer les données personnelles de Julie Martin" }))
  return screen.getByRole("alertdialog", { name: "Effacer les données personnelles de Julie Martin ?" })
}

describe("MemberEraseAction (#516)", () => {
  it("lists what is removed and kept, irreversible, with the word to type", () => {
    const dialog = openDialog()
    expect(dialog).toHaveTextContent("irréversible")
    // Headed lists, one item each (#516 accessibility review).
    expect(within(dialog).getByText("Effacé :")).toBeInTheDocument()
    expect(within(dialog).getByText("Conservé :").nextElementSibling?.tagName).toBe("UL")
    expect(within(dialog).getByText(/^3 inscriptions \(créneau/)).toBeInTheDocument()
    // The warning: visible « Attention : », its own paragraph.
    expect(within(dialog).getByText("Attention :").closest("p")).toHaveTextContent("Attention : 1 inscription à venir reste comptée")
    expect(within(dialog).getByLabelText("Pour confirmer, saisissez « effacer »")).toBeInTheDocument()
  })

  it("is described by the irreversible sentence and the warning only, not the whole recap nor the field's label", () => {
    const dialog = openDialog()
    expect(dialog).toHaveAccessibleDescription(
      "Cette action est irréversible : rien ne pourra être récupéré. Attention : 1 inscription à venir reste comptée dans les effectifs. Retirez-la d'abord si la personne ne viendra pas. ",
    )
  })

  it("does nothing until the word is typed, and says why", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const dialog = openDialog()
    fireEvent.click(within(dialog).getByRole("button", { name: "Effacer les données" }))
    expect(screen.getByRole("alert")).toHaveTextContent("ne correspond pas")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("confirming posts to the erase route, replaces the button with a focused notice and refreshes the page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, alreadyErased: false, erasedAt: "2026-10-05T22:30:00.000Z" }) })
    vi.stubGlobal("fetch", fetchMock)
    const dialog = openDialog()
    fireEvent.change(within(dialog).getByLabelText("Pour confirmer, saisissez « effacer »"), { target: { value: "effacer" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Effacer les données" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/members/vol-1/erase", { method: "POST" }))
    const notice = await screen.findByText(/ont été effacées/)
    expect(notice).toHaveFocus()
    // The API's date, in the organisation's zone: the same text the page shows after its refresh.
    expect(notice).toHaveTextContent("Effacement du 6 octobre 2026.")
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.queryByRole("button", { name: /Effacer les données/ })).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it("a failure keeps the dialog open with the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "L'effacement n'a pas pu être fait. Rien n'a été modifié." }) }))
    const dialog = openDialog()
    fireEvent.change(within(dialog).getByLabelText("Pour confirmer, saisissez « effacer »"), { target: { value: "effacer" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Effacer les données" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Rien n'a été modifié"))
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("an erased record shows the notice with its date, no button", () => {
    render(<MemberEraseAction memberId="vol-1" memberName="Bénévole effacé" erasure={{ kind: "erased", erasedAt: "2026-10-05T10:00:00.000Z" }} timeZone="Europe/Zurich" />)
    expect(screen.getByText(/ont été effacées\. .*Effacement du 5 octobre 2026\./)).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("a tombstone says why in words, never a dead button", () => {
    render(<MemberEraseAction memberId="vol-1" memberName="X" erasure={{ kind: "refused", reason: "C'est une fiche fusionnée dans une autre." }} timeZone="Europe/Zurich" />)
    expect(screen.getByText(/ne peuvent pas être effacées : c'est une fiche fusionnée/)).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
