/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import EventWorkloadPolicyCard from "../admin/EventWorkloadPolicyCard"
import MyWorkloadCard from "../public/MyWorkloadCard"

// #1171: the organiser's card. Every value is theirs; empty is « à compléter ».
const VALUES = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120 }
const card = (over: Partial<Parameters<typeof EventWorkloadPolicyCard>[0]> = {}) =>
  render(<EventWorkloadPolicyCard eventId="e1" initialEnabled={false} initialValues={null} initialIncomplete={false} initialFindings={[]} timeZone="Europe/Zurich" {...over} />)

describe("EventWorkloadPolicyCard", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("requestAnimationFrame", (f: () => void) => { f(); return 0 }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("names each limit by its fieldset, says the state in words, and offers the existing warning settings as editable suggestions", () => {
    card()
    expect(screen.getByRole("heading", { name: /Protection des pauses et de la charge/ })).toBeInTheDocument()
    expect(screen.getByText("Désactivée")).toBeInTheDocument()
    const group = screen.getByRole("group", { name: "Durée maximale sans vraie pause" })
    expect(group).toBeInTheDocument()
    const hours = screen.getAllByLabelText("heures")[0]
    expect(hours).toHaveAttribute("inputmode", "numeric")
    const suggest = screen.getByRole("button", { name: "Reprendre les réglages d'avertissement existants" })
    expect(suggest).toHaveAccessibleDescription(/ni des seuils légaux ni des recommandations/)
    fireEvent.click(suggest)
    expect(hours).toHaveValue("6")
    expect(screen.getByRole("status")).toHaveTextContent("Rempli avec les réglages d'avertissement existants")
  })

  it("never saves an incomplete policy: the first missing field is focused and marked invalid", () => {
    card()
    fireEvent.click(screen.getByRole("button", { name: "Activer la protection" }))
    expect(fetchMock).not.toHaveBeenCalled()
    const start = screen.getByLabelText(/Début de la journée de service/)
    expect(start).toHaveFocus()
    expect(start).toHaveAttribute("aria-invalid", "true")
    expect(start).toHaveAccessibleDescription(/à compléter/)
  })

  it("shows the worked examples and the summary once complete, and the preview's result", async () => {
    card({ initialValues: VALUES })
    expect(screen.getByText("Exemples :")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "En résumé" }).parentElement).toHaveTextContent("Une journée de service commence à 8 h.")
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, findings: [{ volunteerId: "v1", name: "Lou Martin", messages: ["5 h d'attente"] }] }) })
    fireEvent.click(screen.getByRole("button", { name: "Aperçu" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Aperçu : 1 personne dépasserait ces limites. Rien n'est encore activé."))
    expect(screen.getByText("Lou Martin")).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/events/e1/workload-policy/preview")
  })

  it("a refused activation lists the programmes to change first", async () => {
    card({ initialValues: VALUES })
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Ces limites ne sont pas respectées aujourd'hui par le programme de Lou Martin.", findings: [{ volunteerId: "v1", name: "Lou Martin", messages: ["5 h d'attente"] }] }) })
    fireEvent.click(screen.getByRole("button", { name: "Activer la protection" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Lou Martin"))
    expect(screen.getByRole("heading", { name: "Programmes à modifier d'abord" })).toBeInTheDocument()
    expect(screen.getByText("Désactivée")).toBeInTheDocument()
  })

  it("asks before turning protection off", () => {
    card({ initialEnabled: true, initialValues: VALUES })
    fireEvent.click(screen.getByRole("button", { name: "Désactiver la protection" }))
    expect(screen.getByRole("alertdialog", { name: "Désactiver la protection des pauses et de la charge ?" })).toBeInTheDocument()
  })
})

describe("MyWorkloadCard", () => {
  afterEach(cleanup)
  it("shows the person's own findings with what to do, and nothing without findings", () => {
    const { unmount } = render(<MyWorkloadCard messages={["Sur tout l'événement : 30 h de missions."]} contactEmail="asso@example.org" />)
    expect(screen.getByRole("heading", { name: "Pauses et charge" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "écrire à l'organisation" })).toHaveAttribute("href", "mailto:asso@example.org")
    unmount()
    const { container } = render(<MyWorkloadCard messages={[]} contactEmail={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe("EventWorkloadPolicyCard — focus after turning off", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("requestAnimationFrame", (f: () => void) => { f(); return 0 }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  it("lands on « Activer la protection » once the opener is gone", async () => {
    render(<EventWorkloadPolicyCard eventId="e1" initialEnabled initialValues={VALUES} initialIncomplete={false} initialFindings={[]} timeZone="Europe/Zurich" />)
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ enabled: false }) })
    fireEvent.click(screen.getByRole("button", { name: "Désactiver la protection" }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Désactiver la protection" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Activer la protection" })).toHaveFocus())
    expect(screen.getByText("Désactivée")).toBeInTheDocument()
  })
})
