/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react"

const push = vi.fn()
let search = ""
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"
import { EMBED_HEIGHT_MESSAGE, markReturnToSchedule } from "@/lib/embed"

// The sign-up embedded on the association's site (#948): no site chrome, links that leave the
// flow in a new tab, the height posted to the site around, and no crash without storage.

const shift = (id: string, over: object = {}) => ({ id, roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
  capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, ...over })
const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Amicale", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [{ slug: "infos", title: "Infos pratiques" }], questions: [],
  shifts: [shift("s1")],
} satisfies EventData

function renderPage(embed: boolean) {
  return render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} embed={embed} />)
}

function chooseShift() {
  fireEvent.click(screen.getByRole("button", { name: "Liste" }))
  fireEvent.click(screen.getByRole("button", { name: "10h–12h · Bar 2 places libres sur 2" }))
}

describe("EventPageClient — embedded (#948)", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    push.mockReset()
    search = ""
    localStorage.clear()
  })

  it("keeps the organisation and the event, drops the « Retour » link and the site footer", () => {
    renderPage(true)
    expect(screen.getByRole("heading", { level: 1, name: "Fête d'été" })).toBeInTheDocument()
    expect(screen.getByRole("banner")).toHaveTextContent("Amicale")
    expect(screen.queryByRole("link", { name: /Retour/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Espace organisateur" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Guide bénévole" })).not.toBeInTheDocument()
  })

  it("opens what leaves the flow in a new tab, and says so", () => {
    renderPage(true)
    const page = screen.getByRole("link", { name: "Infos pratiques (ouvre dans un nouvel onglet)" })
    expect(page).toHaveAttribute("target", "_blank")
    expect(page).toHaveAttribute("href", "/fete/infos")
    const footer = screen.getByRole("contentinfo")
    const links = within(footer).getAllByRole("link")
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank")
      expect(link).toHaveAccessibleName(/ouvre dans un nouvel onglet\)$/)
    }
  })

  it("is unchanged outside the frame: « Retour » and the site footer", () => {
    renderPage(false)
    expect(screen.getByRole("link", { name: /Retour/ })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: "Espace organisateur" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Infos pratiques" })).not.toHaveAttribute("target")
  })

  it("puts « Continuer » in the flow of the page, not in a fixed bar, and focuses the form's title", () => {
    renderPage(true)
    chooseShift()
    const buttons = screen.getAllByRole("button", { name: /^Continuer/ })
    for (const b of buttons) expect(b.closest(".fixed")).toBeNull()
    fireEvent.click(buttons[buttons.length - 1])
    expect(screen.getByRole("heading", { name: "Tes informations" })).toHaveFocus()
  })

  it("gives the focus back to « Continuer » when going back from the form, in every mode", () => {
    // jsdom lays nothing out: every element counts as displayed here.
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
    renderPage(false)
    chooseShift()
    const before = screen.getAllByRole("button", { name: /^Continuer/ })
    fireEvent.click(before[0])
    expect(screen.getByRole("heading", { name: "Tes informations" })).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }))
    expect(document.activeElement).toHaveAttribute("data-continue")
  })

  it("focuses the event's title when coming back from the embedded confirmation", () => {
    markReturnToSchedule()
    renderPage(true)
    expect(screen.getByRole("heading", { level: 1, name: "Fête d'été" })).toHaveFocus()
  })

  it("posts its height to the site around the frame, a number under a namespaced type", () => {
    const postMessage = vi.fn()
    vi.spyOn(window, "parent", "get").mockReturnValue({ postMessage } as unknown as Window)
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 812.4 } as DOMRect)
    renderPage(true)
    expect(postMessage).toHaveBeenCalledWith({ type: EMBED_HEIGHT_MESSAGE, height: 813 }, "*")
  })

  it("posts nothing when the page is not in a frame", () => {
    const postMessage = vi.spyOn(window, "postMessage")
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
    renderPage(true)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it("works without storage (a third-party frame with blocked site data) and signs up", async () => {
    const refuse = () => { throw new DOMException("The operation is insecure.", "SecurityError") }
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse)
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ editToken: "tok-1" }), { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    search = "org=club&groupe=abcd2345&embed=1"

    renderPage(true)
    chooseShift()
    const buttons = screen.getAllByRole("button", { name: /^Continuer/ })
    fireEvent.click(buttons[buttons.length - 1])
    fireEvent.change(screen.getByLabelText("Prénom *"), { target: { value: "Aline" } })
    fireEvent.change(screen.getByLabelText("Nom *"), { target: { value: "Exemple" } })
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "aline@example.org" } })
    fireEvent.click(screen.getByLabelText(/J.ai lu et j.accepte la/))
    fireEvent.click(screen.getByLabelText(/J.accepte que l.association/))
    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon inscription" }))

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
    const url = new URL(push.mock.calls[0][0], "https://club.benevol.app")
    expect(url.pathname).toBe("/fete/success")
    expect(Object.fromEntries(url.searchParams)).toEqual({ token: "tok-1", org: "club", groupe: "abcd2345", embed: "1" })
  })
})
