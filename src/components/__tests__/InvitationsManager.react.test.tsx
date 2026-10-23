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

const invite = (id: string, over: Partial<{ usedAt: string | null; declinedAt: string | null; registered: boolean; recentlyContacted: boolean }> = {}) => ({
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
  recentlyContacted: false,
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

  it("each card is named by its visible text, the count then the state (WCAG 2.5.3)", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    expect(screen.getByRole("button", { name: "3 Invités" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1 Inscrits" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1 Pas disponible" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1 Sans réponse" })).toBeInTheDocument()
  })

  it("the chosen filter stays distinct in forced colours, where the ring vanishes", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    expect(screen.getByRole("button", { name: "3 Invités" })).toHaveClass(
      "forced-colors:aria-pressed:bg-[Highlight]",
      "forced-colors:aria-pressed:text-[HighlightText]",
    )
  })

  it("clicking a card filters the table and announces the result, not on first render", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={invites} />)
    const status = document.getElementById("invitations-filter-status")!
    expect(status).toHaveTextContent("")

    fireEvent.click(screen.getByRole("button", { name: "1 Sans réponse" }))
    expect(screen.getByText("Fc L")).toBeInTheDocument()
    expect(screen.queryByText("Fa L")).not.toBeInTheDocument()
    expect(status).toHaveTextContent("Sans réponse : 1 invité affiché.")

    fireEvent.click(screen.getByRole("button", { name: "3 Invités" }))
    expect(screen.getByText("Fa L")).toBeInTheDocument()
    expect(status).toHaveTextContent("Invités : 3 invités affichés.")
  })

  it("announces an empty filter in French", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={[invite("a", { registered: true })]} />)
    fireEvent.click(screen.getByRole("button", { name: "0 Pas disponible" }))
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

describe("InvitationsManager — reminders skip anyone emailed less than 48 hours ago (#1105)", () => {
  afterEach(() => { cleanup() })

  it("counts only who will receive the reminder, and says why the others are left out", () => {
    const list = [invite("c"), invite("d", { recentlyContacted: true }), invite("e", { recentlyContacted: true })]
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={list} />)
    const button = screen.getByRole("button", { name: "Relancer la personne sans créneau" })
    expect(button).not.toHaveAttribute("aria-disabled")
    expect(button).toHaveAccessibleDescription("2 personnes invitées ou relancées il y a moins de 48 heures ne seront pas relancées cette fois.")
    // The free message still reaches every invitee without an answer.
    expect(screen.getByRole("link", { name: "Écrire un message aux 3 sans créneau" })).toBeInTheDocument()
  })

  it("keeps the button, unavailable, when everyone was emailed less than 48 hours ago", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={[invite("c", { recentlyContacted: true })]} />)
    const button = screen.getByRole("button", { name: "Relancer la personne sans créneau" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAccessibleDescription("La personne sans créneau a été invitée ou relancée il y a moins de 48 heures : vous pourrez la relancer après ce délai.")
    fireEvent.click(button)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("names the unavailable button without a count when several were emailed recently", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={[invite("c", { recentlyContacted: true }), invite("d", { recentlyContacted: true })]} />)
    expect(screen.getByRole("button", { name: "Relancer les sans créneau" })).toHaveAccessibleDescription("Les 2 sans créneau ont été invités ou relancés il y a moins de 48 heures : vous pourrez les relancer après ce délai.")
  })

  it("has no hint when nobody is in the 48-hour window", () => {
    render(<InvitationsManager eventId="evt-1" members={[]} allTags={[]} invites={[invite("c"), invite("d")]} />)
    expect(screen.getByRole("button", { name: "Relancer les 2 sans créneau" })).not.toHaveAttribute("aria-describedby")
  })
})
