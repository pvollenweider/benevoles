/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, waitFor, act } from "@testing-library/react"
import { renderToString } from "react-dom/server"

// « Je ne suis pas disponible » (#558) on the server-rendered event page (#773): the button is in
// the first HTML, before the member-invite GET answers. That answer must not take focus on a
// plain page load, the ?decline=1 dialog must not be in the server HTML (no focus trap nor Escape
// before hydration), and if the visitor's session then hides the component, focus must not fall
// to <body>.

let search = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => search,
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"

const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: null,
  startDate: "2030-07-06T00:00:00.000Z", endDate: "2030-07-06T00:00:00.000Z", publicInstructions: null, confirmationMessage: null,
  requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, timeZone: "Europe/Zurich",
  accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [], questions: [],
  shifts: [{ id: "s-bar", roleName: "Bar", label: "Bar", description: null, date: "2030-07-06T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
    capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null }],
} satisfies EventData

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const member = { firstName: "Léa", lastName: "M", email: "lea@x.ch", phone: "" }
const ACK = /Tu as indiqué ne pas être disponible pour cet événement\./

function deferred() {
  let resolve!: (v: unknown) => void
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

describe("DeclineInvite on the server-rendered event page (#773)", () => {
  beforeEach(() => { search = new URLSearchParams({ token: "inv-1" }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear() })

  it("an « already declined » answer on a plain load shows the acknowledgement without taking focus", async () => {
    const invite = deferred()
    vi.stubGlobal("fetch", vi.fn((url: string) => url.startsWith("/api/public/member-invite/") ? invite.promise : Promise.resolve(json({}))))
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(screen.getByRole("button", { name: "Je ne suis pas disponible pour cet événement" })).toBeInTheDocument()

    await act(async () => { invite.resolve(json({ member, reservedRolesAllowed: [], declined: true })) })

    const ack = await screen.findByText(ACK)
    expect(ack).not.toHaveFocus()
    expect(document.activeElement).toBe(document.body)
  })

  it("keeps the ?decline=1 dialog out of the server HTML and opens it once mounted", async () => {
    search = new URLSearchParams({ token: "inv-1", decline: "1" })
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(json(url.startsWith("/api/public/member-invite/") ? { member, reservedRolesAllowed: [], declined: false } : {}))))
    const html = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(html).not.toContain("alertdialog")
    expect(html).toContain("Je ne suis pas disponible pour cet événement")

    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const dialog = await screen.findByRole("alertdialog", { name: "Confirmer que tu n'es pas disponible ?" })
    await waitFor(() => expect(screen.getByRole("button", { name: "Non, annuler" })).toHaveFocus())
    expect(dialog).toBeInTheDocument()
  })

  it("moves focus to the event title when the visitor's session hides the open ?decline=1 dialog", async () => {
    search = new URLSearchParams({ token: "inv-1", decline: "1" })
    window.localStorage.setItem("benevoles_token_fete", "session-1")
    const session = deferred()
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/public/registrations/session-1") return session.promise
      if (url.startsWith("/api/public/member-invite/")) return Promise.resolve(json({ member, reservedRolesAllowed: [], declined: false }))
      return Promise.resolve(json({}))
    }))
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    await screen.findByRole("alertdialog")

    await act(async () => {
      session.resolve(json({
        registrations: [{ id: "r1", editToken: "reg-bar", status: "active", shift: { id: "s-bar", label: "Bar", roleName: "Bar", date: event.shifts[0].date, startTime: "10:00", endTime: "12:00" } }],
        volunteer: { firstName: "Léa", lastName: "M", email: "lea@x.ch" },
      }))
    })

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Fête d'été" })).toHaveFocus())
  })
})
