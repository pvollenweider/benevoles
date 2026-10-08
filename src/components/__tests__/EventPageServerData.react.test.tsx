/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { renderToString } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"

// The public event page is server-rendered with its data (#773): the server page passes what the
// public API would send, so the schedule is in the first HTML instead of waiting for the
// JavaScript and a second request. The preview keeps fetching (EventPagePreview.react.test.tsx).

const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: "Rendez-vous à l'entrée.",
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [], questions: [],
  shifts: [{ id: "s1", roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
    capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null }],
} satisfies EventData

describe("EventPageClient — server-rendered data", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

  it("renders the event and its schedule in the server HTML, without « Chargement… »", () => {
    const html = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(html).toContain("Fête d&#x27;été")
    expect(html).toContain("Rendez-vous à l&#x27;entrée.")
    expect(html).toContain("samedi 1 juin")
    expect(html).toContain('data-shift-id="s1"')
    expect(html).not.toContain("Chargement")
  })

  it("does not fetch the event again once mounted", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(screen.getByRole("heading", { level: 1, name: "Fête d'été" })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("still picks up the volunteer's session from this browser", async () => {
    localStorage.setItem("benevoles_token_fete", "tok-1")
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ registrations: [] }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/api/public/registrations/tok-1"])
  })

  it("keeps the shift choice working: a bar toggles and « Continuer » appears", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    fireEvent.click(document.querySelector<HTMLElement>('[data-shift-id="s1"]')!)
    expect(screen.getAllByRole("button", { name: /Continuer \(1 nouveau créneau\)/ }).length).toBeGreaterThan(0)
  })
})
