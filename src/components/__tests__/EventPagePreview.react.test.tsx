/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("token=invite-123"),
}))

import EventPageClient from "@/app/[eventSlug]/EventPageClient"

// Preview mode of the public event page (#370): data from the admin preview API (drafts
// included), a visible « Aperçu » banner, no volunteer session or invitation picked up.

const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01", endDate: "2030-06-01", publicInstructions: null, confirmationMessage: null, requirePhone: false,
  showSchedule: [], volunteerCharter: null, pages: [{ slug: "faq", title: "FAQ" }], publicStatus: "draft",
  shifts: [{ id: "s1", roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
    capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null }],
}

describe("EventPageClient — preview mode", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("reads the admin preview API, shows the banner, and ignores sessions and invitations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => event })
    vi.stubGlobal("fetch", fetchMock)
    const getItem = vi.spyOn(Storage.prototype, "getItem")

    render(<EventPageClient orgSlug="org" eventSlug="fete" preview={{ eventId: "evt-1", adminEventUrl: "/admin/events/evt-1" }} />)

    expect(await screen.findByRole("heading", { level: 1, name: "Fête d'été" })).toBeInTheDocument()
    expect(screen.getByText(/alors que l'événement n'est pas encore publié/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Retour à l'événement" })).toHaveAttribute("href", "/admin/events/evt-1")
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/admin/events/evt-1/pages")

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toEqual(["/api/admin/events/evt-1/preview"])
    expect(getItem).not.toHaveBeenCalled()
    // Not a <main> inside the admin layout's <main>.
    expect(document.querySelector("main")).toBeNull()
  })

  it("the public page itself is unchanged: public API, no banner", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...event, publicStatus: undefined }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument())
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/public/fete?org=org")
    expect(screen.queryByText(/Aperçu/)).toBeNull()
    expect(document.querySelector("main")).not.toBeNull()
  })
})
