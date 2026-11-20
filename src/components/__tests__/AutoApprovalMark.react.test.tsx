/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

import OrgsManager from "@/components/super-admin/OrgsManager"
import OrgDetail from "@/components/super-admin/OrgDetail"

const orgRow = (over: Record<string, unknown> = {}) => ({
  id: "org-fete",
  name: "Fête du village",
  slug: "fete",
  active: true,
  suspendedAt: null,
  publicationApprovedAt: null,
  outboundEmailApprovedAt: null,
  autoApprovedAt: "2026-11-16T09:00:00.000Z",
  autoApprovalReviewedAt: null,
  createdAt: "2026-11-16T09:00:00.000Z",
  createdLabel: "16 nov. 2026",
  activityLabel: "Aucun événement",
  activityTone: "none" as const,
  activityRank: 0,
  ownerLabel: null,
  ownerAlert: false,
  _count: { events: 0, admins: 1, volunteers: 0 },
  ...over,
})

const detailOrg = (over: Record<string, unknown> = {}) => ({
  ...orgRow(),
  suspensionReason: null,
  signupDescription: null,
  signupSource: null,
  signupSourceDetail: null,
  updatedAt: "2026-11-16T09:10:00.000Z",
  admins: [{ id: "adm-owner", name: "Sacha Bonvin", email: "sacha.bonvin@example.org", role: "admin", isActive: true, createdAt: "2026-11-16T09:00:00.000Z" }],
  ...over,
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("the automatic validation mark (#1371)", () => {
  it("shows « Validation automatique, à relire » in the organisations list, with the screen-reader separator", () => {
    render(<OrgsManager initialOrgs={[orgRow()]} />)
    const mark = screen.getByText("Validation automatique, à relire")
    expect(mark).toHaveClass("text-amber-800")
    expect(mark.previousElementSibling).toHaveClass("sr-only")
    expect(mark.previousElementSibling?.textContent).toBe(". ")
  })

  it("hides the mark once the space was reread", () => {
    render(<OrgsManager initialOrgs={[orgRow({ autoApprovalReviewedAt: "2026-11-16T10:00:00.000Z" })]} />)
    expect(screen.queryByText("Validation automatique, à relire")).toBeNull()
  })

  it("says no space is left to reread when the filter matches nothing", () => {
    render(<OrgsManager initialOrgs={[]} filter />)
    expect(screen.getByText(/Seuls les espaces validés automatiquement et pas encore relus sont affichés\./)).toBeInTheDocument()
    expect(screen.getByText("Aucun espace à relire.")).toBeInTheDocument()
    expect(screen.queryByText("Aucune organisation. Créez-en une pour commencer.")).toBeNull()
    expect(screen.getByRole("link", { name: "Voir tous les espaces" })).toHaveAttribute("href", "/super-admin/organizations")
  })

  it("keeps the generic empty sentence on the unfiltered list", () => {
    render(<OrgsManager initialOrgs={[]} />)
    expect(screen.getByText("Aucune organisation. Créez-en une pour commencer.")).toBeInTheDocument()
    expect(screen.queryByText("Aucun espace à relire.")).toBeNull()
  })

  it("shows the mark as a second pill on the detail page and marks it as reread", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetch)
    const { rerender } = render(<OrgDetail org={detailOrg()} cumulative={[]} frontDeskCount={0} />)

    expect(screen.getByText("Validation automatique, à relire")).toHaveClass("bg-amber-100", "text-amber-900")
    // The row wraps instead of breaking the pill's rounded shape on a 320 px screen.
    expect(screen.getByText("Validation automatique, à relire").parentElement).toHaveClass("flex-wrap")
    const button = screen.getByRole("button", { name: "Marquer comme relu" })
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText("Espace marqué comme relu.")).toHaveAttribute("role", "status"))
    expect(fetch).toHaveBeenCalledWith("/api/super-admin/organizations/org-fete/reviewed", expect.objectContaining({ method: "POST" }))
    expect(screen.getByRole("heading", { level: 1, name: "Fête du village" })).toHaveFocus()

    rerender(<OrgDetail org={detailOrg({ autoApprovalReviewedAt: "2026-11-16T10:00:00.000Z" })} cumulative={[]} frontDeskCount={0} />)
    expect(screen.queryByRole("button", { name: "Marquer comme relu" })).toBeNull()
    expect(screen.getByText("Validation automatique, relue")).toBeInTheDocument()
  })

  it("keeps the button and shows the failure when the review is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Cet espace a déjà été marqué comme relu." }) }))
    render(<OrgDetail org={detailOrg()} cumulative={[]} frontDeskCount={0} />)
    fireEvent.click(screen.getByRole("button", { name: "Marquer comme relu" }))
    const alert = await screen.findByText("Cet espace a déjà été marqué comme relu.")
    expect(alert).toHaveAttribute("role", "alert")
    expect(screen.getByRole("button", { name: "Marquer comme relu" })).toBeInTheDocument()
  })
})
