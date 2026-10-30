/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import RequestDecisionModal from "../admin/registrations/RequestDecisionModal"
import RecentCancellations from "../admin/registrations/RecentCancellations"
import ShiftSwapsPanel from "../admin/registrations/ShiftSwapsPanel"
import type { Registration } from "../admin/registrations/types"
import type { OrganiserSwap } from "@/lib/shift-swap-data"

// Dated availability (#1146, lot B): accepting a request, « Rétablir » and validating a swap ask for
// the acknowledgement inline, in their confirmation dialog, when a person said they are not
// available at the hours they would hold.

/** A paragraph whose whole text is `text` (the fit's state is in its own span). */
const paragraph = (text: string) => (_: string, el: Element | null) => el?.tagName === "P" && el.textContent === text
const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const outsideFit = (shiftId: string, ackKey: string) => ({ inUse: true, fits: [{ shiftId, state: "outside", label: "Pas disponible à ces heures", detail: "", ackKey }] })
const freeFit = (shiftId: string) => ({ inUse: true, fits: [{ shiftId, state: "full", label: "Disponible sur tout le créneau", detail: "", ackKey: null }] })

/** A fetch answering the fit reads with `fits` (by volunteerId) and every action with `action()`. */
function server(fits: Record<string, unknown>, action: (body: Record<string, unknown>) => ReturnType<typeof json>) {
  const actions: Record<string, unknown>[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/availability/fit?")) return json(fits[new URL(url, "http://x").searchParams.get("volunteerId")!] ?? { inUse: false, fits: [] })
    const body = JSON.parse(String(init?.body ?? "{}"))
    actions.push(body)
    return action(body)
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, actions }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset() })

const shift = { id: "s1", roleName: "Bar", label: "Soir", date: "2030-07-11", startTime: "14:00", endTime: "20:00", capacity: 3, registrationCount: 1 }
const reg: Registration = {
  id: "r1", status: "requested", source: "public_form", comment: null, phone: null, createdAt: "2030-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: "v1", firstName: "Nadia", lastName: "Rochat", email: "nadia@example.org", phone: null },
  shift, isLeader: false, checkedInAt: null,
}

describe("accepting a request outside declared availability", () => {
  it("shows the fit and the box, refuses to send without the tick, then sends the key", async () => {
    const { actions } = server({ v1: outsideFit("s1", "key-1") }, () => json({ status: "active" }))
    const onDecided = vi.fn()
    render(<RequestDecisionModal eventId="evt-1" reg={reg} kind="accept" waitlist={false} availability onCancel={() => {}} onDecided={onDecided} />)
    const box = await screen.findByRole("checkbox", { name: "Accepter quand même : je sais que Nadia n'a pas indiqué être disponible à ces heures" })
    expect(box).toHaveAccessibleDescription("Disponibilités indiquées : Pas disponible à ces heures.")
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => /Nadia Rochat : pas disponible à ces heures\. Une confirmation est demandée avant d'accepter la demande/.test(s.textContent ?? ""))).toBe(true))

    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    expect(actions).toHaveLength(0)
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveAccessibleDescription(/^Cochez cette case pour accepter la demande malgré ses disponibilités/)

    fireEvent.click(box)
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    await waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(actions).toEqual([{ decision: "accept", availabilityAck: ["key-1"] }])
  })

  it("asks nothing for a person free then, and reads nothing for a refusal or an event without the option", async () => {
    const { fetchMock, actions } = server({ v1: freeFit("s1") }, () => json({ status: "active" }))
    const { unmount } = render(<RequestDecisionModal eventId="evt-1" reg={reg} kind="accept" waitlist={false} availability onCancel={() => {}} onDecided={() => {}} />)
    await screen.findByText(paragraph("Disponibilités indiquées : Disponible sur tout le créneau."))
    expect(screen.queryByRole("checkbox")).toBeNull()
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    await waitFor(() => expect(actions).toEqual([{ decision: "accept" }]))
    unmount()
    fetchMock.mockClear()
    render(<RequestDecisionModal eventId="evt-1" reg={reg} kind="accept" waitlist={false} onCancel={() => {}} onDecided={() => {}} />)
    render(<RequestDecisionModal eventId="evt-1" reg={reg} kind="refuse" waitlist={false} availability onCancel={() => {}} onDecided={() => {}} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("« Rétablir » when the answer changed meanwhile", () => {
  const row = { id: "c1", volunteerId: "v2", shiftId: "s2", volunteerName: "Chloé Roy", hasEmail: true, shift: "Bar, vendredi 11 juillet, de 14h à 20h", previousStatus: "active" as const, cancelled: "Annulée par la personne le 30 juin à 14:05", blocked: null }

  it("keeps the dialog and the new-link choice, unticks the box, says why and focuses it; no second error", async () => {
    const { actions } = server({ v2: outsideFit("s2", "key-old") }, (body) => ((body.availabilityAck as string[] | undefined)?.includes("key-new")
      ? json({ status: "active" })
      : json({ error: "Chloé Roy a indiqué…", code: "availability", outside: [{ volunteerId: "v2", shiftId: "s2", key: "key-new", state: "partial", label: "Disponible sur une partie du créneau", detail: "Libre 1 h sur 6 h." }] }, 409)))
    render(<RecentCancellations rows={[row]} eventId="evt-1" availability />)
    fireEvent.click(screen.getByRole("button", { name: /^Rétablir/ }))
    const box = await screen.findByRole("checkbox", { name: /^Rétablir quand même : je sais que Chloé Roy/ })
    fireEvent.click(box)
    fireEvent.click(screen.getByRole("checkbox", { name: /envoyer un nouveau lien/ }))
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /^Rétablir quand même/ })).toHaveFocus())
    const fresh = screen.getByRole("checkbox", { name: /^Rétablir quand même/ })
    expect(fresh).not.toBeChecked()
    expect(fresh).toHaveAccessibleDescription(/^Les disponibilités de Chloé Roy ont changé entre-temps\. Cochez cette case pour rétablir l'inscription/)
    expect(screen.getByText(paragraph("Disponibilités indiquées : Disponible sur une partie du créneau. Libre 1 h sur 6 h."))).toBeInTheDocument()
    expect(screen.getByRole("dialog").querySelector("[role=alert]")).toHaveTextContent("")
    expect(screen.getByRole("checkbox", { name: /envoyer un nouveau lien/ })).toBeChecked()

    fireEvent.click(fresh)
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(actions.at(-1)).toEqual({ newLink: true, availabilityAck: ["key-new"] })
    // The message is said 150 ms after the focus move: wait for it, so that no timer outlives the test.
    await waitFor(() => expect(screen.getByText("Inscription de Chloé Roy rétablie, avec un nouveau lien personnel.")).toBeInTheDocument())
  })
})

describe("a fit that could not be read", () => {
  it("says so, and a refusal then asks for the tick without claiming the answer changed", async () => {
    const actions: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/availability/fit?")) return json({ error: "Erreur" }, 500)
      actions.push(JSON.parse(String(init?.body)))
      return json({ error: "Refus", code: "availability", outside: [{ volunteerId: "v1", shiftId: "s1", key: "key-1", state: "outside", label: "Pas disponible à ces heures", detail: "" }] }, 409)
    }))
    render(<RequestDecisionModal eventId="evt-1" reg={reg} kind="accept" waitlist={false} availability onCancel={() => {}} onDecided={() => {}} />)
    await screen.findByText("Disponibilités non vérifiées : elles le sont à la confirmation.")
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    const box = await screen.findByRole("checkbox", { name: /^Accepter quand même/ })
    await waitFor(() => expect(box).toHaveFocus())
    expect(box).toHaveAccessibleDescription(/^Cochez cette case pour accepter la demande/)
    expect(actions).toEqual([{ decision: "accept" }])
  })
})

