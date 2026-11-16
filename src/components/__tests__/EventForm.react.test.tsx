/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
// announce()'s own two-step (empty, then the text on the next frame) is tested on its own; here we
// only care how many times EventForm asks for an announcement, and with what text.
const announceMock = vi.hoisted(() => vi.fn((set: (t: string) => void, text: string) => set(text)))
vi.mock("@/lib/announce", () => ({ announce: announceMock }))

import EventForm from "../admin/EventForm"

// Autosave status of the event edit form (#616): announced once per save per D11, a failure stays
// in an alert until the next success, and « Réessayer » resends.

const initialData = { id: "evt-1", title: "Festival", publicStatus: "draft" as const }

function renderForm() {
  return render(<EventForm initialData={initialData} />)
}

const titleField = () => screen.getByLabelText("Titre *")

function editTitle(value: string) {
  fireEvent.change(titleField(), { target: { value } })
}

async function debounce() {
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
}

// CoordinatesField also mounts a (normally empty) role="alert"; scope to the save failure's own.
const saveAlert = () => screen.getAllByRole("alert").find((el) => el.textContent?.includes("enregistrées"))


describe("EventForm autosave status (#616)", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    announceMock.mockClear()
  })

  it("announces the first save, once, after the debounce", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ publicStatus: "draft" }) })
    vi.stubGlobal("fetch", fetchMock)
    renderForm()

    editTitle("Festival 2026")
    await debounce()

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1", expect.objectContaining({ method: "PATCH" }))
    expect(announceMock).toHaveBeenCalledTimes(1)
    expect(announceMock).toHaveBeenCalledWith(expect.any(Function), "Modifications enregistrées.")
    expect(screen.getByText("Modifications enregistrées à", { exact: false })).toBeInTheDocument()
  })

  it("does not re-announce a later, successful save, only the visible time updates", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ publicStatus: "draft" }) })
    vi.stubGlobal("fetch", fetchMock)
    renderForm()

    editTitle("Festival 2026")
    await debounce()
    expect(announceMock).toHaveBeenCalledTimes(1)

    editTitle("Festival 2026, encore")
    await debounce()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(announceMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Modifications enregistrées à", { exact: false })).toBeInTheDocument()
  })

  it("a server failure shows an alert that stays, with no timer clearing it", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    renderForm()

    editTitle("Festival 2026")
    await debounce()

    expect(saveAlert()).toHaveTextContent("Les modifications n'ont pas été enregistrées.")
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument()
    expect(announceMock).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(saveAlert()).toHaveTextContent("Les modifications n'ont pas été enregistrées.")
  })

  it("a network error gives the network text", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetchMock)
    renderForm()

    editTitle("Festival 2026")
    await debounce()

    expect(saveAlert()).toHaveTextContent("Connexion impossible : les modifications n'ont pas été enregistrées.")
  })

  it("« Réessayer » resends; success clears the alert and announces", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicStatus: "draft" }) })
    vi.stubGlobal("fetch", fetchMock)
    renderForm()

    editTitle("Festival 2026")
    await debounce()
    expect(saveAlert()).toHaveTextContent("Les modifications n'ont pas été enregistrées.")
    expect(announceMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
      await vi.runAllTimersAsync()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(saveAlert()).toBeUndefined()
    expect(announceMock).toHaveBeenCalledTimes(1)
    expect(announceMock).toHaveBeenCalledWith(expect.any(Function), "Modifications enregistrées.")
  })

  it("renders no bg-green-500 / bg-red-500 element and no invisible « Sauvegarde… » text", () => {
    const { container } = renderForm()
    expect(container.querySelector(".bg-green-500")).toBeNull()
    expect(container.querySelector(".bg-red-500")).toBeNull()
    expect(screen.queryByText("Sauvegarde…")).toBeNull()
  })

  it("the Réessayer button is aria-disabled while a retry is in flight", async () => {
    vi.useFakeTimers()
    let resolveSecond!: (v: unknown) => void
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockReturnValueOnce(new Promise((r) => { resolveSecond = r }))
    vi.stubGlobal("fetch", fetchMock)
    renderForm()

    editTitle("Festival 2026")
    await debounce()

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(screen.getByRole("button", { name: "Réessayer" })).toHaveAttribute("aria-disabled", "true")

    await act(async () => { resolveSecond({ ok: true, json: async () => ({ publicStatus: "draft" }) }) })
  })
})

// Every field of the form has a label (axe « label » found three textareas without one, #616).
describe("EventForm labels", () => {
  it("names the message textareas and the show fields", () => {
    render(<EventForm initialData={{ ...initialData, startDate: "2031-06-01", endDate: "2031-06-02" }} />)
    expect(screen.getByLabelText("Instructions publiques")).toBeInstanceOf(HTMLTextAreaElement)
    expect(screen.getByLabelText("Message de confirmation")).toHaveAccessibleDescription(/Supporte le \*\*gras\*\*/)
    expect(screen.getByLabelText(/^Message de rappel/)).toBeInstanceOf(HTMLTextAreaElement)
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter" }))
    for (const name of ["Nom du spectacle", "Date", "Début", "Fin"]) expect(screen.getByLabelText(name)).toBeInTheDocument()
  })
})

