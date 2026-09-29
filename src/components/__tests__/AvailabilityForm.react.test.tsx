/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import AvailabilityForm from "../AvailabilityForm"

// « Mes disponibilités » on the personal page (#402).
describe("AvailabilityForm", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("starts from the saved values and only lets you save once something changed", () => {
    render(<AvailabilityForm token="tok" initialPeriods={["morning"]} initialNote="pas le dimanche" />)
    expect(screen.getByRole("checkbox", { name: "Matin" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Soir" })).not.toBeChecked()
    expect(screen.getByLabelText(/Sauf…/)).toHaveValue("pas le dimanche")
    const save = screen.getByRole("button", { name: "Enregistrer mes disponibilités" })
    fireEvent.click(save)
    expect(screen.getByRole("status")).toHaveTextContent("Aucune modification à enregistrer.")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("saves through the token route and announces the result", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ availabilityPeriods: ["morning", "evening"], availabilityNote: null }) })
    render(<AvailabilityForm token="tok" initialPeriods={["morning"]} initialNote={null} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Soir" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes disponibilités" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/public/registrations/tok/availability")
    expect(JSON.parse(init.body)).toEqual({ availabilityPeriods: ["morning", "evening"], availabilityNote: null })
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Disponibilités enregistrées : Matin, Soir."))
    expect(screen.getByRole("button", { name: "Enregistrer mes disponibilités" })).toHaveAttribute("aria-disabled", "false")
  })

  it("shows the server's refusal", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Trop de tentatives." }) })
    render(<AvailabilityForm token="tok" initialPeriods={[]} initialNote={null} />)
    fireEvent.change(screen.getByLabelText(/Sauf…/), { target: { value: "semaine" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes disponibilités" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives.")
  })
})
