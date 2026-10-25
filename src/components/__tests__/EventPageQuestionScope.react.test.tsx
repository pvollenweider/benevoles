/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"

// Questions asked only for the postes of the shifts chosen (#1140): the form follows the selection.

const shift = (id: string, roleName: string, startTime: string, endTime: string) => ({
  id, roleName, label: roleName, description: null, date: "2030-06-01T00:00:00.000Z", startTime, endTime,
  capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null,
})
const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [],
  questions: [
    { id: "size", label: "Taille de t-shirt", type: "text", options: [], required: false },
    { id: "cash", label: "Déjà tenu une caisse ?", type: "yesno", options: [], required: true, displayScope: "roles", displayRoleNames: ["Bar"] },
  ],
  shifts: [shift("s1", "Parking", "08:00", "10:00"), shift("s2", "Bar", "12:00", "14:00")],
} satisfies EventData

const toggle = (id: string) => fireEvent.click(document.querySelector<HTMLElement>(`[data-shift-id="${id}"]`)!)
const proceed = () => fireEvent.click(screen.getAllByRole("button", { name: /Continuer/ })[0])

describe("EventPageClient — questions asked to some postes (#1140)", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()))
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

  it("a question of a poste not chosen is not on the form; it appears once one of its shifts is chosen", () => {
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    toggle("s1")
    proceed()
    expect(screen.getByLabelText(/Taille de t-shirt/)).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: /Déjà tenu une caisse/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }))
    toggle("s2")
    proceed()
    expect(screen.getByRole("group", { name: /Déjà tenu une caisse/ })).toBeInTheDocument()
  })
})
