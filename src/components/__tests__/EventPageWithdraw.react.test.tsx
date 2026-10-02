/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import EventPageClient from "@/app/[eventSlug]/EventPageClient"

// Withdrawing a held shift from the public event page (#584, #534): an alertdialog with a focus
// trap and Escape, focus first on « Non, garder ». The request keeps the dialog open; a failure is
// said in it and removes nothing; a success removes the row, announces the result once and moves
// focus to the row now at its place, else to the shift's bar.

const shift = (id: string, label: string, startTime: string, endTime: string, over: Record<string, unknown> = {}) => ({
  id, roleName: label, label, description: null, date: "2030-07-06T00:00:00.000Z", startTime, endTime,
  capacity: 2, registered: 1, spotsLeft: 1, status: "open", locationDetails: null, displayOrder: 0,
  waitlistEnabled: false, minAge: null, colorKey: null, ...over,
})

const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: null,
  startDate: "2030-07-06", endDate: "2030-07-06", publicInstructions: null, confirmationMessage: null, requirePhone: false,
  registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, timeZone: "Europe/Zurich", accentColorKey: null,
  showSchedule: [], volunteerCharter: null, pages: [],
  shifts: [
    shift("s-bar", "Bar", "10:00", "12:00"),
    shift("s-accueil", "Accueil", "14:00", "16:00", { status: "full", registered: 2, spotsLeft: 0, waitlistEnabled: true }),
  ],
}

const reg = (token: string, status: string, s: ReturnType<typeof shift>) => ({
  id: `r-${token}`, editToken: token, status, shift: { id: s.id, label: s.label, roleName: s.roleName, date: s.date, startTime: s.startTime, endTime: s.endTime },
})

const registrations = [reg("tok-bar", "active", event.shifts[0]), reg("tok-accueil", "waiting", event.shifts[1])]

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/** Stubs fetch: the event, the session's registrations, and DELETE answered by `del`. */
function stubFetch(del: () => Promise<unknown>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return del()
    if (url.startsWith("/api/public/fete")) return Promise.resolve(json(event))
    if (url === "/api/public/registrations/tok-bar") {
      return Promise.resolve(json({ registrations, volunteer: { firstName: "Chloé", lastName: "Roy", email: "c@example.com" } }))
    }
    return Promise.resolve(json({}))
  })
  vi.stubGlobal("fetch", fetchMock)
  return { deletes: () => fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE") }
}

async function renderPage(del: () => Promise<unknown> = () => Promise.resolve(json({ success: true }))) {
  const calls = stubFetch(del)
  render(<EventPageClient orgSlug="org" eventSlug="fete" />)
  await screen.findAllByRole("button", { name: "Annuler le créneau Bar" })
  return calls
}

// Both lists (mobile card and desktop sidebar) are in the DOM; jsdom applies no CSS. The first one.
const barX = () => screen.getAllByRole("button", { name: "Annuler le créneau Bar" })[0]
const accueilX = () => screen.getAllByRole("button", { name: "Quitter la liste d'attente du créneau Accueil" })[0]
const keep = () => screen.getByRole("button", { name: "Non, garder" })
const notice = () => document.getElementById("action-notice")!

/** Opens the dialog as a keyboard user does: focus on the ✕, then activate it. */
function open(trigger: HTMLElement) {
  act(() => trigger.focus())
  fireEvent.click(trigger)
  return screen.getByRole("alertdialog")
}

function confirm(name = "Oui, annuler") {
  const button = screen.getByRole("button", { name })
  act(() => button.focus())
  fireEvent.click(button)
  return button
}

