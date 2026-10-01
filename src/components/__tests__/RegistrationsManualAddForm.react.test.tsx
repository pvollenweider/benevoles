/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { useState } from "react"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import ManualAddForm from "../admin/registrations/ManualAddForm"
import { EMPTY_ADD_FORM, type AddFormValues, type Registration } from "../admin/registrations/types"

// Manual addition of a registration by the organizer, on its own (#402, #465, #466).
const shift = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 1 }

function Harness({ initial = EMPTY_ADD_FORM, onAdded = () => {}, onCancel = () => {} }: { initial?: AddFormValues; onAdded?: (r: Registration) => void; onCancel?: () => void }) {
  const [form, setForm] = useState(initial)
  return <ManualAddForm eventId="evt-1" shifts={[shift]} registrations={[]} timeZone="Europe/Zurich" form={form} onFormChange={setForm} onAdded={onAdded} onCancel={onCancel} />
}

describe("ManualAddForm", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("posts the typed values and hands the created registration back", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({
        id: "r9", status: "active", source: "admin_manual", comment: null, createdAt: "2026-06-01T00:00:00.000Z",
        volunteer: { id: "v9", firstName: "Chloé", lastName: "Roy", email: null, phone: null },
        shift: { ...shift, date: "2026-07-04T00:00:00.000Z" },
      }),
    })
    const onAdded = vi.fn()
    render(<Harness initial={{ ...EMPTY_ADD_FORM, shiftId: "s1" }} onAdded={onAdded} />)
    expect(screen.getByRole("heading", { name: "Inscription manuelle" })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Prénom *"), { target: { value: "Chloé" } })
    fireEvent.change(screen.getByLabelText("Nom *"), { target: { value: "Roy" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/registrations")
    expect(JSON.parse(init.body)).toEqual({ eventId: "evt-1", firstName: "Chloé", lastName: "Roy", email: "", phone: "", shiftId: "s1", comment: "" })
    const reg = onAdded.mock.calls[0][0] as Registration
    expect(reg).toMatchObject({ id: "r9", isLeader: false, waitingPosition: null })
    expect(reg.shift).toMatchObject({ id: "s1", date: "2026-07-04", capacity: 3, registrationCount: 2 })
  })

  it("asks for a shift before sending anything", () => {
    render(<Harness />)
    fireEvent.submit(screen.getByRole("button", { name: "Ajouter" }).closest("form")!)
    expect(screen.getByRole("alert")).toHaveTextContent("Sélectionnez un créneau.")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("offers to go past the role limit, only for the form that was refused", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "role_limit", error: "Limite atteinte pour ce poste." }) })
    render(<Harness initial={{ ...EMPTY_ADD_FORM, firstName: "A", lastName: "B", shiftId: "s1" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    const force = await screen.findByRole("button", { name: "Ajouter quand même" })
    expect(screen.getByRole("alert")).toHaveTextContent("Limite atteinte pour ce poste.")
    expect(force).toHaveAccessibleDescription("Limite atteinte pour ce poste.")

    fireEvent.change(screen.getByLabelText("Nom *"), { target: { value: "C" } })
    expect(screen.queryByRole("button", { name: "Ajouter quand même" })).toBeNull()
    expect(screen.getByRole("alert")).toHaveTextContent("Le formulaire a changé : validez à nouveau.")
  })

  it("closes through Annuler", () => {
    const onCancel = vi.fn()
    render(<Harness onCancel={onCancel} />)
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onCancel).toHaveBeenCalled()
  })
})
