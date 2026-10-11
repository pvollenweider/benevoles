/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"
import { REMEMBERED_CONTACT_KEY } from "@/lib/remembered-contact"

// #901: contact details remembered on the device fill another event's form, and can be erased.
const shift = (id: string, over: object = {}) => ({ id, roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
  capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, ...over })
const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [], questions: [],
  shifts: [shift("s1"), shift("s2", { roleName: "Cuisine", label: "Cuisine", startTime: "08:00", endTime: "10:00", status: "full", spotsLeft: 0, registered: 2 })],
} satisfies EventData


const remembered = { firstName: "Aline", lastName: "Exemple", email: "aline@example.org", phone: "079 000 00 00" }

function openForm() {
  render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
  fireEvent.click(screen.getByRole("button", { name: "Liste" }))
  fireEvent.click(screen.getByRole("button", { name: "10h–12h · Bar 2 places libres sur 2" }))
  fireEvent.click(screen.getAllByRole("button", { name: /^Continuer/ })[0])
}

describe("EventPageClient — remembered contact (#901)", () => {
  afterEach(() => { cleanup(); localStorage.clear() })

  it("leaves the form empty without a previous signup", () => {
    openForm()
    expect(screen.getByLabelText("Prénom *")).toHaveValue("")
    expect(screen.queryByText(/Coordonnées reprises/)).not.toBeInTheDocument()
  })

  it("fills the contact fields from this device's last signup and says so", () => {
    localStorage.setItem(REMEMBERED_CONTACT_KEY, JSON.stringify(remembered))
    openForm()
    expect(screen.getByLabelText("Prénom *")).toHaveValue("Aline")
    expect(screen.getByLabelText("Nom *")).toHaveValue("Exemple")
    expect(screen.getByLabelText("Email *")).toHaveValue("aline@example.org")
    expect(screen.getByText("Coordonnées reprises de ta dernière inscription sur cet appareil.")).toBeInTheDocument()
  })

  it("erases the fields and forgets them on a shared device", () => {
    localStorage.setItem(REMEMBERED_CONTACT_KEY, JSON.stringify(remembered))
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Ce n'est pas moi, effacer" }))
    expect(screen.getByLabelText("Prénom *")).toHaveValue("")
    expect(screen.getByLabelText("Email *")).toHaveValue("")
    expect(localStorage.getItem(REMEMBERED_CONTACT_KEY)).toBeNull()
    expect(screen.queryByText(/Coordonnées reprises/)).not.toBeInTheDocument()
  })
})
