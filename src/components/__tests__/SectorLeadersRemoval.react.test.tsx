/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import SectorLeadersManager from "../admin/SectorLeadersManager"

// The outcome of removing a sector leader, in words a screen reader reads naturally (#574).
describe("SectorLeadersManager — removal outcome", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("says the person is no longer leader of the role, without « ·e »", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    render(<SectorLeadersManager eventId="evt-1" roleNames={["Bar"]} initialLeaders={[{ id: "l1", roleName: "Bar", name: "Chloé Roy", email: "chloe@x.ch" }]} />)
    fireEvent.click(screen.getByRole("button", { name: "Retirer Chloé Roy des responsables de Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }))
    await waitFor(() => expect(screen.getByText("Chloé Roy n'est plus responsable de « Bar ».")).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/sector-leaders/l1", { method: "DELETE" })
    expect(screen.getByText("Chloé Roy n'est plus responsable de « Bar ».")).toHaveAttribute("role", "status")
    expect(document.body.textContent).not.toMatch(/retiré·e/)
  })
})