describe("EventPageClient — withdrawing a held shift", () => {
  beforeEach(() => localStorage.setItem("benevoles_token_fete", "tok-bar"))
  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("the ✕ opens an alertdialog named after the withdrawal, with focus on « Non, garder »", async () => {
    await renderPage()
    const dialog = open(barX())
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAccessibleName("Confirmer l'annulation ?")
    expect(dialog).toHaveAccessibleDescription("Tu veux annuler le créneau Bar ?")
    expect(keep()).toHaveFocus()
  })

  it("traps Tab: from the last control to the first, and Shift+Tab back to the last", async () => {
    await renderPage()
    const dialog = open(barX())
    const last = screen.getByRole("button", { name: "Oui, annuler" })
    const first = screen.getByRole("button", { name: "Fermer" })
    act(() => last.focus())
    fireEvent.keyDown(last, { key: "Tab" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true })
    expect(last).toHaveFocus()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it("Escape and « Non, garder » close it and give focus back to the ✕", async () => {
    const { deletes } = await renderPage()
    open(barX())
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(barX()).toHaveFocus()

    open(barX())
    fireEvent.click(keep())
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(barX()).toHaveFocus()
    expect(deletes()).toHaveLength(0)
  })

  it("a backdrop click does not close it", async () => {
    await renderPage()
    const dialog = open(barX())
    fireEvent.click(dialog.parentElement!)
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  })

  it("confirming sends one DELETE; the button is aria-disabled while it runs and a second press sends nothing", async () => {
    const pending = deferred<unknown>()
    const { deletes } = await renderPage(() => pending.promise)
    open(barX())
    const button = confirm()
    expect(deletes()).toHaveLength(1)
    expect(String(deletes()[0][0])).toBe("/api/public/registrations/tok-bar")
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toHaveFocus()
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: "Escape" })
    expect(deletes()).toHaveLength(1)
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    await act(async () => { pending.resolve(json({ success: true })) })
  })

  it("on success: the row goes, the result is announced, focus moves to the row now at its place", async () => {
    await renderPage()
    open(barX())
    confirm()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.queryAllByRole("button", { name: "Annuler le créneau Bar" })).toHaveLength(0)
    expect(accueilX()).toHaveFocus()
    await waitFor(() => expect(notice()).toHaveTextContent("Créneau annulé : Bar, samedi 6 juillet, de 10h à 12h."))
    // The bar is offered again.
    expect(document.querySelector('[data-shift-id="s-bar"]')).toHaveAccessibleName(/^Sélectionner — Bar/)
  })

  it("on success with no row left: focus on the shift's bar in the schedule", async () => {
    await renderPage()
    open(barX())
    confirm()
    await waitFor(() => expect(accueilX()).toHaveFocus())
    open(accueilX())
    confirm("Oui, quitter")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(document.querySelector("[data-shift-list]")).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-shift-id="s-accueil"]'))
    await waitFor(() => expect(notice()).toHaveTextContent(/^Tu as quitté la liste d'attente : Accueil, /))
  })

  // Regression: the row used to be removed before the answer, whatever it was.
  it("DELETE 404: the dialog stays with the reason, focus stays on the confirm, nothing is removed", async () => {
    await renderPage(() => Promise.resolve(json({ error: "Inscription introuvable ou déjà annulée." }, 404)))
    open(barX())
    const button = confirm()
    const alert = await within(screen.getByRole("alertdialog")).findByText(/^Ce créneau était déjà annulé/)
    expect(alert).toHaveAttribute("role", "alert")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(button).toHaveFocus()
    expect(button).not.toHaveAttribute("aria-disabled")
    expect(barX()).toBeInTheDocument()
    expect(notice()).toHaveTextContent("")
  })

  it("a network failure is said in the dialog too, and nothing is removed", async () => {
    await renderPage(() => Promise.reject(new TypeError("Failed to fetch")))
    open(barX())
    confirm()
    await within(screen.getByRole("alertdialog")).findByText(/^La connexion a échoué/)
    expect(barX()).toBeInTheDocument()
  })

  it("a waitlist entry is asked « Quitter la liste d'attente ? »", async () => {
    await renderPage()
    const dialog = open(accueilX())
    expect(dialog).toHaveAccessibleName("Quitter la liste d'attente ?")
    expect(screen.getByRole("button", { name: "Oui, quitter" })).toBeInTheDocument()
  })
})

describe("EventPageClient — charter dialog", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  async function openCharter() {
    stubFetch(() => Promise.resolve(json({})))
    render(<EventPageClient orgSlug="org" eventSlug="fete" />)
    fireEvent.click((await screen.findAllByRole("button", { name: /^Sélectionner — Bar/ }))[0])
    fireEvent.click(screen.getAllByRole("button", { name: /^Continuer/ })[0])
    const link = screen.getByRole("button", { name: "convention des bénévoles" })
    act(() => link.focus())
    fireEvent.click(link)
    return link
  }

  it("is a modal with a trap, closes with Escape from anywhere and gives focus back to its link", async () => {
    const link = await openCharter()
    const dialog = screen.getByRole("dialog", { name: "Convention des Bénévoles" })
    expect(dialog).toHaveAttribute("aria-modal", "true")
    const close = screen.getByRole("button", { name: "Fermer" })
    expect(close).toHaveFocus()
    const accept = screen.getByRole("button", { name: "J'ai lu et j'accepte" })
    act(() => accept.focus())
    fireEvent.keyDown(accept, { key: "Tab" })
    expect(close).toHaveFocus()
    // Escape with focus outside the dialog (a click on the backdrop's empty area) still closes it.
    act(() => (document.activeElement as HTMLElement).blur())
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(link).toHaveFocus()
  })

  it("« J'ai lu et j'accepte » ticks the box and closes", async () => {
    const link = await openCharter()
    fireEvent.click(screen.getByRole("button", { name: "J'ai lu et j'accepte" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("checkbox", { name: /convention des bénévoles/ })).toBeChecked()
    expect(link).toHaveFocus()
  })
})
