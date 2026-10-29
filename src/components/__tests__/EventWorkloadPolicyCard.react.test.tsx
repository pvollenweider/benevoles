/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import EventWorkloadPolicyCard from "../admin/EventWorkloadPolicyCard"
import MyWorkloadCard from "../public/MyWorkloadCard"

// #1171: the organiser's card. Every value is theirs; empty is « à compléter ».
const VALUES = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120, offDay: { apply: false as const }, meal: { apply: false as const }, travel: { apply: false as const } }
const LEGACY = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120 }
const offDayGroup = () => within(screen.getByRole("group", { name: /^Jours sans mission/ }))
const mealGroup = () => within(screen.getByRole("group", { name: /^Pause repas/ }))
const card = (over: Partial<Parameters<typeof EventWorkloadPolicyCard>[0]> = {}) =>
  render(<EventWorkloadPolicyCard eventId="e1" initialEnabled={false} initialValues={null} initialIncomplete={false} initialFindings={[]} timeZone="Europe/Zurich" horizon={{ firstDay: "2026-07-01", lastDay: "2026-07-06" }} {...over} />)

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

  it("asks for the days-off answer on a policy saved before it existed, and focuses it", () => {
    card({ initialEnabled: true, initialValues: LEGACY })
    const apply = offDayGroup().getByRole("radio", { name: "Appliquer cette règle" })
    expect(apply).not.toBeChecked()
    expect(offDayGroup().getByRole("radio", { name: "Ne pas appliquer cette règle" })).not.toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les limites" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(apply).toHaveFocus()
    expect(apply).toHaveAccessibleDescription(/choisissez d'appliquer ou non/)
  })

  it("shows the two numbers only with « Appliquer », with the event's dates in the example", () => {
    card({ initialValues: VALUES })
    expect(screen.queryByLabelText("Jours sans mission au minimum")).toBeNull()
    fireEvent.click(offDayGroup().getByRole("radio", { name: "Appliquer cette règle" }))
    fireEvent.change(screen.getByLabelText("Jours sans mission au minimum"), { target: { value: "1" } })
    const period = screen.getByLabelText("Période, en journées de service d'affilée")
    fireEvent.change(period, { target: { value: "7" } })
    expect(period).toHaveAccessibleDescription(/une période de 7 journées n'y tient jamais/)
    expect(screen.getByRole("heading", { name: "En résumé" }).parentElement).toHaveTextContent("Au moins 1 jour sans mission sur toute période de 7 journées de service d'affilée.")
  })

  it("benchmarks are behind a disclosure, each button named by what it fills, and announced", () => {
    card()
    const details = screen.getByText("Repères et suggestions").closest("details") as HTMLDetailsElement
    expect(details).not.toHaveAttribute("open")
    details.open = true
    fireEvent.click(screen.getByRole("button", { name: "Utiliser 10 h par journée de service" }))
    expect(screen.getByRole("status")).toHaveTextContent("Rempli : durée maximale de missions par journée de service 10 h.")
    expect(within(screen.getByRole("group", { name: /Durée maximale de missions par journée de service/ })).getByLabelText("heures")).toHaveValue("10")
    fireEvent.click(screen.getByRole("button", { name: "Utiliser 1 jour sans mission sur 7" }))
    expect(offDayGroup().getByRole("radio", { name: "Appliquer cette règle" })).toBeChecked()
  })

  it("meal: windows added and removed with the focus kept, days from the event's dates, summary", () => {
    card({ initialValues: VALUES })
    fireEvent.click(mealGroup().getByRole("radio", { name: "Appliquer cette règle" }))
    fireEvent.change(mealGroup().getByLabelText("Durée du repas, en minutes"), { target: { value: "30" } })
    fireEvent.change(mealGroup().getByLabelText("Début de la plage 1"), { target: { value: "11:30" } })
    fireEvent.change(mealGroup().getByLabelText("Fin de la plage 1"), { target: { value: "14:00" } })
    fireEvent.click(mealGroup().getByRole("button", { name: "Ajouter une plage" }))
    expect(mealGroup().getByLabelText("Début de la plage 2")).toHaveFocus()
    fireEvent.change(mealGroup().getByLabelText("Début de la plage 2"), { target: { value: "18:00" } })
    fireEvent.change(mealGroup().getByLabelText("Fin de la plage 2"), { target: { value: "21:00" } })
    expect(screen.getByRole("heading", { name: "En résumé" }).parentElement).toHaveTextContent("Au moins 30 min de repas sans mission dans chaque plage qu'une mission touche (de 11 h 30 à 14 h, de 18 h à 21 h), tous les jours")
    fireEvent.click(mealGroup().getByRole("button", { name: "Retirer la plage 1" }))
    expect(mealGroup().getByLabelText("Début de la plage 1")).toHaveFocus()
    expect(mealGroup().getByLabelText("Début de la plage 1")).toHaveValue("18:00")
    fireEvent.click(mealGroup().getByRole("radio", { name: "Certains jours" }))
    expect(mealGroup().getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual(["mercredi 1 juillet", "jeudi 2 juillet", "vendredi 3 juillet", "samedi 4 juillet", "dimanche 5 juillet", "lundi 6 juillet"])
  })

  it("meal: a problem stays on its own row, and focus goes to it", () => {
    card({ initialValues: { ...VALUES, meal: { apply: true as const, minutes: 30, windows: [{ start: "11:30", end: "14:00" }, { start: "13:00", end: "15:00" }], days: "all" as const } } })
    fireEvent.click(screen.getByRole("button", { name: "Activer la protection" }))
    const second = mealGroup().getByLabelText("Début de la plage 2")
    expect(second).toHaveFocus()
    expect(second).toHaveAccessibleDescription("La plage 2 chevauche la plage 1.")
    expect(mealGroup().getByLabelText("Début de la plage 1")).not.toHaveAttribute("aria-invalid")
  })

  it("the meal suggestion clears the errors of the rows it refills", () => {
    card({ initialValues: { ...VALUES, meal: { apply: true as const, minutes: 30, windows: [{ start: "11:30", end: "14:00" }, { start: "13:00", end: "15:00" }], days: "all" as const } } })
    fireEvent.click(screen.getByRole("button", { name: "Activer la protection" }))
    expect(mealGroup().getByLabelText("Début de la plage 2")).toHaveAttribute("aria-invalid", "true")
    const details = screen.getByText("Repères et suggestions").closest("details") as HTMLDetailsElement
    details.open = true
    fireEvent.click(screen.getByRole("button", { name: /^Utiliser 30 min de repas/ }))
    expect(mealGroup().getByLabelText("Début de la plage 2")).toHaveValue("18:00")
    expect(mealGroup().getByLabelText("Début de la plage 2")).not.toHaveAttribute("aria-invalid")
    expect(mealGroup().queryByText("La plage 2 chevauche la plage 1.")).toBeNull()
  })

  it("travel: the margin with its help, and how many shifts have no place, linked to the places section", () => {
    card({ initialValues: VALUES, placesInfo: { shiftsWithoutPlace: 3, activePlaces: 2 } })
    const group = within(screen.getByRole("group", { name: /^Trajet entre deux lieux/ }))
    fireEvent.click(group.getByRole("radio", { name: "Appliquer cette règle" }))
    const margin = group.getByLabelText("Marge entre deux lieux, en minutes")
    expect(margin).toHaveAccessibleDescription(/avec 0, c'est la seule vérification.*3 créneaux n'ont pas de lieu/)
    expect(group.getByRole("link", { name: "Choisir les lieux dans Créneaux" })).toHaveAttribute("href", "/admin/events/e1/shifts#lieux")
    fireEvent.change(margin, { target: { value: "20" } })
    fireEvent.click(screen.getByRole("button", { name: "Activer la protection" }))
    expect(margin).toHaveFocus()
    expect(margin).toHaveAccessibleDescription(/indiquez une marge de 0 à 15 minutes/)
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
    render(<EventWorkloadPolicyCard eventId="e1" initialEnabled initialValues={VALUES} initialIncomplete={false} initialFindings={[]} timeZone="Europe/Zurich" horizon={{ firstDay: "2026-07-01", lastDay: "2026-07-06" }} />)
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ enabled: false }) })
    fireEvent.click(screen.getByRole("button", { name: "Désactiver la protection" }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Désactiver la protection" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Activer la protection" })).toHaveFocus())
    expect(screen.getByText("Désactivée")).toBeInTheDocument()
  })
})
