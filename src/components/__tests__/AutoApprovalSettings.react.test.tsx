/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react"
import AutoApprovalSettings from "../super-admin/AutoApprovalSettings"
import type { AutoApprovalView } from "@/lib/auto-approval"

const view = (over: Partial<AutoApprovalView> = {}): AutoApprovalView => ({
  state: "off",
  until: null,
  untilLabel: null,
  activatedAt: null,
  activatedAtLabel: null,
  activatedByLabel: null,
  budgetUsed: 0,
  budgetCeiling: 20,
  totalSinceActivation: 0,
  cutOffAt: null,
  cutOffLabel: null,
  cutOffNotice: null,
  today: "2026-11-16",
  maxUntil: "2026-12-16",
  maxUntilLabel: "16 décembre 2026",
  ...over,
})

const on = (over: Partial<AutoApprovalView> = {}) => view({
  state: "on",
  until: "2026-11-28",
  untilLabel: "28 novembre 2026",
  activatedAt: "2026-11-16T10:00:00.000Z",
  activatedAtLabel: "16 novembre 2026 à 11:00",
  activatedByLabel: "Opérateur",
  ...over,
})

const ok = (data: AutoApprovalView) => ({ ok: true, json: async () => data })

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("the automatic validation section (#1371)", () => {
  it("offers the date field with its minimum, maximum and computed hint", () => {
    render(<AutoApprovalSettings initial={view()} />)
    const input = screen.getByLabelText(/Jusqu'au/)
    expect(input).toHaveAttribute("type", "date")
    expect(input).toHaveAttribute("min", "2026-11-16")
    expect(input).toHaveAttribute("max", "2026-12-16")
    expect(input).toBeRequired()
    expect(screen.getByText(/Dernier jour inclus\. Au plus tard le 16 décembre 2026 \(30 jours au plus\)\./)).toBeInTheDocument()
    expect(screen.getByText("Désactivée : les nouveaux espaces restent en attente jusqu'à votre validation.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir les espaces validés automatiquement, à relire" })).toHaveAttribute("href", "/super-admin/organizations?filtre=auto-a-relire")
  })

  it("marks and focuses the missing date, without opening the dialog", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    render(<AutoApprovalSettings initial={view()} />)
    fireEvent.click(screen.getByRole("button", { name: "Activer" }))
    await screen.findByText("Indiquez une date de fin.")
    expect(screen.getByLabelText(/Jusqu'au/)).toHaveFocus()
    expect(screen.getByLabelText(/Jusqu'au/)).toHaveAccessibleDescription(/Indiquez une date de fin\./)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("confirms the activation, starts with Cancel focused, and returns focus to the heading after it", async () => {
    const fetch = vi.fn().mockResolvedValue(ok(on()))
    vi.stubGlobal("fetch", fetch)
    render(<AutoApprovalSettings initial={view()} />)

    fireEvent.change(screen.getByLabelText(/Jusqu'au/), { target: { value: "2026-11-28" } })
    fireEvent.click(screen.getByRole("button", { name: "Activer" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveAccessibleName("Activer la validation automatique jusqu'au 28 novembre 2026 inclus ?")
    expect(screen.getByText(/Personne ne regarde les nouveaux espaces pendant ce temps\./)).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Annuler" })).toHaveFocus()

    fireEvent.click(within(dialog).getByRole("button", { name: "Activer" }))
    await waitFor(() => expect(screen.getByText(/Activée jusqu'au 28 novembre 2026 inclus, par Opérateur le 16 novembre 2026 à 11:00\./)).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith("/api/super-admin/auto-approval", expect.objectContaining({ method: "PUT" }))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ until: "2026-11-28" })
    expect(screen.getByRole("heading", { name: "Validation automatique des nouveaux espaces" })).toHaveFocus()
  })

  it("cancel closes the dialog and returns focus to the opener", async () => {
    render(<AutoApprovalSettings initial={view()} />)
    fireEvent.change(screen.getByLabelText(/Jusqu'au/), { target: { value: "2026-11-28" } })
    const opener = screen.getByRole("button", { name: "Activer" })
    fireEvent.click(opener)
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(opener).toHaveFocus()
  })

  it("turns off from the running state and moves focus to the heading", async () => {
    const fetch = vi.fn().mockResolvedValue(ok(view()))
    vi.stubGlobal("fetch", fetch)
    render(<AutoApprovalSettings initial={on({ budgetUsed: 3, totalSinceActivation: 12 })} />)
    expect(screen.getByText("Aujourd'hui : 3 sur 20")).toBeInTheDocument()
    expect(screen.getByText("Depuis l'activation : 12")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Désactiver maintenant" }))
    await waitFor(() => expect(screen.getByText("Désactivée : les nouveaux espaces restent en attente jusqu'à votre validation.")).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith("/api/super-admin/auto-approval", expect.objectContaining({ method: "DELETE" }))
    expect(screen.getByRole("heading", { name: "Validation automatique des nouveaux espaces" })).toHaveFocus()
  })

  it("moves focus to the date field when opening the change form, and back to the button on cancel", async () => {
    render(<AutoApprovalSettings initial={on()} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la date de fin" }))
    await waitFor(() => expect(screen.getByLabelText(/Jusqu'au/)).toHaveFocus())
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Modifier la date de fin" })).toHaveFocus())
  })

  it("changes the end day through the same dialog", async () => {
    const fetch = vi.fn().mockResolvedValue(ok(on({ until: "2026-12-01", untilLabel: "1 décembre 2026" })))
    vi.stubGlobal("fetch", fetch)
    render(<AutoApprovalSettings initial={on()} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la date de fin" }))
    const input = screen.getByLabelText(/Jusqu'au/)
    expect(input).toHaveValue("2026-11-28")
    fireEvent.change(input, { target: { value: "2026-12-01" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la date de fin" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveAccessibleName("Modifier la date de fin jusqu'au 1 décembre 2026 inclus ?")
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByText(/Activée jusqu'au 1 décembre 2026 inclus/)).toBeInTheDocument(), { timeout: 3000 })
  })

  it("dismisses the cut-off notice and moves focus to the heading", async () => {
    const before = on({ state: "cut_off", cutOffAt: "2026-11-16T09:30:00.000Z", cutOffLabel: "16 novembre 2026 à 10:30", cutOffNotice: "Attention : coupée automatiquement le 16 novembre 2026 à 10:30 : plafond de 20 validations atteint." })
    const fetch = vi.fn().mockResolvedValue(ok({ ...before, cutOffNotice: null }))
    vi.stubGlobal("fetch", fetch)
    render(<AutoApprovalSettings initial={before} />)
    expect(screen.getByText(/^Attention : coupée automatiquement le 16 novembre 2026 à 10:30/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Masquer cet avis" }))
    await waitFor(() => expect(screen.queryByText(/^Attention : coupée automatiquement/)).toBeNull())
    expect(fetch).toHaveBeenCalledWith("/api/super-admin/auto-approval/dismiss", expect.objectContaining({ method: "POST" }))
    expect(screen.getByRole("heading", { name: "Validation automatique des nouveaux espaces" })).toHaveFocus()
  })

  it("shows the server's date error on the field and focuses it", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Choisissez une date entre aujourd'hui et le 16 décembre 2026.", field: "until" }) })
    vi.stubGlobal("fetch", fetch)
    render(<AutoApprovalSettings initial={view()} />)
    fireEvent.change(screen.getByLabelText(/Jusqu'au/), { target: { value: "2026-11-28" } })
    fireEvent.click(screen.getByRole("button", { name: "Activer" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Activer" }))
    await waitFor(() => expect(screen.getByLabelText(/Jusqu'au/)).toHaveFocus())
    expect(screen.getByLabelText(/Jusqu'au/)).toHaveAccessibleDescription(/Choisissez une date entre aujourd'hui et le 16 décembre 2026\./)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("states the expired and cut-off situations in plain words", () => {
    render(<AutoApprovalSettings initial={view({ state: "expired", until: "2026-11-10", untilLabel: "10 novembre 2026" })} />)
    expect(screen.getByText("Expirée le 10 novembre 2026 : les nouveaux espaces restent en attente jusqu'à votre validation.")).toBeInTheDocument()
    cleanup()
    render(<AutoApprovalSettings initial={on({ state: "cut_off", cutOffLabel: "16 novembre 2026 à 10:30" })} />)
    expect(screen.getByText("Coupée automatiquement le 16 novembre 2026 à 10:30 : plafond de 20 validations atteint. Les nouveaux espaces restent en attente jusqu'à votre validation.")).toBeInTheDocument()
  })
})
