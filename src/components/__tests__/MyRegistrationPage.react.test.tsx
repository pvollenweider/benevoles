/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok-bar" }) }))

import MyRegistrationPage from "@/app/my/[token]/page"

// Withdrawal on the personal page (#534): the confirmation takes focus and gives it back, Escape
// closes it, the request keeps it open, the result is announced once and focus lands on a
// neighbouring card; a failure keeps the page and says under the card that nothing was withdrawn.

const shift = (label: string, startTime: string, endTime: string) => ({
  label, date: "2026-07-04T00:00:00.000Z", startTime, endTime,
})

const bar = { id: "r-bar", editToken: "tok-bar", status: "active", shift: shift("Bar", "10:00", "12:00") }
const accueil = { id: "r-accueil", editToken: "tok-accueil", status: "waiting", waitingPosition: 1, shift: shift("Accueil", "14:00", "16:00") }

function pageData(registrations: unknown[]) {
  return {
    event: { id: "e1", title: "Fête d'été", slug: "fete" },
    volunteer: { firstName: "Chloé", lastName: "Roy", email: "chloe@example.com" },
    registrations,
    orgHomeUrl: "https://org.example",
    eventUrl: "https://org.example/fete",
    confirmationMessage: null,
  }
}

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

/** Stubs fetch: the page's GET answers `registrations`; DELETE answers with `del` (a promise, so a test can hold it). */
function stubFetch(registrations: unknown[], del: () => Promise<unknown>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return del()
    if (url === "/api/public/registrations/tok-bar") return Promise.resolve(json(pageData(registrations)))
    return Promise.resolve(json({}))
  })
  vi.stubGlobal("fetch", fetchMock)
  return { deletes: () => fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE") }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function renderPage(registrations: unknown[], del: () => Promise<unknown> = () => Promise.resolve(json({ success: true }))) {
  const calls = stubFetch(registrations, del)
  render(<MyRegistrationPage />)
  await screen.findByRole("heading", { level: 1, name: "Mes inscriptions" })
  return calls
}

// The page's own status region (the push button and the link panel have theirs).
const pageStatus = () => document.getElementById("withdraw-status")!
const barTrigger = () => screen.getByRole("button", { name: "Annuler le créneau Bar" })
const accueilTrigger = () => screen.getByRole("button", { name: "Quitter la liste d'attente du créneau Accueil" })

/** Opens Bar's confirmation as a keyboard user does: focus on the trigger, then activate it. */
function openBar() {
  act(() => barTrigger().focus())
  fireEvent.click(barTrigger())
  return screen.getByRole("alertdialog", { name: "Confirmer l'annulation ?" })
}

/** Presses « Oui, annuler » with focus on it, as a keyboard user does. */
function confirmBar() {
  const confirm = screen.getByRole("button", { name: "Oui, annuler" })
  act(() => confirm.focus())
  fireEvent.click(confirm)
  return confirm
}

