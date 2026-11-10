/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"

import OpenShiftsFinder from "../admin/OpenShiftsFinder"
import type { EventShiftRef, InviteRef, LiveRegistration, OpenShift, PoolMember } from "@/lib/open-shifts"

// « Chercher des bénévoles »: « Inscrits aujourd'hui », « Tout cocher » and the push option (#1304).

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const ref = (id: string, roleName: string, date: string, startTime: string, endTime: string): EventShiftRef => ({ id, roleName, label: roleName, date, startTime, endTime })
const s1 = ref("s1", "Bar", "2026-07-04", "14:00", "16:00")
const todayShift = ref("t1", "Accueil", "2026-07-04", "08:00", "10:00")
const overlapShift = ref("o1", "Caisse", "2026-07-04", "15:00", "17:00")
const shifts: OpenShift[] = [{ ...s1, placesLeft: 2, reservedTags: [] }]
const members: PoolMember[] = [
  { id: "ana", firstName: "Ana", lastName: "Abel", hasEmail: true, active: true, tags: [] },
  { id: "bob", firstName: "Bob", lastName: "Bez", hasEmail: true, active: true, tags: [] },
  { id: "dan", firstName: "Dan", lastName: "Dupont", hasEmail: true, active: true, tags: [] },
  { id: "carla", firstName: "Carla", lastName: "Costa", hasEmail: true, active: false, tags: [] },
]
const registrations: LiveRegistration[] = [
  { volunteerId: "ana", shiftId: "t1", status: "active" },
  { volunteerId: "bob", shiftId: "o1", status: "active" },
]
const invites: InviteRef[] = []

const renderFinder = () => render(
  <OpenShiftsFinder
    eventId="evt-1"
    shifts={shifts}
    eventShifts={[s1, todayShift, overlapShift]}
    members={members}
    registrations={registrations}
    invites={invites}
    declines={[]}
    tags={[]}
    initialShiftIds={["s1"]}
    today="2026-07-04"
    timeZone="Europe/Zurich"
    registeredTodayDefault
    pushDefaultOn
  />,
)

describe("OpenShiftsFinder", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows « Inscrits aujourd'hui » on, the push option on, and lists only today's members", () => {
    renderFinder()
    expect(screen.getByRole("checkbox", { name: "Inscrits aujourd'hui" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Envoyer aussi une notification sur le téléphone" })).toBeChecked()
    expect(screen.getByText("Ana Abel")).toBeInTheDocument()
    expect(screen.getByText("Bob Bez")).toBeInTheDocument()
    expect(screen.queryByText("Dan Dupont")).toBeNull()
    expect(screen.queryByText("Carla Costa")).toBeNull()
  })

  it("« Tout cocher » ticks the selectable people of the filtered list only, never an overlap", () => {
    renderFinder()
    fireEvent.click(screen.getByRole("button", { name: "Tout cocher" }))
    expect(screen.getByRole("checkbox", { name: "Ana Abel" })).toBeChecked()
    // Bob's registration overlaps the shift: listed, but never ticked.
    expect(screen.getByRole("checkbox", { name: "Bob Bez" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("checkbox", { name: "Bob Bez" })).not.toBeChecked()
    expect(screen.getByText(/1 personne cochée\./)).toBeInTheDocument()
  })

  it("removing the filter gives the usual list, and « Tout cocher » then takes its selectable members", () => {
    renderFinder()
    fireEvent.click(screen.getByRole("checkbox", { name: "Inscrits aujourd'hui" }))
    expect(screen.getByText("Dan Dupont")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Tout cocher" }))
    expect(screen.getByRole("checkbox", { name: "Ana Abel" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Dan Dupont" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Bob Bez" })).not.toBeChecked()
    const people = screen.getByText(/personnes? cochée/)
    expect(people).toHaveTextContent("2 personnes cochées")
    expect(within(screen.getByRole("group", { name: "Membres à qui proposer ces créneaux" })).queryByLabelText("Carla Costa")).toBeNull()
  })
})
