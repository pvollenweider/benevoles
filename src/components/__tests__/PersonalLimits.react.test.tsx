/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import PersonalLimitsEditor from "../admin/PersonalLimitsEditor"
import MyWorkloadLimits from "../public/MyWorkloadLimits"

// #1171 lot 2: a person's own limits, from the organiser's card and from the personal page.
const EVENT = { maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600 }
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
const LINK = "t1"

describe("PersonalLimitsEditor", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("requestAnimationFrame", (f: () => void) => { f(); return 0 }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("adds limits for a person (focus on the person, the event's value said under each field) and lists both layers", async () => {
    fetchMock.mockResolvedValueOnce(ok({ limits: [{ volunteerId: "v2", name: "Sami Martin", layers: { admin: null, volunteer: { maxDailyMinutes: 420 } } }], people: [{ volunteerId: "v1", name: "Lou Martin" }, { volunteerId: "v2", name: "Sami Martin" }] }))
    render(<PersonalLimitsEditor eventId="e1" event={EVENT} />)
    expect(await screen.findByText("Demandées par la personne :")).toBeInTheDocument()
    // Sami's own limits cannot be removed by the organisation.
    expect(screen.queryByRole("button", { name: "Retirer les limites fixées pour Sami Martin" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter des limites pour une personne" }))
    const who = screen.getByLabelText("Personne")
    expect(who).toHaveFocus()
    const daily = within(screen.getByRole("group", { name: "Durée maximale par journée de service" })).getByLabelText("heures")
    expect(daily).toHaveAccessibleDescription("Événement : 10 h au plus")
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les limites de la personne" }))
    expect(who).toHaveFocus()
    expect(who).toHaveAccessibleDescription("Choisissez une personne.")
    fireEvent.change(who, { target: { value: "v1" } })
    fireEvent.change(daily, { target: { value: "8" } })
    fetchMock.mockResolvedValueOnce(ok({ layers: { admin: { maxDailyMinutes: 480 }, volunteer: null } }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les limites de la personne" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Limites de Lou Martin enregistrées."))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ limits: { maxDailyMinutes: 480 } })
    expect(screen.getByRole("button", { name: "Modifier les limites de Lou Martin" })).toHaveFocus()
  })

  it("a refusal keeps the form, says why in the alert and lists the findings beside it", async () => {
    fetchMock.mockResolvedValueOnce(ok({ limits: [], people: [{ volunteerId: "v1", name: "Lou Martin" }] }))
    render(<PersonalLimitsEditor eventId="e1" event={EVENT} />)
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter des limites pour une personne" }))
    fireEvent.change(screen.getByLabelText("Personne"), { target: { value: "v1" } })
    fireEvent.change(within(screen.getByRole("group", { name: "Durée maximale par journée de service" })).getByLabelText("heures"), { target: { value: "4" } })
    fetchMock.mockResolvedValueOnce(ok({ error: "Ces limites ne sont pas respectées par le programme actuel : rien n'a été enregistré.", workload: ["Journée de service du samedi 4 juillet : 6 h de missions."] }, 409))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les limites de la personne" }))
    // The alert is always in the page, empty: wait for its text, which announce() sets one frame
    // later through a render React schedules itself, not for the region.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ces limites ne sont pas respectées"))
    expect(screen.getByText("Journée de service du samedi 4 juillet : 6 h de missions.")).toBeInTheDocument()
    expect(screen.getByLabelText("Personne")).toBeInTheDocument()
  })
})

describe("MyWorkloadLimits", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("requestAnimationFrame", (f: () => void) => { f(); return 0 }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("shows nothing without protection", async () => {
    fetchMock.mockResolvedValueOnce(ok({ available: false }))
    const { container } = render(<MyWorkloadLimits token={LINK} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("lets the person ask for stricter limits, shows the organisation's, and remove their own with the focus kept", async () => {
    fetchMock.mockResolvedValueOnce(ok({ available: true, event: EVENT, mine: { minRestMinutes: 720 }, organisation: { maxDailyMinutes: 480 } }))
    render(<MyWorkloadLimits token={LINK} />)
    expect(await screen.findByRole("heading", { name: "Mes limites" })).toBeInTheDocument()
    expect(screen.getByText("Durée maximale par journée de service : 8 h au plus")).toBeInTheDocument()
    expect(within(screen.getByRole("group", { name: "Repos minimum entre deux journées de service" })).getByLabelText("heures")).toHaveValue("12")
    fetchMock.mockResolvedValueOnce(ok({ available: true, event: EVENT, mine: null, organisation: { maxDailyMinutes: 480 } }))
    fireEvent.click(screen.getByRole("button", { name: "Retirer mes limites" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer mes limites" })).toHaveFocus())
    expect(fetchMock.mock.calls[1]).toEqual(["/api/public/registrations/t1/workload-limits", expect.objectContaining({ method: "DELETE" })])
    // The focus moves at once, the status text one frame later (announce): wait for it too.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Tes limites sont retirées : celles de l'événement s'appliquent."))
    expect(screen.queryByRole("button", { name: "Retirer mes limites" })).toBeNull()
  })
})
