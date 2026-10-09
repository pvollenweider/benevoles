/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react"

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
    // Not a <main> inside the admin layout's <main>, nor a second skip link (#534): the admin
    // layout has its own.
    expect(document.querySelector("main")).toBeNull()
    expect(screen.queryByRole("link", { name: "Aller au contenu" })).toBeNull()
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

  it("the public page starts with a skip link to its main content, the header outside main (#534)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...event, publicStatus: undefined }) }))
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    await screen.findByRole("heading", { level: 1 })
    const link = screen.getByRole("link", { name: "Aller au contenu" })
    expect(link).toHaveAttribute("href", "#main")
    // First focusable element of the page.
    expect(document.querySelector("a[href], button, input, select, textarea")).toBe(link)
    const main = document.querySelector("main")!
    expect(main).toHaveAttribute("id", "main")
    expect(main).toHaveAttribute("tabindex", "-1")
    expect(document.querySelectorAll("main")).toHaveLength(1)
    // The header is a banner (not inside main), the footer and the action status after main.
    expect(screen.getByRole("banner")).toContainElement(screen.getByRole("heading", { level: 1 }))
    expect(main.contains(screen.getByRole("banner"))).toBe(false)
    expect(main.contains(document.getElementById("action-notice"))).toBe(false)
    expect(main.contains(screen.getByRole("contentinfo"))).toBe(false)
    expect(main).toContainElement(screen.getByRole("region", { name: /^Planning/ }))
  })
  // WCAG 2.4.11: below lg the fixed « Continuer » bar covers the bottom of the viewport; the
  // footer gets room under it as soon as the bar shows, so a focused footer link stays visible.
  it("leaves room under the footer while the mobile « Continuer » bar is shown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...event, publicStatus: undefined }) }))
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    await screen.findByRole("heading", { level: 1 })
    const slot = () => screen.getByRole("contentinfo").parentElement!
    expect(slot()).not.toHaveClass("pb-28")
    fireEvent.click(screen.getByRole("button", { name: /, Bar : sélectionner/ }))
    await screen.findAllByRole("button", { name: /^Continuer/ })
    expect(slot()).toHaveClass("pb-28", "lg:pb-0")
  })
})
