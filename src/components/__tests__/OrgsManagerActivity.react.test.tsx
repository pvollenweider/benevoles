/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

import OrgsManager from "@/components/super-admin/OrgsManager"
import { ORG_ACTIVITY_FILTER_HREF, type EventActivityTone } from "@/lib/org-list-activity"

// Organisations list (#1415): the « Activité » text stays the meaning, the pill only reinforces it;
// the 30-day filter is a server-side link that keeps the chosen sort.

const orgRow = (over: Record<string, unknown> = {}) => ({
  id: "org-fete",
  name: "Fête du village",
  slug: "fete",
  active: true,
  suspendedAt: null,
  publicationApprovedAt: null,
  outboundEmailApprovedAt: null,
  autoApprovedAt: null,
  autoApprovalReviewedAt: null,
  createdAt: "2026-11-16T09:00:00.000Z",
  createdLabel: "16 nov. 2026",
  activityLabel: "En cours",
  activityTone: "ongoing" as EventActivityTone,
  activityRank: 0,
  ownerLabel: null,
  ownerAlert: false,
  _count: { events: 0, admins: 1, volunteers: 0 },
  ...over,
})

afterEach(cleanup)

describe("the activity badge", () => {
  it("puts the existing text in a green pill while an event is ongoing", () => {
    render(<OrgsManager initialOrgs={[orgRow()]} />)
    const label = screen.getByText("En cours")
    expect(label.tagName).toBe("SPAN")
    expect(label).toHaveClass("rounded-lg", "bg-green-100", "text-green-800")
  })

  it("uses amber within 7 days and blue later, still with the text", () => {
    const { rerender } = render(<OrgsManager initialOrgs={[orgRow({ activityLabel: "Dans 3 jours, le 12 nov.", activityTone: "soon" })]} />)
    expect(screen.getByText("Dans 3 jours, le 12 nov.")).toHaveClass("rounded-lg", "bg-amber-100", "text-amber-800")

    rerender(<OrgsManager initialOrgs={[orgRow({ activityLabel: "À venir le 10 janv. 2027", activityTone: "later" })]} />)
    expect(screen.getByText("À venir le 10 janv. 2027")).toHaveClass("rounded-lg", "bg-gray-100", "text-gray-700")
  })

  it("leaves a past or absent event as plain text, without a pill", () => {
    const { rerender } = render(<OrgsManager initialOrgs={[orgRow({ activityLabel: "Dernier le 4 mars", activityTone: "past" })]} />)
    expect(screen.getByText("Dernier le 4 mars")).not.toHaveClass("rounded-lg")

    rerender(<OrgsManager initialOrgs={[orgRow({ activityLabel: "Aucun événement", activityTone: "none" })]} />)
    expect(screen.getByText("Aucun événement")).not.toHaveClass("rounded-lg")
  })
})

describe("the 30-day activity filter", () => {
  it("links to the filtered list and keeps the chosen sort", () => {
    render(<OrgsManager initialOrgs={[orgRow()]} initialSort={{ col: "nom", dir: "desc" }} />)
    expect(screen.getByRole("link", { name: "Afficher seulement les espaces avec un événement en cours ou dans les 30 jours" })).toHaveAttribute("href", `${ORG_ACTIVITY_FILTER_HREF}&tri=nom-desc`)
  })

  it("states that the filter is active and goes back to the full list, sort kept", () => {
    render(<OrgsManager initialOrgs={[orgRow()]} activityFilter initialSort={{ col: "nom", dir: "desc" }} />)
    expect(screen.getByText(/Seuls les espaces avec un événement en cours ou dans les 30 jours sont affichés\./)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir tous les espaces" })).toHaveAttribute("href", "/super-admin/organizations?tri=nom-desc")
  })

  it("says no space matches the filter", () => {
    render(<OrgsManager initialOrgs={[]} activityFilter />)
    expect(screen.getByText("Aucun espace avec un événement en cours ou dans les 30 jours.")).toBeInTheDocument()
    expect(screen.queryByText("Aucune organisation. Créez-en une pour commencer.")).toBeNull()
  })
})
