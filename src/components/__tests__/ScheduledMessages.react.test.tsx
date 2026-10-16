/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

import ScheduledMessages from "../admin/messages/ScheduledMessages"
import type { ScheduledMessageItem } from "@/lib/message-history-data"

// « Messages programmés » (#1019): listed with their date, cancellable until they go.

const fetchMock = vi.fn()
const item = (over: Partial<ScheduledMessageItem> = {}): ScheduledMessageItem => ({
  id: "sm-1", subject: "Rappel parking", message: "Entrée rue Basse.", audienceLabel: "tous les bénévoles inscrits", authorName: "Léa",
  scheduledFor: "2026-10-20T16:00:00.000Z", when: "mardi 20 octobre à 18:00", pending: true, state: "Programmé, pas encore parti", ...over,
})

describe("ScheduledMessages", () => {
  beforeEach(() => { fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchMock) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("always shows its heading, and says when nothing is scheduled", () => {
    render(<ScheduledMessages eventId="evt-1" items={[]} timeZone="Europe/Zurich" />)
    expect(screen.getByRole("heading", { level: 2, name: "Messages programmés" })).toBeInTheDocument()
    expect(screen.getByText("Aucun envoi programmé pour cet événement.")).toBeInTheDocument()
  })

  it("lists « Programmé pour » with the zone, the state in words, and a cancel button only while pending", () => {
    render(<ScheduledMessages eventId="evt-1" items={[item(), item({ id: "sm-2", subject: "Ancien", pending: false, state: "Annulé le lundi 19 octobre à 10:00, par Léa" })]} timeZone="Europe/Zurich" />)
    const first = screen.getByRole("article", { name: "Rappel parking" })
    expect(first).toHaveTextContent("Programmé pourle mardi 20 octobre à 18:00 (Europe/Zurich), par Léa")
    expect(within(first).getByRole("button", { name: /^Annuler l'envoi ?: « Rappel parking »$/ })).toBeInTheDocument()
    const second = screen.getByRole("article", { name: "Ancien" })
    expect(second).toHaveTextContent("Annulé le lundi 19 octobre à 10:00, par Léa")
    expect(within(second).queryByRole("button")).not.toBeInTheDocument()
  })

  it("confirms, cancels once, focuses the item and announces it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ cancelled: true }) })
    render(<ScheduledMessages eventId="evt-1" items={[item()]} timeZone="Europe/Zurich" />)
    fireEvent.click(screen.getByRole("button", { name: /^Annuler l'envoi/ }))
    const dialog = screen.getByRole("alertdialog", { name: "Annuler cet envoi programmé ?" })
    expect(dialog).toHaveAccessibleDescription(/« Rappel parking » ne partira pas le mardi 20 octobre à 18:00/)
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Garder l'envoi" })).toHaveFocus())
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler l'envoi" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/events/evt-1/scheduled-messages/sm-1/cancel")
    expect(screen.getByRole("heading", { level: 3, name: "Rappel parking" })).toHaveFocus()
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Envoi programmé de « Rappel parking » annulé."))
    expect(refresh).toHaveBeenCalled()
  })

  it("keeps the dialog open with the reason when it is too late", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Trop tard : ce message est déjà parti ou a déjà été annulé." }) })
    render(<ScheduledMessages eventId="evt-1" items={[item()]} timeZone="Europe/Zurich" />)
    fireEvent.click(screen.getByRole("button", { name: /^Annuler l'envoi/ }))
    const dialog = screen.getByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler l'envoi" }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Trop tard")
    // A 500 (no status 409 here): nothing to refresh.
    expect(refresh).not.toHaveBeenCalled()
  })

  it("keeps the focus on the cancelled item when the refresh moves it down the list", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ cancelled: true }) })
    const a = item({ id: "a", subject: "Premier" })
    const b = item({ id: "b", subject: "Second" })
    const { rerender } = render(<ScheduledMessages eventId="evt-1" items={[a, b]} timeZone="Europe/Zurich" />)
    fireEvent.click(screen.getByRole("button", { name: /^Annuler l'envoi ?: « Premier »/ }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Annuler l'envoi" }))
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Premier" })).toHaveFocus())
    // What router.refresh() brings: the cancelled item after the pending one.
    rerender(<ScheduledMessages eventId="evt-1" items={[b, { ...a, pending: false, state: "Annulé" }]} timeZone="Europe/Zurich" />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Premier" })).toHaveFocus())
  })

  it("refreshes when it is too late, and lands on the item when the dialog closes", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Trop tard : ce message est déjà parti ou a déjà été annulé." }) })
    render(<ScheduledMessages eventId="evt-1" items={[item()]} timeZone="Europe/Zurich" />)
    fireEvent.click(screen.getByRole("button", { name: /^Annuler l'envoi/ }))
    const dialog = screen.getByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler l'envoi" }))
    await within(dialog).findByRole("alert")
    expect(refresh).toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "Garder l'envoi" }))
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Rappel parking" })).toHaveFocus())
  })
})
