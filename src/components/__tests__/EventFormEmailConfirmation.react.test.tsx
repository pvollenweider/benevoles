/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import EventForm from "../admin/EventForm"
import StatusBadge from "../admin/StatusBadge"

describe("the event option « Confirmer l'adresse email » (#1253)", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it("is off by default and saves as on with the event's options", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ publicStatus: "draft" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventForm initialData={{ id: "evt-1", title: "Fête", publicStatus: "draft" }} />)
    const box = screen.getByRole("checkbox", { name: "Confirmer l'adresse email avant l'inscription" })
    expect(box).not.toBeChecked()
    fireEvent.click(box)
    expect(box).toBeChecked()
    fireEvent.change(screen.getByLabelText("Titre *"), { target: { value: "Fête 2027" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))
    expect(body.requireEmailConfirmation).toBe(true)
  })
})

describe("the organizer's status label (#1253)", () => {
  it("names the pending confirmation by email", () => {
    render(<StatusBadge status="unconfirmed" />)
    expect(screen.getByText("En attente de confirmation par email")).toBeInTheDocument()
  })
})