describe("MyRegistrationPage — withdrawal", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("opens the confirmation next to its trigger, with focus on « Non, garder »", async () => {
    await renderPage([bar, accueil])
    const dialog = openBar()
    expect(barTrigger()).toBeInTheDocument()
    expect(barTrigger()).toHaveAttribute("aria-expanded", "true")
    expect(barTrigger()).toHaveAttribute("aria-controls", dialog.id)
    expect(dialog).toHaveAccessibleDescription("Tu veux annuler le créneau Bar ?")
    expect(screen.getByRole("button", { name: "Non, garder" })).toHaveFocus()
    // Pressed again while open: focus goes back into the confirmation, which stays open.
    act(() => barTrigger().focus())
    fireEvent.click(barTrigger())
    expect(screen.getByRole("button", { name: "Non, garder" })).toHaveFocus()
    // Closed, the trigger points to nothing.
    expect(accueilTrigger()).toHaveAttribute("aria-expanded", "false")
    expect(accueilTrigger()).not.toHaveAttribute("aria-controls")
  })

  it("closes with Escape or « Non, garder », focus back on the trigger", async () => {
    await renderPage([bar, accueil])
    openBar()
    fireEvent.keyDown(screen.getByRole("button", { name: "Non, garder" }), { key: "Escape" })
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(barTrigger()).toHaveFocus()
    expect(barTrigger()).toHaveAttribute("aria-expanded", "false")

    openBar()
    fireEvent.click(screen.getByRole("button", { name: "Non, garder" }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(barTrigger()).toHaveFocus()
  })

  it("has a labelled, described message field, reachable by Tab, that does not move the initial focus", async () => {
    await renderPage([bar, accueil])
    openBar()
    expect(screen.getByRole("button", { name: "Non, garder" })).toHaveFocus()
    const field = screen.getByLabelText("Un mot pour l'organisation ? (facultatif)")
    expect(field).toHaveAccessibleDescription(/santé/)
    expect(field).toHaveAttribute("maxlength", "300")
    field.focus()
    expect(field).toHaveFocus()
  })

  it("sends the message typed in the field with the DELETE", async () => {
    const { deletes } = await renderPage([bar, accueil])
    openBar()
    fireEvent.change(screen.getByLabelText("Un mot pour l'organisation ? (facultatif)"), { target: { value: "Paul peut me remplacer" } })
    confirmBar()
    const [, init] = deletes()[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ message: "Paul peut me remplacer" })
  })

  it("sends one DELETE and keeps the confirmation, aria-disabled, while it runs", async () => {
    const held = deferred<unknown>()
    const { deletes } = await renderPage([bar, accueil], () => held.promise)
    openBar()
    const confirm = confirmBar()
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(confirm).toHaveAttribute("aria-disabled", "true")
    expect(confirm).toHaveAttribute("aria-busy", "true")
    expect(confirm).toHaveAccessibleName("Oui, annuler")
    expect(confirm).toHaveFocus()
    expect(barTrigger()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Non, garder" })).toHaveAttribute("aria-disabled", "true")
    // The busy state is also shown in words, outside any live region (one announcement per action).
    const hint = screen.getByText("Envoi en cours…")
    expect(hint.closest("[role=status],[role=alert],[aria-live]")).toBeNull()
    fireEvent.click(confirm)
    fireEvent.click(screen.getByRole("button", { name: "Non, garder" }))
    fireEvent.keyDown(confirm, { key: "Escape" })
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(deletes()).toHaveLength(1)
    expect(String(deletes()[0][0])).toBe("/api/public/registrations/tok-bar")
    await act(async () => held.resolve(json({ success: true })))
  })

  it("on success removes the card, announces the result and focuses the next card's trigger", async () => {
    await renderPage([bar, accueil])
    openBar()
    confirmBar()
    await waitFor(() => expect(screen.queryByRole("button", { name: "Annuler le créneau Bar" })).toBeNull())
    expect(accueilTrigger()).toHaveFocus()
    await waitFor(() => expect(pageStatus()).toHaveTextContent("Créneau annulé : Bar, samedi 4 juillet, de 10h à 12h."))
  })

  it("focuses the previous card's trigger when the last card of the list goes", async () => {
    await renderPage([accueil, bar])
    openBar()
    confirmBar()
    await waitFor(() => expect(accueilTrigger()).toHaveFocus())
  })

  it("after the last withdrawal shows the empty view, focuses its heading and still announces", async () => {
    await renderPage([bar])
    const status = pageStatus()
    expect(status).toHaveAttribute("role", "status")
    openBar()
    confirmBar()
    const title = await screen.findByRole("heading", { level: 1, name: "Toutes tes inscriptions ont été annulées" })
    expect(title).toHaveFocus()
    // Same region node across the switch of views, so its text is voiced.
    expect(pageStatus()).toBe(status)
    await waitFor(() => expect(status).toHaveTextContent("Créneau annulé : Bar, samedi 4 juillet, de 10h à 12h."))
  })

  for (const [what, del, message] of [
    ["a server error", () => Promise.resolve(json({ error: "Erreur" }, 500)), "L'annulation n'a pas abouti : rien n'a été annulé. Réessaie dans un moment."],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch")), "La connexion a échoué : l'annulation n'a peut-être pas été enregistrée. Recharge la page pour vérifier."],
  ] as const) {
    it(`on ${what} keeps the list, says so under the card and focuses the trigger`, async () => {
      await renderPage([bar, accueil], del)
      openBar()
      confirmBar()
      const alert = document.getElementById("withdraw-error-r-bar")!
      await waitFor(() => expect(alert).toHaveTextContent(message))
      expect(alert).toHaveAttribute("role", "alert")
      expect(screen.queryByText("Ce lien ne fonctionne pas")).toBeNull()
      expect(screen.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeInTheDocument()
      expect(screen.queryByRole("alertdialog")).toBeNull()
      expect(barTrigger()).toHaveFocus()
      expect(barTrigger()).not.toHaveAttribute("aria-disabled")
      expect(barTrigger()).not.toHaveAttribute("aria-describedby")
      expect(pageStatus()).toHaveTextContent("")
      // Pressing the trigger again clears it.
      fireEvent.click(barTrigger())
      expect(alert).toHaveTextContent("")
    })
  }

  it("does not pull focus back when the user moved on during the request", async () => {
    const held = deferred<unknown>()
    await renderPage([bar, accueil], () => held.promise)
    openBar()
    confirmBar()
    const elsewhere = screen.getByRole("link", { name: "Retour à l'accueil" })
    act(() => elsewhere.focus())
    await act(async () => held.resolve(json({ success: true })))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Annuler le créneau Bar" })).toBeNull())
    expect(elsewhere).toHaveFocus()
    await waitFor(() => expect(pageStatus()).toHaveTextContent("Créneau annulé"))
  })

  it("does not pull focus back on a failure either, and still shows the message", async () => {
    const held = deferred<unknown>()
    await renderPage([bar, accueil], () => held.promise)
    openBar()
    confirmBar()
    const elsewhere = screen.getByRole("link", { name: "Retour à l'accueil" })
    act(() => elsewhere.focus())
    await act(async () => held.resolve(json({ error: "Trop de tentatives." }, 429)))
    await waitFor(() => expect(document.getElementById("withdraw-error-r-bar")).toHaveTextContent("Trop de tentatives : rien n'a été annulé."))
    expect(elsewhere).toHaveFocus()
  })

  it("uses no red-500 (below the contrast minimum), confirmation open", async () => {
    await renderPage([bar, accueil])
    openBar()
    expect(document.body.innerHTML).not.toMatch(/red-500/)
  })
})