describe("validating a swap", () => {
  const bar = { id: "s-bar", roleName: "Bar", label: "Bar", date: "2030-07-11", startTime: "10:00", endTime: "12:00", locationDetails: null, instructions: null }
  const barLate = { ...bar, id: "s-late", startTime: "14:00", endTime: "20:00" }
  const waiting: OrganiserSwap = {
    requestId: "q1", status: "approval", revision: 2, deadline: "2030-07-10T08:00:00.000Z", needsApproval: true,
    requester: { volunteerId: "v-pierre", name: "Pierre Dupont", shift: bar }, counterpart: { volunteerId: "v-jean", name: "Jean Martin", shift: barLate }, endMessage: null, updatedAt: "2030-06-01T08:00:00.000Z",
  }

  it("reads each person's fit for the shift they receive, names them, and sends their keys", async () => {
    const { fetchMock, actions } = server({ "v-pierre": outsideFit("s-late", "key-pierre"), "v-jean": outsideFit("s-bar", "key-jean") }, () => json({ ok: true, requestId: "q1", status: "applied" }))
    render(<ShiftSwapsPanel eventId="evt-1" requests={[waiting]} timeZone="Europe/Zurich" availability />)
    fireEvent.click(screen.getByRole("button", { name: "Valider l'échange, Pierre Dupont et Jean Martin" }))
    const pierre = await screen.findByRole("checkbox", { name: "Valider quand même : je sais que Pierre Dupont n'a pas indiqué être disponible à ces heures" })
    const jean = screen.getByRole("checkbox", { name: "Valider quand même : je sais que Jean Martin n'a pas indiqué être disponible à ces heures" })
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/availability/fit?volunteerId=v-pierre&shiftId=s-late")
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/availability/fit?volunteerId=v-jean&shiftId=s-bar")
    expect(pierre).toHaveAccessibleDescription("Disponibilités indiquées par Pierre Dupont pour le créneau reçu : Pas disponible à ces heures.")

    fireEvent.click(pierre)
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    expect(jean).toHaveFocus()
    expect(actions).toHaveLength(0)
    fireEvent.click(jean)
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    await waitFor(() => expect(actions).toEqual([{ approve: true, revision: 2, availabilityAck: ["key-pierre", "key-jean"] }]))
    // The result is said 150 ms after the focus move: wait for it, so that no timer outlives the test.
    await waitFor(() => expect(screen.getByText(/^Échange validé et effectué entre Pierre Dupont et Jean Martin\./)).toBeInTheDocument())
  })

  it("reads nothing to refuse a swap", async () => {
    const { fetchMock } = server({}, () => json({ ok: true, requestId: "q1", status: "refused" }))
    render(<ShiftSwapsPanel eventId="evt-1" requests={[waiting]} timeZone="Europe/Zurich" availability />)
    fireEvent.click(screen.getByRole("button", { name: "Refuser, Pierre Dupont et Jean Martin" }))
    await screen.findByRole("alertdialog")
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
