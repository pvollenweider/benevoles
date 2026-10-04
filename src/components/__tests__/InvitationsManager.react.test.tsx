/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import InvitationsManager from "../admin/InvitationsManager"

// Invitation states and the filter (#558): the four stat cards double as a filter group, announce
// their result, and have an accessible name that reads the state before the count.

const invite = (id: string, over: Partial<{ usedAt: string | null; declinedAt: string | null; registered: boolean }> = {}) => ({
  id,
  sentAt: "2026-06-01T00:00:00.000Z",
  usedAt: null,
  declinedAt: null,
  volunteerId: id,
  firstName: `F${id}`,
  lastName: "L",
  email: `${id}@x.ch`,
  tags: [],
  registered: false,
  ...over,
})

const invites = [
  invite("a", { registered: true }),
  invite("b", { declinedAt: "2026-06-02T00:00:00.000Z" }),
  invite("c"),
]

describe("InvitationsManager — filter by state (#558)", () => {
  beforeEach(() => {
    // announce() empties the live region then fills it on the next frame (so a repeated text is
    // still voiced); run that frame synchronously so assertions don't need to wait for it.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 })
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("groups the four stat cards under one accessible name", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    expect(screen.getByRole("group", { name: "Filtrer les invités par statut" })).toBeInTheDocument()
  })

  it("each card's accessible name reads the state then the count", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    expect(screen.getByRole("button", { name: "Invités : 3" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Inscrits : 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pas disponible : 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sans réponse : 1" })).toBeInTheDocument()
  })

  it("the chosen filter stays distinct in forced colours, where the ring vanishes", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    expect(screen.getByRole("button", { name: "Invités : 3" })).toHaveClass(
      "forced-colors:aria-pressed:bg-[Highlight]",
      "forced-colors:aria-pressed:text-[HighlightText]",
    )
  })

  it("clicking a card filters the table and announces the result, not on first render", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    const status = document.getElementById("invitations-filter-status")!
    expect(status).toHaveTextContent("")

    fireEvent.click(screen.getByRole("button", { name: "Sans réponse : 1" }))
    expect(screen.getByText("Fc L")).toBeInTheDocument()
    expect(screen.queryByText("Fa L")).not.toBeInTheDocument()
    expect(status).toHaveTextContent("Sans réponse : 1 invité affiché.")

    fireEvent.click(screen.getByRole("button", { name: "Invités : 3" }))
    expect(screen.getByText("Fa L")).toBeInTheDocument()
    expect(status).toHaveTextContent("Invités : 3 invités affichés.")
  })

  it("announces an empty filter in French", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={[invite("a", { registered: true })]} />)
    fireEvent.click(screen.getByRole("button", { name: "Pas disponible : 0" }))
    expect(screen.getByText("Aucun invité dans ce filtre.")).toBeInTheDocument()
  })

  it("the ✓ of a confirmed participation is hidden from assistive tech", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    const badge = screen.getByText("Participation confirmée").closest("span")!
    const glyph = badge.querySelector('[aria-hidden="true"]')
    expect(glyph?.textContent).toBe("✓ ")
  })

  it("does not announce anything on first render", async () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    await waitFor(() => expect(document.getElementById("invitations-filter-status")).toHaveTextContent(""))
  })
})
