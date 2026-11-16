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
vi.mock("@/lib/limit-hits-data", () => ({ loadLimitHits: vi.fn(async () => ({ groups: [], truncated: false })) }))
vi.mock("@/lib/usage-stats", () => ({ loadOrganizationCumulative: vi.fn(async () => []) }))
vi.mock("@/lib/org-inactivity-data", () => ({ loadOrganizationInactivity: vi.fn(async () => null) }))
vi.mock("@/lib/send-batches-data", () => ({ loadSendBatches: vi.fn(async () => []) }))

import { ORG_ACCOUNT_ROLE_WHERE, OWNER_ROLE } from "@/lib/permissions"
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

  it("renders the one line « Comptes accueil : n », without listing them", () => {
    const org = {
      ...orgRow(),
      suspendedAt: null, suspensionReason: null, signupDescription: null, signupSource: null, signupSourceDetail: null,
      createdAt: "2026-01-10T08:00:00.000Z", updatedAt: "2026-01-11T08:00:00.000Z",
      _count: { events: 2, admins: 3, volunteers: 5 },
      admins: [{ id: "adm-owner", name: "Sacha Bonvin", email: "sacha.bonvin@example.org", role: "admin", isActive: true, createdAt: "2026-01-10T08:00:00.000Z" }],
    }
    const { container } = render(<OrgDetail org={org} cumulative={[]} frontDeskCount={4} />)
    expect(screen.getByText("Comptes accueil : 4")).toBeInTheDocument()
    expect(container.textContent).not.toContain("Colette Favre")
  })
})
