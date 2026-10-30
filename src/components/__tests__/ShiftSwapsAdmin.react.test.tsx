/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import ShiftSwapsPanel from "@/components/admin/registrations/ShiftSwapsPanel"
import EventShiftSwapsOption from "@/components/admin/EventShiftSwapsOption"
import OrgShiftSwapsDefaultForm from "@/components/admin/OrgShiftSwapsDefaultForm"
import type { OrganiserSwap } from "@/lib/shift-swap-data"

// The organisers' side of shift swaps (#1174): approving or refusing from the registrations page
// (a confirmation, the revision shown, focus to the heading once done), and the event option, which
// asks before cancelling the requests under way.

const bar = { id: "s-bar", roleName: "Bar", label: "Bar", date: "2030-07-04", startTime: "10:00", endTime: "12:00", locationDetails: null, instructions: null }
const barSun = { ...bar, id: "s-bar-sun", date: "2030-07-05", startTime: "14:00", endTime: "16:00" }
const waiting: OrganiserSwap = {
  requestId: "q1", status: "approval", revision: 2, deadline: "2030-07-04T08:00:00.000Z", needsApproval: true,
  requester: { volunteerId: "v-pierre", name: "Pierre Dupont", shift: bar }, counterpart: { volunteerId: "v-jean", name: "Jean Martin", shift: barSun }, endMessage: null, updatedAt: "2030-06-01T08:00:00.000Z",
}

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset() })

describe("ShiftSwapsPanel (#1174)", () => {
  it("lists what each person gives and receives, and approves with the revision after a confirmation", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, requestId: "q1", status: "applied" }))
    vi.stubGlobal("fetch", fetchMock)
    render(<ShiftSwapsPanel eventId="evt-1" requests={[waiting]} timeZone="Europe/Zurich" />)
    expect(screen.getByText(/cède Bar, jeudi 4 juillet, de 10h à 12h, reçoit Bar, vendredi 5 juillet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Valider l'échange, Pierre Dupont et Jean Martin" }))
    const dialog = await screen.findByRole("dialog", { name: "Valider cet échange ?" })
    fireEvent.click(dialog.querySelector("button[type=submit]") ?? screen.getAllByRole("button", { name: "Valider l'échange" }).at(-1)!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/swaps/q1", expect.objectContaining({ method: "POST", body: JSON.stringify({ approve: true, revision: 2 }) })))
    await waitFor(() => expect(screen.getByRole("heading", { name: /Échanges de créneaux/ })).toHaveFocus())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Échange validé et effectué entre Pierre Dupont et Jean Martin."))
    expect(refresh).toHaveBeenCalled()
  })

  it("a decision that finds the swap settled meanwhile is an alert, never a success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Cet échange a déjà été effectué.", status: "applied" }, 409)))
    render(<ShiftSwapsPanel eventId="evt-1" requests={[waiting]} timeZone="Europe/Zurich" />)
    fireEvent.click(screen.getByRole("button", { name: "Refuser, Pierre Dupont et Jean Martin" }))
    await screen.findByRole("alertdialog", { name: "Refuser cet échange ?" })
    fireEvent.click(screen.getAllByRole("button", { name: "Refuser l'échange" }).at(-1)!)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cet échange a déjà été effectué."))
    expect(screen.getByRole("status")).toHaveTextContent("")
    expect(screen.getByRole("heading", { name: /Échanges de créneaux/ })).toHaveFocus()
  })

  it("drops the pending result when the panel is unmounted before it is said (no update after unmount)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true, requestId: "q1", status: "applied" })))
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout")
    const { unmount } = render(<ShiftSwapsPanel eventId="evt-1" requests={[waiting]} timeZone="Europe/Zurich" />)
    fireEvent.click(screen.getByRole("button", { name: "Valider l'échange, Pierre Dupont et Jean Martin" }))
    const dialog = await screen.findByRole("dialog", { name: "Valider cet échange ?" })
    fireEvent.click(dialog.querySelector("button[type=submit]")!)
    // The focus moves and the result is scheduled in the same step: the timer is pending here.
    await waitFor(() => expect(screen.getByRole("heading", { name: /Échanges de créneaux/ })).toHaveFocus())
    const announce = setTimeoutSpy.mock.calls.findIndex(([, ms]) => ms === 150)
    expect(announce).toBeGreaterThanOrEqual(0)
    unmount()
    // Left pending, it ran after the test file's jsdom was gone (« window is not defined »).
    expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[announce].value)
    setTimeoutSpy.mockRestore()
    clearTimeoutSpy.mockRestore()
  })

  it("says when nothing waits for approval", () => {
    render(<ShiftSwapsPanel eventId="evt-1" requests={[]} timeZone="Europe/Zurich" />)
    expect(screen.getByText("Aucun échange n'attend votre validation.")).toBeInTheDocument()
  })
})

describe("EventShiftSwapsOption (#1174)", () => {
  it("asks before switching swaps off while requests are under way, then sends the confirmation", async () => {
    const bodies: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      return body.confirm ? json({ shiftSwapsEnabled: false, shiftSwapsApproval: false }) : json({ error: "2 demandes d'échange en cours seront annulées et les bénévoles concernés prévenus par email.", openCount: 2 }, 409)
    }))
    render(<EventShiftSwapsOption eventId="evt-1" initialEnabled initialApproval={false} />)
    const toggle = screen.getByRole("switch", { name: "Autoriser les demandes d'échange de créneaux" })
    expect(screen.getByRole("switch", { name: "Valider chaque échange" })).toBeInTheDocument()
    fireEvent.click(toggle)
    const dialog = await screen.findByRole("alertdialog", { name: "Désactiver les échanges de créneaux ?" })
    expect(dialog).toHaveTextContent("2 demandes d'échange en cours seront annulées")
    expect(toggle).toHaveAttribute("aria-checked", "true")
    fireEvent.click(screen.getByRole("button", { name: "Désactiver et annuler les demandes" }))
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"))
    expect(bodies).toEqual([{ enabled: false }, { enabled: false, confirm: true }])
  })
})

describe("OrgShiftSwapsDefaultForm (#1174)", () => {
  it("names the checkbox by its label only, the hint as its description", () => {
    render(<OrgShiftSwapsDefaultForm initialValue />)
    const box = screen.getByRole("checkbox", { name: "Autoriser les demandes d'échange de créneaux pour les nouveaux événements" })
    expect(box).toBeChecked()
    expect(box).toHaveAccessibleDescription(/Valeur de départ de l'option/)
  })
})
