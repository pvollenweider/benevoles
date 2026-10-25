/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

import OrgHourRateForm from "../admin/OrgHourRateForm"

// Valorisation du bénévolat (#867): an error marks only the field at fault, describes it and takes
// the focus there; nothing is sent while the input is invalid.
describe("OrgHourRateForm", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  const empty = { cents: null, currency: "" as const, setAt: null }

  it("a rate without a currency marks the currency only, without a request", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<OrgHourRateForm initial={empty} timeZone="Europe/Zurich" />)
    const rate = screen.getByLabelText("Taux horaire (facultatif)")
    const currency = screen.getByLabelText("Devise")
    fireEvent.change(rate, { target: { value: "28,50" } })
    expect(currency).toHaveAttribute("aria-required", "true")
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(currency).toHaveAttribute("aria-invalid", "true")
    expect(currency).toHaveFocus()
    expect(currency).toHaveAccessibleDescription(/Obligatoire si vous indiquez un taux\. Choisissez la devise du taux horaire\./)
    expect(rate).not.toHaveAttribute("aria-invalid")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("an invalid amount marks the rate", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<OrgHourRateForm initial={empty} timeZone="Europe/Zurich" />)
    const rate = screen.getByLabelText("Taux horaire (facultatif)")
    fireEvent.change(rate, { target: { value: "-3" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(rate).toHaveAttribute("aria-invalid", "true")
    expect(rate).toHaveFocus()
    expect(screen.getByRole("alert")).toHaveTextContent("Indiquez un montant positif, par exemple 28,50.")
  })

  it("saves the rate and its currency, then shows the saved rate and its date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ volunteerHourRateCents: 2850, volunteerHourRateCurrency: "CHF", volunteerHourRateSetAt: "2026-10-20T08:00:00.000Z" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    render(<OrgHourRateForm initial={empty} timeZone="Europe/Zurich" />)
    fireEvent.change(screen.getByLabelText("Taux horaire (facultatif)"), { target: { value: "28,50" } })
    fireEvent.change(screen.getByLabelText("Devise"), { target: { value: "CHF" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("status").textContent?.replace(/[  ]/g, " ")).toBe("Taux horaire enregistré : 28,50 CHF de l'heure."))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ volunteerHourRate: "28,50", volunteerHourRateCurrency: "CHF" })
    expect(screen.getByText(/Taux enregistré le 20 octobre 2026/)).toBeInTheDocument()
  })

  it("a network failure is said without marking a field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")))
    render(<OrgHourRateForm initial={empty} timeZone="Europe/Zurich" />)
    const rate = screen.getByLabelText("Taux horaire (facultatif)")
    fireEvent.change(rate, { target: { value: "20" } })
    fireEvent.change(screen.getByLabelText("Devise"), { target: { value: "EUR" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Impossible d'enregistrer."))
    expect(rate).not.toHaveAttribute("aria-invalid")
    expect(screen.getByLabelText("Devise")).not.toHaveAttribute("aria-invalid")
  })
})
