/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"
import { INVALID_LINK_STEPS, LINK_REQUEST_RESPONSE, LOST_LINK_INTRO } from "@/lib/personal-link"

// « J'ai perdu mon lien personnel » on the event page (#1097): the request of the « Ce lien ne
// fonctionne pas » page, for a visitor without a session; the neutral answer only, no link.

const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: null,
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [], questions: [],
  shifts: [{ id: "s1", roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
    capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null }],
} satisfies EventData

const summary = () => screen.queryByText("J'ai perdu mon lien personnel")

describe("EventPageClient — lost link (#1097)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

  it("offers a closed disclosure with the request form, without the « why it fails » list", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const details = summary()!.closest("details")!
    expect(details).not.toHaveAttribute("open")
    expect(summary()!.closest("summary")).toBeInTheDocument()
    expect(details).toHaveTextContent(LOST_LINK_INTRO)
    expect(details).not.toHaveTextContent(INVALID_LINK_STEPS[0])
    expect(screen.getByRole("link", { name: /En savoir plus sur le lien personnel perdu/, hidden: true }))
      .toHaveAttribute("href", "/doc/lien-personnel#je-n-ai-plus-le-lien-vers-mes-inscriptions")
  })

  it("sends the address to the existing request and shows its neutral answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, message: LINK_REQUEST_RESPONSE }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const details = summary()!.closest("details")!
    details.open = true
    fireEvent.change(screen.getByLabelText(/Adresse email utilisée pour t.inscrire/), { target: { value: "lea@example.org" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir mon lien par email" }))
    await waitFor(() => expect(details).toHaveTextContent(LINK_REQUEST_RESPONSE))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/public/registrations/link")
    expect(JSON.parse(String(init.body))).toEqual({ email: "lea@example.org" })
    expect(details.querySelector("a[href^='/my/']")).toBeNull()
  })

  it("goes away once this browser holds a registration of the event", async () => {
    localStorage.setItem("benevoles_token_fete", "tok-1")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      registrations: [{ id: "r1", editToken: "tok-1", status: "active", shift: { id: "s1", label: "Bar", roleName: "Bar", date: event.shifts[0].date, startTime: "10:00", endTime: "12:00" } }],
      volunteer: { firstName: "Léa", lastName: "Roy", email: "lea@example.org" },
    }) }))
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    await screen.findByRole("button", { name: "Quitter la session" })
    expect(summary()).toBeNull()
  })
})
