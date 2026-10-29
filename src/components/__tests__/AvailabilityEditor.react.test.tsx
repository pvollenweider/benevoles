/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import AvailabilityEditor from "@/components/AvailabilityEditor"
import EventAvailabilityOption from "@/components/admin/EventAvailabilityOption"

// The form of the dated availability (#1146): labelled fields per date, the error next to its field
// with focus on it, the night hint, and the organisers' option asking before revoking links.

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const dates = ["2099-07-10", "2099-07-11"]

describe("AvailabilityEditor", () => {
  it("names each field with its date and range, and hints a night range", () => {
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[{ date: "2099-07-10", ranges: [{ startTime: "20:00", endTime: "03:00" }] }]} voice="tu" submitLabel="Enregistrer mes disponibilités" savedText="OK" onSave={vi.fn()} />)
    const end = screen.getByLabelText("Fin de la plage 1, vendredi 10 juillet")
    expect(end).toHaveValue("03:00")
    expect(end).toHaveAccessibleDescription("Fin : se termine le lendemain, samedi 11 juillet")
    // The date's heading inside its legend says it was never answered (no radio is checked).
    expect(screen.getByRole("heading", { level: 3, name: "Samedi 11 juillet · pas encore répondu" })).toBeInTheDocument()
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
  })

  it("moves focus to an empty field and says why, without calling the server", async () => {
    const onSave = vi.fn()
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={onSave} />)
    fireEvent.click(screen.getAllByLabelText("Disponible sur des plages")[1])
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const start = screen.getByLabelText("Début de la plage 1, samedi 11 juillet")
    expect(start).toHaveFocus()
    expect(start).toHaveAttribute("aria-invalid", "true")
    expect(start).toHaveAccessibleDescription("Indique l'heure de début de la plage 1 du samedi 11 juillet.")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("points a server error at its field and announces success", async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false, error: "Deux plages se chevauchent.", at: { date: "2099-07-10", range: 0, field: "start" } }).mockResolvedValueOnce({ ok: true })
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[{ date: "2099-07-10", ranges: [{ startTime: "08:00", endTime: "12:00" }] }]} voice="vous" submitLabel="Enregistrer la correction" savedText="Correction enregistrée." onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }))
    await waitFor(() => expect(screen.getByLabelText("Début de la plage 1, vendredi 10 juillet")).toHaveFocus())
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Deux plages se chevauchent."))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }))
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === "Correction enregistrée.")).toBe(true))
  })

  it("« Pas disponible pendant tout l'événement » fills every date and says nothing is saved yet", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Pas disponible pendant tout l'événement" }))
    expect(screen.getAllByLabelText("Pas disponible").every((r) => (r as HTMLInputElement).checked)).toBe(true)
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => /Rien n'est encore enregistré/.test(s.textContent ?? ""))).toBe(true))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ date: "2099-07-10", ranges: [] }, { date: "2099-07-11", ranges: [] }]))
  })
})

describe("EventAvailabilityOption", () => {
  it("asks before turning collection off while links are live, then confirms", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Les liens envoyés à 3 personnes cesseront de fonctionner.", liveLinks: 3 }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false, deadline: null, deadlineInput: "", timeZone: "Europe/Zurich", open: true }), { status: 200 }))
    render(<EventAvailabilityOption eventId="e1" initial={{ enabled: true, deadline: null, deadlineInput: "", timeZone: "Europe/Zurich", open: true }} />)
    fireEvent.click(screen.getByRole("switch", { name: "Recueillir les disponibilités pour cet événement" }))
    expect(await screen.findByText("Les liens envoyés à 3 personnes cesseront de fonctionner.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Arrêter et désactiver les liens" }))
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"))
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ enabled: false, confirm: true })
  })

  it("keeps « Sans date limite » on screen, unavailable when there is none", () => {
    render(<EventAvailabilityOption eventId="e1" initial={{ enabled: true, deadline: null, deadlineInput: "", timeZone: "Europe/Zurich", open: true }} />)
    expect(screen.getByRole("button", { name: "Sans date limite" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByLabelText("Date limite des réponses (facultatif)")).toHaveAccessibleDescription(/Europe\/Zurich/)
  })
})
