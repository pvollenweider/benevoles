/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"
import { SHIFT_SHARE_AFTER_CLOSE_HINT, SHIFT_SHARE_HEADING, SHIFT_SHARE_UNAVAILABLE_NOTICE } from "@/lib/shift-share-links"

// Public page opened with a shift share link (#1386): one shift while it is bookable, the whole
// event with a short notice once it is not, and nothing revealed for an unknown code.

const shift = (id: string, over: object = {}) => ({
  id, roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
  capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, ...over,
})
const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, hasOrgInsurance: true, pages: [], questions: [],
  shifts: [shift("s1"), shift("s2", { roleName: "Cuisine", label: "Cuisine", startTime: "08:00", endTime: "10:00" })],
} satisfies EventData

const renderPage = (shiftShare: Parameters<typeof EventPageClient>[0]["shiftShare"]) =>
  render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} shiftShare={shiftShare} />)

afterEach(() => { cleanup(); localStorage.clear() })

describe("EventPageClient — shift share link (#1386)", () => {
  it("shows only the link's shift, with a line saying this is the shift the organisation needs", () => {
    renderPage({ kind: "bookable", code: "abcd2345", shiftId: "s1" })
    expect(screen.getByText(SHIFT_SHARE_HEADING)).toBeInTheDocument()
    expect(screen.queryByText("Cuisine")).toBeNull()
    expect(screen.getByRole("button", { name: /Bar/ })).toBeInTheDocument()
  })

  it("says the link accepts after the event's registrations closed", () => {
    render(
      <EventPageClient
        orgSlug="org"
        eventSlug="fete"
        initialEvent={{ ...event, registrationsOpen: false }}
        shiftShare={{ kind: "bookable", code: "abcd2345", shiftId: "s1" }}
      />,
    )
    expect(screen.getByText(SHIFT_SHARE_AFTER_CLOSE_HINT)).toBeInTheDocument()
  })

  it("shows the whole event with one notice when the shift is no longer bookable", () => {
    renderPage({ kind: "unavailable" })
    expect(screen.getByText(SHIFT_SHARE_UNAVAILABLE_NOTICE)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Cuisine/ })).toBeInTheDocument()
  })

  it("shows the page normally for an unknown code (no notice, whole event)", () => {
    renderPage({ kind: "none" })
    expect(screen.queryByText(SHIFT_SHARE_UNAVAILABLE_NOTICE)).toBeNull()
    expect(screen.queryByText(SHIFT_SHARE_HEADING)).toBeNull()
    expect(screen.getByRole("button", { name: /Cuisine/ })).toBeInTheDocument()
  })
})
