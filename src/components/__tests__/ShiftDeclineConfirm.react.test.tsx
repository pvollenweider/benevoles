/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import ShiftDeclineConfirm from "@/components/public/ShiftDeclineConfirm"

// « Je ne peux pas » for one shift (#1303), the confirmation page: one heading, at most one
// button, the POST's result announced and focused. Reading the page itself never writes.

const props = {
  secret: "invitation" as const,
  token: "tok-1",
  shiftId: "shift-1",
  state: "open" as const,
  eventTitle: "Fête du village",
  shiftName: "Bar (Soir)",
  shiftDay: "samedi 4 juillet",
  shiftHours: "de 22:00 à 02:00 le lendemain",
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ShiftDeclineConfirm (#1303)", () => {
  it("names the shift, has one heading and one button, and announces the recorded answer", async () => {
    render(<ShiftDeclineConfirm {...props} />)
    expect(screen.getAllByRole("heading")).toHaveLength(1)
    expect(screen.getByRole("heading", { name: "Bar (Soir)" })).toBeInTheDocument()
    const button = screen.getByRole("button", { name: "Confirmer que je ne peux pas" })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("C'est noté."))
    expect(screen.getByRole("status")).toHaveFocus()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("posts to the invitation's own route, once", async () => {
    render(<ShiftDeclineConfirm {...props} />)
    fireEvent.click(screen.getByRole("button", { name: "Confirmer que je ne peux pas" }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith("/api/public/member-invite/tok-1/shift-declines/shift-1", { method: "POST" })
  })

  it("shows a clear page with no button for an already answered shift", () => {
    render(<ShiftDeclineConfirm {...props} state="declined" declinedOn="20 juin 2026" />)
    expect(screen.getAllByRole("heading")).toHaveLength(1)
    expect(screen.getByRole("heading", { name: "C'est déjà noté" })).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("keeps the button and says so when the confirmation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    render(<ShiftDeclineConfirm {...props} />)
    fireEvent.click(screen.getByRole("button", { name: "Confirmer que je ne peux pas" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La confirmation n'a pas pu être envoyée."))
    expect(screen.getByRole("button", { name: "Confirmer que je ne peux pas" })).toBeInTheDocument()
  })
})
