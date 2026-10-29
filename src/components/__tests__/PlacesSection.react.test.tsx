/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { useState } from "react"
import PlacesSection, { type AdminPlace } from "../admin/shifts/PlacesSection"

// #1171 lot 2: « Lieux des missions » on the shifts page (invented stage names).
const place = (id: string, name: string, archivedAt: string | null = null, displayOrder = 0): AdminPlace => ({ id, name, displayOrder, archivedAt })

function Harness({ initial, onAnnounce }: { initial: AdminPlace[]; onAnnounce: (t: string) => void }) {
  const [places, setPlaces] = useState(initial)
  return <PlacesSection eventId="e1" places={places} setPlaces={setPlaces} onAnnounce={onAnnounce} />
}

describe("PlacesSection", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("adds a place, refuses an empty name with the focus on the field, and says a server refusal", async () => {
    const announce = vi.fn()
    render(<Harness initial={[]} onAnnounce={announce} />)
    expect(screen.getByRole("heading", { name: /Lieux des missions/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le lieu" }))
    const input = screen.getByLabelText("Nouveau lieu")
    expect(input).toHaveFocus()
    expect(input).toHaveAccessibleDescription(/Indiquez le nom du lieu/)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ place: place("p1", "Grande Scène") }) })
    fireEvent.change(input, { target: { value: "Grande Scène" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le lieu" }))
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Lieu « Grande Scène » ajouté."))
    expect(screen.getByRole("button", { name: "Renommer le lieu Grande Scène" })).toBeInTheDocument()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Un lieu porte déjà ce nom dans cet événement." }) })
    fireEvent.change(input, { target: { value: "grande scène" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le lieu" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Un lieu porte déjà ce nom")
    expect(input).toHaveAttribute("aria-invalid", "true")
  })

  it("renames inline (Escape cancels), archives with the focus on the next place, restores", async () => {
    const announce = vi.fn()
    render(<Harness initial={[place("p1", "Grande Scène", null, 0), place("p2", "Le Dôme", null, 1)]} onAnnounce={announce} />)
    fireEvent.click(screen.getByRole("button", { name: "Renommer le lieu Grande Scène" }))
    const rename = screen.getByLabelText("Nouveau nom du lieu « Grande Scène »")
    expect(rename).toHaveFocus()
    fireEvent.keyDown(rename, { key: "Escape" })
    expect(screen.getByRole("button", { name: "Renommer le lieu Grande Scène" })).toHaveFocus()

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ place: place("p1", "Grande Scène", "2026-10-29T10:00:00Z") }) })
    fireEvent.click(screen.getByRole("button", { name: "Archiver le lieu Grande Scène" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Renommer le lieu Le Dôme" })).toHaveFocus())
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("Les créneaux qui l'ont le gardent et restent vérifiés"))
    expect(screen.getByRole("heading", { name: "Lieux archivés" })).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ place: place("p1", "Grande Scène") }) })
    fireEvent.click(screen.getByRole("button", { name: "Rétablir le lieu Grande Scène" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Renommer le lieu Grande Scène" })).toHaveFocus())
    expect(screen.queryByRole("heading", { name: "Lieux archivés" })).toBeNull()
  })

  it("a failed restore says why under its row, tied to its button", async () => {
    render(<Harness initial={[place("p1", "Grande Scène", "2026-10-29T10:00:00Z"), place("p2", "Grande Scène")]} onAnnounce={vi.fn()} />)
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Un lieu porte déjà ce nom dans cet événement." }) })
    const restore = screen.getByRole("button", { name: "Rétablir le lieu Grande Scène" })
    fireEvent.click(restore)
    expect(await screen.findByRole("alert")).toHaveTextContent("Un lieu porte déjà ce nom")
    expect(restore).toHaveAccessibleDescription("Un lieu porte déjà ce nom dans cet événement.")
  })
})
