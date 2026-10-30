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
    const end = screen.getByLabelText("Fin de l'horaire 1, vendredi 10 juillet")
    expect(end).toHaveValue("03:00")
    expect(end).toHaveAccessibleDescription("Fin : se termine le lendemain, samedi 11 juillet")
    // The heading is the date only; the legend, the group's name, adds « (sans réponse) » on its own line.
    expect(screen.getByRole("heading", { level: 3, name: "Samedi 11 juillet" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Samedi 11 juillet (sans réponse)" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Vendredi 10 juillet" })).toBeInTheDocument()
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
    expect(screen.getAllByLabelText("Disponible à certaines heures")).toHaveLength(2)
    expect(document.querySelector("form")).not.toHaveAttribute("aria-busy")
  })

  it("moves focus to an empty field and says why, without calling the server", async () => {
    const onSave = vi.fn()
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={onSave} />)
    fireEvent.click(screen.getAllByLabelText("Disponible à certaines heures")[1])
    fireEvent.change(screen.getByLabelText("Fin de l'horaire 1, samedi 11 juillet"), { target: { value: "12:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const start = screen.getByLabelText("Début de l'horaire 1, samedi 11 juillet")
    expect(start).toHaveFocus()
    expect(start).toHaveAttribute("aria-invalid", "true")
    expect(start).toHaveAccessibleDescription("Indique l'heure de début du samedi 11 juillet.")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("lists every missing time at once in a summary that takes the focus, its links lead to the fields", () => {
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={vi.fn()} />)
    fireEvent.click(screen.getAllByLabelText("Disponible à certaines heures")[0])
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const heading = screen.getByRole("heading", { name: "2 points à corriger" })
    expect(heading).toHaveFocus()
    fireEvent.click(screen.getByRole("link", { name: "Indique l'heure de fin du vendredi 10 juillet." }))
    expect(screen.getByLabelText("Fin de l'horaire 1, vendredi 10 juillet")).toHaveFocus()
    // Fixing the date clears its messages; the summary leaves with them.
    fireEvent.change(screen.getByLabelText("Début de l'horaire 1, vendredi 10 juillet"), { target: { value: "08:00" } })
    expect(screen.queryByRole("heading", { name: /à corriger/ })).toBeNull()
    expect(screen.getByLabelText("Début de l'horaire 1, vendredi 10 juillet")).not.toHaveAttribute("aria-invalid")
  })

  it("marks both radios of a date that needs a choice, and clears the message after a change", async () => {
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const [yes, no] = [screen.getAllByLabelText("Disponible à certaines heures")[0], screen.getAllByLabelText("Pas disponible")[0]]
    expect(yes).toHaveFocus()
    for (const r of [yes, no]) {
      expect(r).toHaveAttribute("aria-invalid", "true")
      expect(r).toHaveAccessibleDescription(/^Choisis au moins une date/)
    }
    fireEvent.click(no)
    expect(yes).not.toHaveAttribute("aria-invalid")
    expect(screen.queryByText(/Choisis au moins une date/)).toBeNull()
  })

  it("says « Changements non enregistrés » next to the save button until the save", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[]} voice="tu" submitLabel="Enregistrer" savedText="C'est enregistré." onSave={onSave} />)
    expect(screen.queryByText("Changements non enregistrés")).toBeNull()
    fireEvent.click(screen.getAllByLabelText("Pas disponible")[0])
    expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveAccessibleDescription("Changements non enregistrés")
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.queryByText("Changements non enregistrés")).toBeNull())
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === "C'est enregistré.")).toBe(true))
  })

  it("copies the previous date's hours into a date, and says so", async () => {
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[{ date: "2099-07-10", ranges: [{ startTime: "20:00", endTime: "03:00" }] }]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Reprendre les horaires du vendredi 10 juillet" }))
    expect(screen.getByLabelText("Début de l'horaire 1, samedi 11 juillet")).toHaveValue("20:00")
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === "Horaires du vendredi 10 juillet repris pour le samedi 11 juillet : 1 horaire.")).toBe(true))
  })

  it("offers the copy only once the previous date has an answer", () => {
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Reprendre les horaires/ })).toBeNull()
    fireEvent.click(screen.getAllByLabelText("Pas disponible")[0])
    expect(screen.getByRole("button", { name: "Reprendre la réponse du vendredi 10 juillet" })).toBeInTheDocument()
  })

  it("clears a refusal of the server, which may name two dates, at the next edit anywhere", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: "Deux horaires se recouvrent.", at: { date: "2099-07-10", range: 0, field: "end" } })
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[{ date: "2099-07-10", ranges: [{ startTime: "20:00", endTime: "03:00" }] }, { date: "2099-07-11", ranges: [{ startTime: "01:00", endTime: "05:00" }] }]} voice="tu" submitLabel="Enregistrer" savedText="OK" onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByLabelText("Fin de l'horaire 1, vendredi 10 juillet")).toHaveAttribute("aria-invalid", "true"))
    fireEvent.change(screen.getByLabelText("Début de l'horaire 1, samedi 11 juillet"), { target: { value: "09:00" } })
    expect(screen.getByLabelText("Fin de l'horaire 1, vendredi 10 juillet")).not.toHaveAttribute("aria-invalid")
    expect(screen.queryByText("Deux horaires se recouvrent.")).toBeNull()
  })

  it("points a server error at its field and announces success", async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false, error: "Deux horaires se recouvrent.", at: { date: "2099-07-10", range: 0, field: "start" } }).mockResolvedValueOnce({ ok: true })
    render(<AvailabilityEditor idPrefix="t" dates={dates} initialDays={[{ date: "2099-07-10", ranges: [{ startTime: "08:00", endTime: "12:00" }] }]} voice="vous" submitLabel="Enregistrer la correction" savedText="Correction enregistrée." onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }))
    await waitFor(() => expect(screen.getByLabelText("Début de l'horaire 1, vendredi 10 juillet")).toHaveFocus())
    // Read once, by the focused field's description: the alert stays empty.
    expect(screen.getByLabelText("Début de l'horaire 1, vendredi 10 juillet")).toHaveAccessibleDescription("Deux horaires se recouvrent.")
    expect(screen.getByRole("alert")).toHaveTextContent("")
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }))
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === "Correction enregistrée.")).toBe(true))
  })

  it("« Pas disponible pendant tout l'événement » fills every date and says nothing is saved yet", async () => {
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

  it("keeps « Sans date limite » on screen, unavailable when there is none", () => {
    render(<EventAvailabilityOption eventId="e1" initial={{ enabled: true, deadline: null, deadlineInput: "", timeZone: "Europe/Zurich", open: true }} />)
    expect(screen.getByRole("button", { name: "Sans date limite" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByLabelText("Date limite des réponses (facultatif)")).toHaveAccessibleDescription(/^En heure suisse \(Europe\/Zurich\)\./)
  })

  it("asks before saving a deadline already past, and keeps the date typed when cancelled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ enabled: true, deadline: "2020-01-01T10:00:00Z", deadlineInput: "2020-01-01T11:00", timeZone: "Europe/Zurich", open: false }), { status: 200 }))
    render(<EventAvailabilityOption eventId="e1" initial={{ enabled: true, deadline: null, deadlineInput: "", timeZone: "Europe/Zurich", open: true }} />)
    const field = screen.getByLabelText("Date limite des réponses (facultatif)")
    fireEvent.change(field, { target: { value: "2020-01-01T11:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la date limite" }))
    expect(await screen.findByText("Enregistrer une date limite déjà passée ?")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Changer la date" }))
    await waitFor(() => expect(screen.queryByText("Enregistrer une date limite déjà passée ?")).toBeNull())
    expect(field).toHaveValue("2020-01-01T11:00")
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la date limite" }))
    fireEvent.click(await screen.findByRole("button", { name: "Enregistrer quand même" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ deadline: "2020-01-01T11:00" })
  })
})
