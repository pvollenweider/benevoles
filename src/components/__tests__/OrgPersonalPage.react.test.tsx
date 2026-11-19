/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react"

import OrgPersonalPage from "@/components/public/OrgPersonalPage"
import { CANCEL_CONTACTS_INTRO } from "@/lib/cancel-deadline"
import type { OrgPageData, OrgPageRegistration } from "@/lib/org-personal-page"

const reg = (over: Partial<OrgPageRegistration> & { id: string; status: string; date: string; title: string }): OrgPageRegistration => ({
  id: over.id,
  status: over.status,
  statusLabel: over.statusLabel ?? (over.status === "active" ? "Confirmé" : "Liste d'attente"),
  statusClass: over.statusClass ?? "bg-green-100 text-green-700",
  waitingPosition: over.waitingPosition ?? null,
  waitingExpiresAt: over.waitingExpiresAt ?? null,
  selfCancel: over.selfCancel ?? { allowed: true, deadline: null },
  shift: {
    id: `s-${over.id}`,
    roleName: "Bar",
    label: "Bar",
    date: `${over.date}T00:00:00.000Z`,
    startTime: "10:00",
    endTime: "12:00",
  },
  event: { id: `e-${over.id}`, title: over.title, slug: `fete`, publicStatus: "published" },
})

const base: OrgPageData = {
  volunteer: { firstName: "Léa", lastName: "M", email: "lea@example.ch" },
  organization: { name: "Asso", slug: "asso" },
  timeZone: "Europe/Zurich",
  nextId: "r1",
  registrations: [
    reg({ id: "r1", status: "active", date: "2031-05-02", title: "Fête" }),
    reg({ id: "r2", status: "waiting", date: "2031-05-03", title: "Café" }),
  ],
  orgHomeUrl: "https://asso.example",
  contactEmail: "contact@example.ch",
  scopeSentence: "Ce lien donne accès à toutes tes inscriptions auprès de Asso et permet de les modifier. Ne le partage pas.",
}

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const confirmButton = () => screen.getByRole("button", { name: "Oui, annuler" })
const keepButton = () => screen.getByRole("button", { name: "Non, garder" })

