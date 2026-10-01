/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import ShiftEditor from "../admin/shifts/ShiftEditor"

// The quick-add / edit form of the admin shifts page.

const fetchMock = vi.fn()

describe("ShiftEditor", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const setup = (props: Partial<React.ComponentProps<typeof ShiftEditor>> = {}) => {
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    render(
      <ShiftEditor
        eventId="evt-1"
        dates={["2026-07-04"]}
        editingId={null}
        initial={{ date: "2026-07-04" }}
        existingShifts={[]}
        onSaved={onSaved}
        onCancel={onCancel}
        {...props}
      />,
    )
    return { onSaved, onCancel }
  }

  it("refuses to save with missing fields and says which", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Nouveau créneau" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText("Veuillez remplir les champs en rouge.")).toBeInTheDocument()
  })

  it("posts a new shift, defaulting the label and the end time, and hands it back", async () => {
    const saved = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04T00:00:00.000Z", startTime: "10:00", endTime: "11:00", capacity: 2, status: "open", displayOrder: 0 }
    fetchMock.mockResolvedValue({ ok: true, json: async () => saved })
    const { onSaved } = setup()
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Bar" } })
    fireEvent.change(screen.getByLabelText("Début *"), { target: { value: "10:00" } })
    expect(screen.getByLabelText("Fin *")).toHaveValue("11:00")
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/shifts")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toMatchObject({ eventId: "evt-1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00", capacity: 2, minAge: null })
    expect(onSaved).toHaveBeenCalledWith(saved, null)
  })

  it("edits a shift with PATCH, keeping its display order", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "s9" }) })
    const { onSaved } = setup({
      editingId: "s9",
      initial: { roleName: "Accueil", date: "2026-07-04", startTime: "08:00", endTime: "09:00", capacity: 3, displayOrder: 4 },
    })
    expect(screen.getByRole("heading", { name: "Modifier le créneau" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/shifts/s9")
    expect(init.method).toBe("PATCH")
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ roleName: "Accueil", capacity: 3, displayOrder: 4 })
    expect(body.eventId).toBeUndefined()
    expect(onSaved.mock.calls[0][1]).toBe("s9")
  })

  it("shows the server's error and keeps the form", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Créneau introuvable" }) })
    const { onSaved } = setup({ initial: { roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(await screen.findByText("Créneau introuvable")).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Poste *")).toHaveValue("Bar")
  })

  it("« Annuler » asks to close", () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
