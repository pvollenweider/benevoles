/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"

// Super-admin organisation pages (#1142): front-desk accounts are not administrators, so the
// counts and the account list use the shared role predicate, and the detail page shows them apart.
const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND") }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/super-admin/organizations",
}))

const db = vi.hoisted(() => ({
  orgFindMany: vi.fn(), orgFindUnique: vi.fn(), adminCount: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { organization: { findMany: db.orgFindMany, findUnique: db.orgFindUnique }, adminUser: { count: db.adminCount } },
}))
const report = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => report.error }))
vi.mock("@/lib/limit-hits-data", () => ({ loadLimitHits: vi.fn(async () => ({ groups: [], truncated: false })) }))
vi.mock("@/lib/usage-stats", () => ({ loadOrganizationCumulative: vi.fn(async () => []) }))
vi.mock("@/lib/org-inactivity-data", () => ({ loadOrganizationInactivity: vi.fn(async () => null) }))
vi.mock("@/lib/send-batches-data", () => ({ loadSendBatches: vi.fn(async () => []) }))
vi.mock("@/lib/admin-emails-data", () => ({ loadAdminEmails: vi.fn(async () => ({ rows: [], truncated: false, total: 0 })) }))

import { ORG_ACCOUNT_ROLE_WHERE, OWNER_ROLE } from "@/lib/permissions"
import { RETENTION_DAYS } from "@/lib/retention"
import { loadAdminEmails } from "@/lib/admin-emails-data"
import { ORG_ACTIVITY_FILTER } from "@/lib/org-list-activity"
import OrgDetail from "@/components/super-admin/OrgDetail"
import SuperAdminOrgsPage from "@/app/super-admin/organizations/page"
import OrgDetailPage from "@/app/super-admin/organizations/[slug]/page"

function find(node: ReactNode, name: string): ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) { const hit = find(child, name); if (hit) return hit }
    return null
  }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (typeof el.type === "function" && el.type.name === name) return el as ReactElement<Record<string, unknown>>
  return find(el.props?.children, name)
}

const orgRow = () => ({
  id: "org-fete", name: "Fête du village", slug: "fete", active: true,
  suspendedAt: null, suspensionReason: null, publicationApprovedAt: null, outboundEmailApprovedAt: null,
  createdAt: new Date("2026-01-10T08:00:00Z"), timeZone: "Europe/Zurich",
  events: [], admins: [], _count: { events: 2, admins: 3, volunteers: 5 },
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: "sa-1", role: "super_admin", organizationId: null } })
  db.adminCount.mockResolvedValue(4)
  db.orgFindMany.mockResolvedValue([orgRow()])
  db.orgFindUnique.mockResolvedValue({
    ...orgRow(),
    signupDescription: null, signupSource: null, signupSourceDetail: null,
    updatedAt: new Date("2026-01-11T08:00:00Z"),
    admins: [{ id: "adm-owner", name: "Sacha Bonvin", email: "sacha.bonvin@example.org", role: "admin", isActive: true, createdAt: new Date("2026-01-10T08:00:00Z") }],
  })
})
afterEach(cleanup)

describe("the super-admin organisation list counts administrators only", () => {
  it("filters the list on the automatic validations not reread yet (#1371)", async () => {
    const tree = await SuperAdminOrgsPage({ searchParams: Promise.resolve({ filtre: "auto-a-relire" }) })
    expect(db.orgFindMany.mock.calls[0][0].where).toEqual({ autoApprovedAt: { not: null }, autoApprovalReviewedAt: null })
    expect(find(tree, "OrgsManager")?.props.filter).toBe(true)
  })

  it("reads published events only for the activity, while « Événements » keeps counting them all", async () => {
    await SuperAdminOrgsPage({ searchParams: Promise.resolve({}) })
    const args = db.orgFindMany.mock.calls[0][0]
    expect(args.select.events).toEqual({ where: { publicStatus: "published" }, select: { startDate: true, endDate: true } })
    // The count column is untouched: every event, whatever its status (#1078).
    expect(args.select._count.select.events).toBe(true)
  })

  it("keeps spaces with an event ongoing or within 30 days, combined with the sort", async () => {
    const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
    db.orgFindMany.mockResolvedValueOnce([
      { ...orgRow(), events: [{ startDate: new Date(iso(-1)), endDate: new Date(iso(1)) }] },
      { ...orgRow(), id: "org-loin", slug: "loin", events: [{ startDate: new Date(iso(40)), endDate: new Date(iso(40)) }] },
      { ...orgRow(), id: "org-passe", slug: "passe", events: [{ startDate: new Date(iso(-30)), endDate: new Date(iso(-29)) }] },
    ])

    const tree = await SuperAdminOrgsPage({ searchParams: Promise.resolve({ filtre: ORG_ACTIVITY_FILTER, tri: "nom-desc" }) })
    const manager = find(tree, "OrgsManager")
    expect(manager?.props.activityFilter).toBe(true)
    expect(manager?.props.initialSort).toEqual({ col: "nom", dir: "desc" })
    const orgs = manager?.props.initialOrgs as { slug: string; activityLabel: string; activityTone: string }[]
    expect(orgs.map((o) => o.slug)).toEqual(["fete"])
    expect(orgs[0].activityLabel).toBe("En cours")
    expect(orgs[0].activityTone).toBe("ongoing")
  })

  it("filters _count.admins with ORG_ACCOUNT_ROLE_WHERE and leaves the owner relation filtered", async () => {
    const tree = await SuperAdminOrgsPage({ searchParams: Promise.resolve({}) })
    const args = db.orgFindMany.mock.calls[0][0]
    expect(args.select._count.select.admins).toEqual({ where: ORG_ACCOUNT_ROLE_WHERE })
    expect(args.select.admins.where).toEqual({ role: OWNER_ROLE })
    const manager = find(tree, "OrgsManager")
    expect(manager?.props.initialOrgs).toHaveLength(1)
    expect((manager?.props.initialOrgs as { _count: { admins: number } }[])[0]._count.admins).toBe(3)
  })
})

