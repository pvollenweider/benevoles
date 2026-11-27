// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"

// The event allows overlapping shifts (#1467): at pick time the status says so, the recap warns
// in amber, and the confirm button references that one block. Never a refusal, never the red banner.

const shift = (id: string, startTime: string, endTime: string) => ({
  id, roleName: id, label: id, description: null, date: "2030-06-01T00:00:00.000Z", startTime, endTime,
  capacity: 4, registered: 0, spotsLeft: 4, status: "open", locationDetails: null, displayOrder: 0,
  waitlistEnabled: false, minAge: null, colorKey: null,
})
const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, hasOrgInsurance: true, pages: [], questions: [],
  volunteerConventionEnabled: false, overlapsAllowed: true, publicShiftView: "liste" as const,
  shifts: [shift("Bar", "10:00", "12:00"), shift("Accueil", "11:00", "13:00")],
} satisfies EventData

describe("EventPageClient — the event allows overlaps (#1467)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

  it("keeps the timeline bars selectable, with aria-pressed, and no conflict wording", () => {
    const frise = { ...event, publicShiftView: "frise" as const }
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={frise} />)
    const bar = document.querySelector<HTMLButtonElement>('[data-shift-id="Bar"]')!
    fireEvent.click(bar)
    const second = document.querySelector<HTMLButtonElement>('[data-shift-id="Accueil"]')!
    fireEvent.click(second)
    expect(second).toHaveAttribute("aria-pressed", "true")
    expect(second).not.toHaveAttribute("aria-disabled")
    expect(second.getAttribute("aria-label") ?? "").not.toMatch(/chevauche un créneau déjà choisi/)
  })

  it("keeps both shifts selectable, announces the overlap, and warns in the recap", async () => {
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const list = screen.getByRole("list", { name: /Créneaux du/ })
    fireEvent.click(within(list).getByRole("button", { name: /Bar/ }))
    fireEvent.click(within(list).getByRole("button", { name: /Accueil/ }))

    // Both stay selectable: the second is pressed, not disabled nor « en conflit ».
    const second = within(list).getByRole("button", { name: /Accueil/ })
    expect(second).toHaveAttribute("aria-pressed", "true")
    expect(second).not.toHaveAttribute("aria-disabled")
    await waitFor(() => expect(screen.getByText("Ce créneau est en même temps que « Bar ». C'est autorisé.")).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole("button", { name: /^Continuer/ })[0])
    await screen.findByRole("heading", { name: "Tes informations" })

    const block = document.getElementById("signup-recap-allowed-overlaps")!
    expect(block).toHaveTextContent("À vérifier : Ces deux créneaux ont lieu en même temps pendant 1 h.")
    expect(screen.queryByText(/retires-en un avant de confirmer/)).toBeNull()
    // The confirm button references the one block, in the card recap only (never the sidebar's copy).
    expect(document.querySelectorAll("#signup-recap-allowed-overlaps")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Confirmer mon inscription" })).toHaveAttribute("aria-describedby", "signup-recap-allowed-overlaps")
  })
})
