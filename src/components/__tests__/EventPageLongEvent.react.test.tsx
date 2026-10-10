/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"

// #866: a season of weekly permanences shows one month at a time, past days left out.
const shift = (id: string, date: string) => ({ id, roleName: "Accueil", label: "Accueil", description: null, date: `${date}T00:00:00.000Z`, startTime: "14:00", endTime: "17:00",
  capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null })
// Wednesdays from 4 September to 6 November 2030: ten dates over three months.
const wednesdays = ["2030-09-04", "2030-09-11", "2030-09-18", "2030-09-25", "2030-10-02", "2030-10-09", "2030-10-16", "2030-10-23", "2030-10-30", "2030-11-06"]
const event = {
  id: "evt-1", slug: "saison", title: "Saison", organizationName: "Épicerie", description: null, location: null,
  startDate: "2030-09-01T00:00:00.000Z", endDate: "2031-06-30T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [], questions: [],
  shifts: wednesdays.map((d, i) => shift(`s${i}`, d)),
} satisfies EventData

const dayHeadings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).filter((t) => /septembre|octobre|novembre/.test(t ?? ""))

describe("EventPageClient — long events (#866)", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2030-09-12T10:00:00Z")) })
  afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers() })

  it("leaves past days out and shows one month at a time", () => {
    render(<EventPageClient orgSlug="org" eventSlug="saison" initialEvent={event} />)
    const nav = screen.getByRole("navigation", { name: "Mois" })
    const september = within(nav).getByRole("button", { name: /septembre 2030,\s*\(2 dates\)/i })
    expect(september).toHaveAttribute("aria-pressed", "true")
    // 4 and 11 September are over (today is the 12th): 18 and 25 remain.
    expect(dayHeadings()).toHaveLength(2)

    fireEvent.click(within(nav).getByRole("button", { name: /octobre 2030/i }))
    expect(within(nav).getByRole("button", { name: /octobre 2030/i })).toHaveAttribute("aria-pressed", "true")
    expect(dayHeadings()).toHaveLength(5)
  })

  it("shows every day of a short event, without months", () => {
    const short = { ...event, endDate: "2030-09-05T00:00:00.000Z", shifts: [shift("a", "2030-09-04"), shift("b", "2030-09-05")] }
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={short} />)
    expect(screen.queryByRole("navigation", { name: "Mois" })).not.toBeInTheDocument()
    expect(dayHeadings()).toHaveLength(2)
  })
})