describe("the super-admin organisation detail page separates front-desk accounts", () => {
  it("filters the admin count and list, and counts front-desk accounts apart", async () => {
    const tree = await OrgDetailPage({ params: Promise.resolve({ slug: "fete" }) })
    const args = db.orgFindUnique.mock.calls[0][0]
    expect(args.select._count.select.admins).toEqual({ where: ORG_ACCOUNT_ROLE_WHERE })
    expect(args.select.admins.where).toEqual(ORG_ACCOUNT_ROLE_WHERE)
    expect(db.adminCount).toHaveBeenCalledWith({ where: { organizationId: "org-fete", role: "front_desk" } })
    const detail = find(tree, "OrgDetail")
    expect(detail?.props.frontDeskCount).toBe(4)
  })

  it("formats the administrator-email days on the server in the operator's zone", async () => {
    vi.mocked(loadAdminEmails).mockResolvedValueOnce({
      rows: [{ day: "2026-11-26", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 2, failed: 1 }],
      truncated: true,
      total: 61,
    })

    const tree = await OrgDetailPage({ params: Promise.resolve({ slug: "fete" }) })
    const detail = find(tree, "OrgDetail")

    expect(detail?.props.adminEmails).toEqual({
      unavailable: false,
      rows: [{ dateTime: "2026-11-26", dateLabel: "26 novembre 2026", kindLabel: "Notification à l'équipe", accepted: 2, failed: 1 }],
      days: RETENTION_DAYS.deliveryOutcome,
      zone: "Jours en heure de Zurich.",
      truncated: true,
    })
  })

  it("keeps the sheet and its other sections when the administrator-email query fails", async () => {
    const failure = new Error("the query failed")
    vi.mocked(loadAdminEmails).mockRejectedValueOnce(failure)

    const tree = await OrgDetailPage({ params: Promise.resolve({ slug: "fete" }) })
    const detail = find(tree, "OrgDetail")

    expect(report.error).toHaveBeenCalledWith(failure)
    expect(detail?.props.adminEmails).toEqual({
      unavailable: true,
      days: RETENTION_DAYS.deliveryOutcome,
      zone: "Jours en heure de Zurich.",
    })
    // The rest of the page was loaded and still renders, its actions included.
    expect(detail?.props.frontDeskCount).toBe(4)
    expect(detail?.props.org).toMatchObject({ slug: "fete" })
    render(tree)
    expect(screen.getByText("Ces emails ne peuvent pas être affichés pour le moment.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Suspendre pour abus" })).toBeInTheDocument()
  })

  it("renders the one line « Comptes accueil : n », without listing them", () => {
    const org = {
      ...orgRow(),
      suspendedAt: null, suspensionReason: null, signupDescription: null, signupSource: null, signupSourceDetail: null,
      autoApprovedAt: null, autoApprovalReviewedAt: null,
      createdAt: "2026-01-10T08:00:00.000Z", updatedAt: "2026-01-11T08:00:00.000Z",
      _count: { events: 2, admins: 3, volunteers: 5 },
      admins: [{ id: "adm-owner", name: "Sacha Bonvin", email: "sacha.bonvin@example.org", role: "admin", isActive: true, createdAt: "2026-01-10T08:00:00.000Z" }],
    }
    const { container } = render(<OrgDetail org={org} cumulative={[]} frontDeskCount={4} />)
    expect(screen.getByText("Comptes accueil : 4")).toBeInTheDocument()
    expect(container.textContent).not.toContain("Colette Favre")
  })
})