// Event-level automatic reminders (Event.remindersEnabled): a box in the edit form, autosaved.
describe("EventForm automatic reminders box", () => {
  // The labels test above leaves its form mounted (no cleanup there).
  beforeEach(() => cleanup())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    announceMock.mockClear()
  })

  it("is checked by default, inside the #event-reminders anchor, and describes the organization settings", () => {
    const { container } = renderForm()
    const box = screen.getByRole("checkbox", { name: "Rappels automatiques" })
    expect(box).toBeChecked()
    expect(container.querySelector("#event-reminders")).toContainElement(box)
    expect(box).toHaveAccessibleDescription("Les bénévoles reçoivent les rappels J-2, J-1 et du jour avant leurs créneaux. Les rappels désactivés dans « Paramètres des emails » ne partent pas.")
  })

  it("takes focus when the page is opened on #event-reminders (the review's « Modifier » link)", () => {
    window.history.replaceState(null, "", "/admin/events/evt-1/edit#event-reminders")
    try {
      renderForm()
      expect(screen.getByRole("checkbox", { name: "Rappels automatiques" })).toHaveFocus()
    } finally {
      window.history.replaceState(null, "", "/")
    }
  })

  it("does not take focus without the anchor", () => {
    renderForm()
    expect(screen.getByRole("checkbox", { name: "Rappels automatiques" })).not.toHaveFocus()
  })

  it("reflects a stored false", () => {
    render(<EventForm initialData={{ ...initialData, remindersEnabled: false }} />)
    expect(screen.getByRole("checkbox", { name: "Rappels automatiques" })).not.toBeChecked()
  })

  it("unchecking it autosaves remindersEnabled: false", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ publicStatus: "draft" }) })
    vi.stubGlobal("fetch", fetchMock)
    renderForm()

    fireEvent.click(screen.getByRole("checkbox", { name: "Rappels automatiques" }))
    await debounce()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ remindersEnabled: false })
    expect(announceMock).toHaveBeenCalledWith(expect.any(Function), "Modifications enregistrées.")
  })

  it("is not shown in create mode (new events always start with reminders on)", () => {
    render(<EventForm />)
    expect(screen.queryByRole("checkbox", { name: "Rappels automatiques" })).toBeNull()
  })
})

describe("EventForm: dates refused by the days-off rule (#1171, lot 2)", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); announceMock.mockClear() })

  it("goes back to the saved dates, lists who, and keeps the alert until the dates are typed again", async () => {
    vi.useFakeTimers()
    const refusal = { error: "Dates non enregistrées : avec ces dates, le programme de Sami Martin ne respecterait plus la règle des jours sans mission de cet événement. Les dates précédentes sont gardées.", code: "workload", workload: ["Sami Martin : Du jeudi 3 juillet au mercredi 9 juillet : seulement 1 jour sans mission."] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => refusal })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ publicStatus: "draft" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventForm initialData={{ ...initialData, startDate: "2031-07-03", endDate: "2031-07-08" }} />)

    const end = screen.getByLabelText(/Date fin/)
    fireEvent.change(end, { target: { value: "2031-07-09" } })
    await debounce()
    expect(end).toHaveValue("2031-07-08")
    const alert = screen.getAllByRole("alert").find((el) => el.textContent?.includes("Dates non enregistrées"))!
    expect(alert).toHaveTextContent("Sami Martin : Du jeudi 3 juillet")
    expect(end).toHaveAccessibleDescription(/Dates non enregistrées/)
    expect(screen.getByRole("link", { name: "Voir la protection des pauses et de la charge" })).toHaveAttribute("href", "#protection-charge")
    // The status is not touched (that 409 is a publication refusal's).
    expect(screen.queryByText(/Le statut a été remis/)).toBeNull()

    // Going back to the saved dates is not an edit: nothing is saved nor announced as saved.
    await debounce()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(announceMock).not.toHaveBeenCalledWith(expect.any(Function), "Modifications enregistrées.")
    expect(screen.queryByText("Modifications enregistrées à", { exact: false })).toBeNull()
    // A later edit of another field saves, and the alert stays until the dates are typed again.
    editTitle("Festival 2031")
    await debounce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ endDate: "2031-07-08" })
    expect(screen.getAllByRole("alert").some((el) => el.textContent?.includes("Dates non enregistrées"))).toBe(true)
    fireEvent.change(end, { target: { value: "2031-07-07" } })
    expect(screen.getAllByRole("alert").some((el) => el.textContent?.includes("Dates non enregistrées"))).toBe(false)
  })
})
