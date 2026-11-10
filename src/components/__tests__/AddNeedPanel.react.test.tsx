/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import AddNeedPanel from "../admin/AddNeedPanel"

// « Ajouter un besoin » on Jour J (#1304): creation and notification are two separate actions.

vi.mock("@/components/admin/OpenShiftsFinder", () => ({
  default: (props: {
    shifts: { id: string }[]
    registeredTodayDefault?: boolean
    pushDefaultOn?: boolean
    lockedShift?: boolean
    onSent?: (s: { sent: number; pushRequested?: boolean; pushDevices?: number }) => void
  }) => (
    <div data-testid="finder">
      <span>finder:{props.shifts.map((s) => s.id).join(",")}</span>
      <span>today:{String(props.registeredTodayDefault)}</span>
      <span>push:{String(props.pushDefaultOn)}</span>
      <span>locked:{String(props.lockedShift)}</span>
      <button type="button" onClick={() => props.onSent?.({ sent: 2, pushRequested: true, pushDevices: 3 })}>Simuler l&apos;envoi</button>
    </div>
  ),
}))

const shift = {
  id: "s-new", roleName: "Buvette", label: "Buvette", date: "2026-07-04", startTime: "14:00", endTime: "16:00",
  capacity: 2, status: "open", placesLeft: 2, reservedTags: [], minAge: null, assignedOnly: false, overlapAllowed: false,
}

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })

const renderPanel = (over: { registrationsOpen?: boolean; assignedOnly?: boolean } = {}) => {
  const onCreated = vi.fn(() => "Nouveau créneau : Buvette, de 14h à 16h. Il manque 2 personnes. Il est affiché sur le tableau.")
  const announce = vi.fn()
  const utils = render(
    <AddNeedPanel
      eventId="evt-1"
      today="2026-07-04"
      timeZone="Europe/Zurich"
      event={{ publicStatus: "published", registrationsOpen: over.registrationsOpen ?? true }}
      roles={["Buvette"]}
      onCreated={onCreated}
      announce={announce}
    />,
  )
  return { ...utils, onCreated, announce }
}

describe("AddNeedPanel", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("creates the shift, then loads the existing list: one creation, a visible notice, and no second shift on a retried load", async () => {
    let loads = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/admin/shifts") {
        return json({ ...shift, assignedOnly: false, sectorId: null }, 201)
      }
      if (url.includes("/open-shifts?shift=s-new")) {
        loads += 1
        if (loads === 1) return json({ error: "Indisponible" }, 500)
        return json({ shift, shifts: [shift], eventShifts: [], members: [], registrations: [], invites: [], declines: [], tags: [] })
      }
      throw new Error(`unexpected ${url}`)
    })
    const { onCreated, announce } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Ajouter un besoin" }))
    fireEvent.change(screen.getByLabelText(/^Poste/), { target: { value: "Buvette" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le créneau" }))

    expect(await screen.findByRole("heading", { level: 3, name: "Étape 2 sur 2 : prévenir" })).toBeInTheDocument()
    expect(screen.getByText(/Il est affiché sur le tableau/)).toBeInTheDocument()
    expect(onCreated).toHaveBeenCalledTimes(1)
    // Each step is said through the board's live region: the panel has none of its own, so the
    // page keeps a single role="status" (the day-of E2E specs rely on it).
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("Étape 2 sur 2"))
    expect(screen.queryAllByRole("status")).toHaveLength(0)
    const created = fetchMock.mock.calls.filter(([url]) => url === "/api/admin/shifts")
    expect(created).toHaveLength(1)
    expect(JSON.parse(created[0][1].body)).toMatchObject({ waitlistEnabled: false, roleName: "Buvette", capacity: 2, label: "Buvette" })

    // The list failed to load: retrying reads it again, never creates a second shift.
    expect(await screen.findByRole("alert")).toHaveTextContent("Indisponible")
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(await screen.findByTestId("finder")).toHaveTextContent("finder:s-new")
    expect(screen.getByTestId("finder")).toHaveTextContent("today:true")
    expect(screen.getByTestId("finder")).toHaveTextContent("push:true")
    expect(screen.getByTestId("finder")).toHaveTextContent("locked:true")
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/admin/shifts")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Simuler l'envoi" }))
    expect(screen.getByText(/2 personnes prévenues par email/)).toBeInTheDocument()
    expect(screen.getByText(/Notification aussi sur 3 appareils/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/admin/shifts")).toHaveLength(1)
  })

  it("creates the shift but says why nobody can be notified when registrations are closed", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/admin/shifts") return json({ ...shift, assignedOnly: false, sectorId: null }, 201)
      throw new Error(`unexpected ${url}`)
    })
    renderPanel({ registrationsOpen: false })

    fireEvent.click(screen.getByRole("button", { name: "Ajouter un besoin" }))
    fireEvent.change(screen.getByLabelText(/^Poste/), { target: { value: "Buvette" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le créneau" }))

    expect(await screen.findByText(/la case « Inscriptions ouvertes » de l'événement est décochée/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ouvrir les inscriptions" })).toHaveAttribute("href", "/admin/events/evt-1/edit")
    expect(screen.getByRole("link", { name: "Ajouter une personne à la main depuis les inscriptions" })).toHaveAttribute("href", "/admin/events/evt-1/registrations?shift=s-new")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/open-shifts"))).toBe(false)
  })

  it("never offers an assigned-only role by email, and leads to manual placement", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/admin/shifts") return json({ ...shift, assignedOnly: true, sectorId: null }, 201)
      throw new Error(`unexpected ${url}`)
    })
    renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Ajouter un besoin" }))
    fireEvent.change(screen.getByLabelText(/^Poste/), { target: { value: "Buvette" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le créneau" }))

    expect(await screen.findByText(/attribué par l'organisation uniquement/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ajouter une personne à la main depuis les inscriptions" })).toHaveAttribute("href", "/admin/events/evt-1/registrations?shift=s-new")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/open-shifts"))).toBe(false)
  })

  it("refuses an incomplete need before calling the API", async () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un besoin" }))
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le créneau" }))
    expect(await screen.findByText("Indiquez le poste du besoin.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