describe("OrgPersonalPage", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("has one h1, the scope sentence once, a real list and status in words", () => {
    render(<OrgPersonalPage token="tok" data={base} />)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Toutes mes inscriptions" })).toBeInTheDocument()
    expect(screen.getAllByText(/Ce lien donne accès à toutes tes inscriptions auprès de Asso/)).toHaveLength(1)
    expect(within(screen.getAllByRole("list")[0]).getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getAllByText("Confirmé").length).toBeGreaterThan(0)
    expect(screen.getByText("Liste d'attente")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Ton prochain créneau" })).toBeInTheDocument()
  })

  it("puts the list dates in h3, keeps the next card's date a paragraph, and adds the year when it differs", () => {
    render(<OrgPersonalPage token="tok" data={base} />)
    const dates = screen.getAllByRole("heading", { level: 3, name: /Vendredi 2 mai 2031/ })
    expect(dates).toHaveLength(1)
    // The next-shift preview keeps <p>: the same date is there, but not as a heading.
    expect(screen.getAllByText("Vendredi 2 mai 2031")).toHaveLength(2)
  })

  it("names each cancel button and event link with the spoken date and time, and the event", () => {
    render(<OrgPersonalPage token="tok" data={base} />)
    const button = screen.getByRole("button", { name: /Annuler le créneau Bar, vendredi 2 mai 2031, de 10h à 12h, pour Fête/ })
    expect(button).toBeInTheDocument()
    expect(button.getAttribute("aria-label")).not.toMatch(/[·–—]/)
    const link = screen.getAllByRole("link", { name: /Voir l'événement.*Fête.*vendredi 2 mai 2031.*de 10h à 12h/ })[0]
    expect(link).toHaveAttribute("href", "/mes-inscriptions/tok/evenement/e-r1")
  })

  it("links the cancel trigger to the deadline with aria-describedby", () => {
    const withDeadline: OrgPageData = {
      ...base,
      nextId: null,
      registrations: [reg({ id: "r1", status: "active", date: "2031-05-02", title: "Fête", selfCancel: { allowed: true, deadline: "2031-05-01T10:00:00.000Z" } })],
    }
    render(<OrgPersonalPage token="tok" data={withDeadline} />)
    const trigger = screen.getByRole("button", { name: /Annuler le créneau Bar/ })
    const deadline = document.getElementById("org-cancel-until-r1-until")
    expect(deadline).not.toBeNull()
    expect(trigger).toHaveAttribute("aria-describedby", "org-cancel-until-r1-until")
    expect(deadline).toHaveTextContent(/Tu peux annuler toi-même jusqu'au/)
  })

  it("opens a confirmation that says the shift, date, spoken time and event in one sentence", () => {
    render(<OrgPersonalPage token="tok" data={base} />)
    fireEvent.click(screen.getByRole("button", { name: /Annuler le créneau Bar.*Fête/ }))
    const dialog = screen.getByRole("alertdialog", { name: "Confirmer l'annulation ?" })
    expect(dialog).toHaveTextContent("Tu veux annuler le créneau Bar du vendredi 2 mai 2031, de 10h à 12h, pour Fête ?")
  })

  it("opens a confirmation with « Non, garder » focused, Escape returns to the trigger", async () => {
    render(<OrgPersonalPage token="tok" data={base} />)
    const trigger = screen.getByRole("button", { name: /Annuler le créneau Bar.*Fête/ })
    fireEvent.click(trigger)
    expect(screen.getByRole("alertdialog", { name: "Confirmer l'annulation ?" })).toBeInTheDocument()
    expect(keepButton()).toHaveFocus()
    fireEvent.keyDown(keepButton(), { key: "Escape" })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("cancels through the API, removes the shift, announces it with the event and moves focus to the next item's trigger", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "DELETE") return json({ success: true })
      return json({})
    })
    render(<OrgPersonalPage token="tok" data={base} />)
    fireEvent.click(screen.getByRole("button", { name: /Annuler le créneau Bar.*Fête/ }))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(screen.queryByText("Confirmé")).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith("/api/public/mes-inscriptions/tok", expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ registrationId: "r1" }),
    }))
    await waitFor(() => expect(screen.getAllByText(/Créneau annulé.*pour Fête/).length).toBeGreaterThan(0))
    // The visible answer takes the removed card's place; the status region carries the same words.
    expect(screen.getByText(/Créneau annulé.*pour Fête/, { selector: "li" })).toBeInTheDocument()
    // The waitlist entry next to it now receives the focus, not <body>.
    await waitFor(() => expect(screen.getByRole("button", { name: /Quitter la liste d'attente.*Café/ })).toHaveFocus())
  })

  it("shows a refusal in place, focuses its group after the 409, and keeps the shift", async () => {
    stubFetch((url, init) => init?.method === "DELETE" ? json({ error: "Le délai est passé.", reason: "deadline" }, 409) : json({}))
    render(<OrgPersonalPage token="tok" data={base} />)
    fireEvent.click(screen.getByRole("button", { name: /Annuler le créneau Bar/ }))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(screen.getByText("Le délai est passé.")).toBeInTheDocument())
    await waitFor(() => expect(document.getElementById("org-cancel-closed-r1")).toHaveFocus())
    expect(screen.getAllByText("Confirmé").length).toBeGreaterThan(0)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("does not duplicate ids when the next shift is already closed: the preview leaves the closed group to the list", () => {
    const closedNext: OrgPageData = {
      ...base,
      registrations: [reg({ id: "r1", status: "active", date: "2031-05-02", title: "Fête", selfCancel: { allowed: false, reason: "deadline" } })],
    }
    render(<OrgPersonalPage token="tok" data={closedNext} />)
    expect(document.querySelectorAll("#org-cancel-closed-r1")).toHaveLength(1)
    expect(document.querySelectorAll("#org-view-r1")).toHaveLength(1)
    expect(document.querySelectorAll("#org-view-r1-next")).toHaveLength(1)
    expect(screen.getByText(CANCEL_CONTACTS_INTRO)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "contact@example.ch" })).toHaveAttribute("href", "mailto:contact@example.ch")
  })

  it("shows the offer deadline under an offered place", () => {
    const offered: OrgPageData = {
      ...base,
      nextId: null,
      registrations: [reg({ id: "r1", status: "offered", date: "2031-05-02", title: "Fête", waitingExpiresAt: "2031-05-01T10:00:00.000Z", statusLabel: "Place proposée" })],
    }
    render(<OrgPersonalPage token="tok" data={offered} />)
    expect(screen.getByText(/Confirme avant/)).toBeInTheDocument()
  })

  it("shows a useful empty state after the last cancellation, with the organisation's page", async () => {
    stubFetch((url, init) => init?.method === "DELETE" ? json({ success: true }) : json({}))
    const only: OrgPageData = { ...base, nextId: "r1", registrations: [base.registrations[0]] }
    render(<OrgPersonalPage token="tok" data={only} />)
    fireEvent.click(screen.getByRole("button", { name: /Annuler le créneau Bar/ }))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aucun créneau à venir" })).toBeInTheDocument())
    expect(screen.getByRole("link", { name: "Voir les événements de l'organisation" })).toHaveAttribute("href", "https://asso.example")
    await waitFor(() => expect(screen.getByRole("heading", { name: "Aucun créneau à venir" })).toHaveFocus())
  })

  it("renews without showing the new link, then disables the actions", async () => {
    const message = "Ton lien a été renouvelé : un email avec le nouveau lien vient de partir. L'ancien lien ne fonctionne plus."
    stubFetch((url, init) => init?.method === "POST" ? json({ ok: true, message }) : json({}))
    render(<OrgPersonalPage token="tok" data={base} />)
    fireEvent.click(screen.getByRole("button", { name: "Renouveler mon lien" }))
    await waitFor(() => expect(screen.getAllByText(message).length).toBeGreaterThan(0))
    expect(screen.queryByRole("button", { name: /Annuler le créneau/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/new-token/)).not.toBeInTheDocument()
  })

  it("shows the renewal failure text with its next step", async () => {
    stubFetch((url, init) => init?.method === "POST"
      ? json({ error: "Trop de tentatives. Réessaie dans une heure." }, 429)
      : json({}))
    render(<OrgPersonalPage token="tok" data={base} />)
    fireEvent.click(screen.getByRole("button", { name: "Renouveler mon lien" }))
    expect(await screen.findByText("Trop de tentatives. Réessaie dans une heure.")).toBeInTheDocument()
    // The actions stay available: a failed renewal did not rotate the link.
    expect(screen.getAllByRole("button", { name: /Annuler le créneau/ }).length).toBeGreaterThan(0)
  })
})
