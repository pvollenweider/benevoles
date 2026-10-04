/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react"

// « Je ne suis pas disponible pour cet événement » (#558): a visible button from an invitation
// link, a confirmation step, then an acknowledgement with focus moved onto it. Never a state
// change on the plain GET that loads the page.

let search = new URLSearchParams({ token: "tok-1" })
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => search,
}))

import EventPageClient from "@/app/[eventSlug]/EventPageClient"

const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: null,
  startDate: "2030-07-06", endDate: "2030-07-06", publicInstructions: null, confirmationMessage: null, requirePhone: false,
  registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, timeZone: "Europe/Zurich", accentColorKey: null,
  showSchedule: [], volunteerCharter: null, pages: [],
  shifts: [
    { id: "s-bar", roleName: "Bar", label: "Bar", description: null, date: "2030-07-06T00:00:00.000Z", startTime: "10:00", endTime: "12:00", capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null },
  ],
}

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function stubFetch({ declined = false, declinePost = () => Promise.resolve(json({ success: true })) }: { declined?: boolean; declinePost?: () => Promise<unknown> } = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url.includes("/decline")) return declinePost()
    if (url.startsWith("/api/public/fete")) return Promise.resolve(json(event))
    if (url.startsWith("/api/public/member-invite/")) return Promise.resolve(json({ member: { firstName: "Léa", lastName: "M", email: "lea@x.ch", phone: "" }, reservedRolesAllowed: [], declined }))
    return Promise.resolve(json({}))
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("DeclineInvite on the public event page (#558)", () => {
  beforeEach(() => { search = new URLSearchParams({ token: "tok-1" }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("shows the button from an invitation link, asks for confirmation, then acknowledges and moves focus", async () => {
    stubFetch()
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    const button = await screen.findByRole("button", { name: "Je ne suis pas disponible pour cet événement" })
    fireEvent.click(button)

    const dialog = await screen.findByRole("alertdialog", { name: "Confirmer que tu n'es pas disponible ?" })
    expect(dialog).toBeInTheDocument()
    // Nothing was sent by opening the dialog alone (never a state change on a plain visit).
    expect(window.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/decline"), expect.anything())

    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))

    const result = await screen.findByText(/Tu as indiqué ne pas être disponible pour cet événement\./)
    await waitFor(() => expect(result).toHaveFocus())
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Je ne suis pas disponible pour cet événement" })).not.toBeInTheDocument()
  })

  it("shows the acknowledgement right away on a link that already declined, without posting again", async () => {
    const fetchMock = stubFetch({ declined: true })
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    await screen.findByText(/Tu as indiqué ne pas être disponible pour cet événement\./)
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false)
  })

  it("opens the confirmation step right away from the email's second link (?decline=1)", async () => {
    search = new URLSearchParams({ token: "tok-1", decline: "1" })
    stubFetch()
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    await screen.findByRole("alertdialog", { name: "Confirmer que tu n'es pas disponible ?" })
  })

  it("a failed confirmation says so and keeps the dialog open", async () => {
    stubFetch({ declinePost: () => Promise.resolve(json({ error: "x" }, 500)) })
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    fireEvent.click(await screen.findByRole("button", { name: "Je ne suis pas disponible pour cet événement" }))
    await screen.findByRole("alertdialog")
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    await screen.findByRole("alert")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  })

  it("focuses the result when the member-invite GET answers « already declined » while the auto-opened dialog is still showing", async () => {
    // The dialog opens immediately from `?decline=1`, before the member-invite GET (declined:
    // true, e.g. a second tab already confirmed it) has resolved — that GET resolving must still
    // move focus to the result, not leave it lost on <body> when the dialog unmounts (#558 a11y).
    search = new URLSearchParams({ token: "tok-1", decline: "1" })
    let resolveInvite!: (v: unknown) => void
    const invitePromise = new Promise((res) => { resolveInvite = res })
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/public/fete")) return Promise.resolve(json(event))
      if (url.startsWith("/api/public/member-invite/")) return invitePromise
      return Promise.resolve(json({}))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)

    await screen.findByRole("alertdialog", { name: "Confirmer que tu n'es pas disponible ?" })

    resolveInvite(json({ member: { firstName: "Léa", lastName: "M", email: "lea@x.ch", phone: "" }, reservedRolesAllowed: [], declined: true }))

    const result = await screen.findByText(/Tu as indiqué ne pas être disponible pour cet événement\./)
    await waitFor(() => expect(result).toHaveFocus())
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("is not offered once the visitor already has a registration on this event", async () => {
    // A session token in localStorage with a live registration hides the button: per the open
    // question, declining is not offered again once the invite led to a registration.
    window.localStorage.setItem("benevoles_token_fete", "tok-session")
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/public/fete")) return Promise.resolve(json(event))
      if (url.startsWith("/api/public/member-invite/")) return Promise.resolve(json({ member: { firstName: "Léa", lastName: "M", email: "lea@x.ch", phone: "" }, reservedRolesAllowed: [], declined: false }))
      if (url === "/api/public/registrations/tok-session") {
        return Promise.resolve(json({ registrations: [{ id: "r1", editToken: "tok-bar", status: "active", shift: { id: "s-bar", label: "Bar", roleName: "Bar", date: event.shifts[0].date, startTime: "10:00", endTime: "12:00" } }], volunteer: { firstName: "Léa", lastName: "M", email: "lea@x.ch" } }))
      }
      return Promise.resolve(json({}))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    await act(() => Promise.resolve())
    await waitFor(() => expect(screen.queryByRole("button", { name: "Je ne suis pas disponible pour cet événement" })).not.toBeInTheDocument())
    window.localStorage.clear()
  })
})
