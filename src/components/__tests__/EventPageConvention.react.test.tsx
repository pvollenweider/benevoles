// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

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

// No convention asked (#1468): the sign-up form shows only the data consent, and a page loaded
// before the organisation turned the convention on falls back to the failure message when the
// server refuses it.

const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: null,
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, hasOrgInsurance: true,
  volunteerConventionEnabled: false, pages: [], questions: [],
  shifts: [{
    id: "s1", roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z",
    startTime: "10:00", endTime: "12:00", capacity: 2, registered: 0, spotsLeft: 2, status: "open",
    locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null,
  }],
} satisfies EventData

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

async function openForm() {
  render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
  fireEvent.click(document.querySelector<HTMLElement>('[data-shift-id="s1"]')!)
  fireEvent.click(screen.getAllByRole("button", { name: /^Continuer/ })[0])
  const heading = await screen.findByRole("heading", { name: "Tes informations" })
  // The step's own focus lands on the form title once; wait for it before submitting.
  await waitFor(() => expect(heading).toHaveFocus())
  fireEvent.change(document.getElementById("reg-firstname")!, { target: { value: "Léa" } })
  fireEvent.change(document.getElementById("reg-lastname")!, { target: { value: "Martin" } })
  fireEvent.change(document.getElementById("reg-email")!, { target: { value: "lea@example.org" } })
}

describe("EventPageClient without a convention", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

  it("shows no convention box, link or dialog, and still requires the data consent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({})))
    await openForm()
    expect(screen.queryByRole("checkbox", { name: /convention des bénévoles/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "convention des bénévoles" })).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("checkbox", { name: /J'accepte que l'association/ })).not.toBeChecked()

    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon inscription" }))
    await waitFor(() => expect(document.getElementById("reg-consent")).toHaveFocus())
    expect(screen.getByText("Coche la case d'accord sur tes données pour t'inscrire.")).toBeInTheDocument()
  })

  it("falls back to the failure message when the convention was turned on after the page loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({
      error: "Coche « J'ai lu et j'accepte la convention des bénévoles », puis confirme à nouveau. Si la case n'apparaît pas, recharge la page.",
      field: "charterAccepted",
    }, 400)))
    await openForm()
    fireEvent.click(screen.getByRole("checkbox", { name: /J'accepte que l'association/ }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon inscription" }))

    await waitFor(() => expect(document.getElementById("signup-failure")).toHaveFocus())
    expect(document.getElementById("signup-failure")).toHaveTextContent("recharge la page")
    expect(document.getElementById("reg-charter")).toBeNull()
  })
})
