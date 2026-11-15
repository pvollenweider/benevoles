/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import EventReminderRulesForm from "../admin/EventReminderRulesForm"
import type { EventReminderRulesState } from "@/lib/reminder-rules"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const blocked: EventReminderRulesState["preview"] = {
  state: "blocked", reason: "no-rules", detail: null, ruleId: null, dueAt: null, localDay: null, recipientCount: 0, shiftCount: 0,
}
const scheduled: EventReminderRulesState["preview"] = {
  state: "scheduled", reason: null, detail: null, ruleId: "r1", dueAt: "2030-06-12T06:00:00.000Z", localDay: "2030-06-12",
  recipientCount: 14, shiftCount: 22,
}

const state = (over: Partial<EventReminderRulesState> = {}): EventReminderRulesState => ({
  mode: "default",
  rules: [],
  preview: blocked,
  ...over,
})

const renderForm = (initialState: EventReminderRulesState) =>
  render(<EventReminderRulesForm eventId="evt-1" timeZone="Europe/Zurich" initialState={initialState} />)

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  clone: () => ({ json: async () => body }),
})

const ruleGroup = (name: string) => screen.getByRole("group", { name })

describe("EventReminderRulesForm (#1139)", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    refresh.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("reveals the rules only for the event's own delays, starting with 1 day active, without a live region or focus move", () => {
    renderForm(state())
    const custom = screen.getByRole("radio", { name: "Délais propres à cet événement" })
    expect(custom).not.toHaveAttribute("aria-expanded")
    const before = document.activeElement
    fireEvent.click(custom)
    const group = ruleGroup("Rappel 1")
    expect(within(group).getByRole("textbox", { name: "Délai" })).toHaveValue("1")
    expect(within(group).getByRole("combobox", { name: "Unité" })).toHaveValue("days")
    expect(within(group).getByRole("checkbox", { name: "Actif" })).toBeChecked()
    expect(document.activeElement).toBe(before)
    expect(screen.queryByText(/retiré/)).not.toBeInTheDocument()
  })

  it("keeps the rules when switching back to the usual delays and returning", () => {
    renderForm(state())
    fireEvent.click(screen.getByRole("radio", { name: "Délais propres à cet événement" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Délai" }), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("radio", { name: /Délais habituels/ }))
    expect(screen.queryByRole("group", { name: "Rappel 1" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Délais propres à cet événement" }))
    expect(screen.getByRole("textbox", { name: "Délai" })).toHaveValue("5")
  })

  it("adds a rule and moves the focus to its delay input", () => {
    renderForm(state({ mode: "custom", rules: [{ id: "r1", unit: "days", value: 1, enabled: true }], preview: scheduled }))
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un rappel" }))
    const second = ruleGroup("Rappel 2")
    const input = within(second).getByRole("textbox", { name: "Délai" })
    expect(input).toHaveValue("1")
    expect(input).toHaveFocus()
  })

  it("removes a rule, says how many are left and moves the focus to the add button", () => {
    renderForm(state({
      mode: "custom",
      rules: [{ id: "r1", unit: "days", value: 7, enabled: true }, { id: "r2", unit: "hours", value: 2, enabled: true }],
      preview: scheduled,
    }))
    fireEvent.click(screen.getByRole("button", { name: "Retirer le rappel 1" }))
    expect(screen.getByText("Rappel 1 retiré. Il reste 1 rappel.")).toHaveAttribute("role", "status")
    expect(screen.getByRole("button", { name: "Ajouter un rappel" })).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Retirer le rappel 1" })).not.toBeInTheDocument()
  })

  it("offers no remove button on a single rule", () => {
    renderForm(state({ mode: "custom", rules: [{ id: "r1", unit: "days", value: 1, enabled: true }], preview: scheduled }))
    expect(screen.queryByRole("button", { name: /^Retirer le rappel/ })).not.toBeInTheDocument()
  })

  it("stops at three rules and says so, without the add button", () => {
    renderForm(state({
      mode: "custom",
      rules: [
        { id: "r1", unit: "days", value: 7, enabled: true },
        { id: "r2", unit: "days", value: 2, enabled: true },
        { id: "r3", unit: "hours", value: 2, enabled: true },
      ],
      preview: scheduled,
    }))
    expect(screen.queryByRole("button", { name: "Ajouter un rappel" })).not.toBeInTheDocument()
    expect(screen.getByText("Trois rappels au maximum.")).toBeInTheDocument()
  })

  it("validates the bounds at submit, marks the input and describes it with the error", () => {
    renderForm(state({ mode: "custom", rules: [{ id: "r1", unit: "hours", value: 1, enabled: true }], preview: scheduled }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les rappels" }))
    const input = screen.getByRole("textbox", { name: "Délai" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveFocus()
    expect(input.getAttribute("aria-describedby")).toContain("-error")
    expect(screen.getByText("Rappel 1 : un rappel en heures doit être compris entre 2 et 336 heures.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("attaches a server error carrying rule to that rule's input", async () => {
    fetchMock.mockResolvedValue(json({ error: "Rappel 2 : le délai doit être un nombre entier.", rule: 2 }, 400))
    renderForm(state({
      mode: "custom",
      rules: [{ id: "r1", unit: "days", value: 7, enabled: true }, { id: "r2", unit: "hours", value: 2, enabled: true }],
      preview: scheduled,
    }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les rappels" }))
    const second = ruleGroup("Rappel 2")
    const input = within(second).getByRole("textbox", { name: "Délai" })
    expect(await screen.findByText("Rappel 2 : le délai doit être un nombre entier.")).toBeInTheDocument()
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveFocus()
  })

  it("keeps a general server error in the alert", async () => {
    fetchMock.mockResolvedValue(json({ error: "Une erreur est survenue." }, 500))
    renderForm(state({ mode: "custom", rules: [{ id: "r1", unit: "days", value: 1, enabled: true }], preview: scheduled }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les rappels" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Une erreur est survenue.")
  })

  it("says the save succeeded with the new next send, then refreshes without remounting", async () => {
    fetchMock.mockResolvedValue(json(state({
      mode: "custom",
      rules: [{ id: "r1", unit: "days", value: 1, enabled: true }],
      preview: scheduled,
    })))
    renderForm(state({ mode: "custom", rules: [{ id: "r1", unit: "days", value: 7, enabled: true }], preview: scheduled }))
    const input = screen.getByRole("textbox", { name: "Délai" })
    fireEvent.change(input, { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les rappels" }))
    expect(await screen.findByText(/Rappels enregistrés\. Prochain rappel : mercredi 12 juin à 08:00, pour 14 personnes \(22 créneaux\)\./)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("textbox", { name: "Délai" })).toBe(input)
    expect(screen.getByRole("textbox", { name: "Délai" })).toHaveValue("1")
  })

  it("keeps the edited input mounted and focused when the server resolves its row to a new id", async () => {
    // Changing a delay creates a new rule row server-side: the response id differs from the id the
    // form sent. The edited input must not remount (its DOM node stays, focus included).
    fetchMock.mockResolvedValue(json(state({
      mode: "custom",
      rules: [{ id: "r-new", unit: "days", value: 6, enabled: true }],
      preview: scheduled,
    })))
    renderForm(state({ mode: "custom", rules: [{ id: "r-old", unit: "days", value: 7, enabled: true }], preview: scheduled }))
    const input = screen.getByRole("textbox", { name: "Délai" })
    fireEvent.change(input, { target: { value: "6" } })
    input.focus()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les rappels" }))
    expect(await screen.findByText(/Rappels enregistrés\./)).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Délai" })).toBe(input)
    expect(input).toHaveValue("6")
    expect(input).toHaveFocus()
    expect(screen.queryByText("Enregistrez pour mettre à jour le prochain envoi.")).not.toBeInTheDocument()
  })

  it("says a save is needed while the form differs from the saved state", () => {
    renderForm(state({ mode: "custom", rules: [{ id: "r1", unit: "days", value: 7, enabled: true }], preview: scheduled }))
    expect(screen.getByText("Prochain rappel : mercredi 12 juin à 08:00, pour 14 personnes (22 créneaux).")).toBeInTheDocument()
    const input = screen.getByRole("textbox", { name: "Délai" })
    fireEvent.change(input, { target: { value: "2" } })
    const sentence = screen.getByText("Enregistrez pour mettre à jour le prochain envoi.")
    expect(sentence).not.toHaveAttribute("role")
    expect(screen.getByRole("button", { name: "Enregistrer les rappels" })).toHaveAttribute("aria-describedby", sentence.id)
  })
})
