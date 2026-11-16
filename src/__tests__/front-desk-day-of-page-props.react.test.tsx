/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactElement, ReactNode } from "react"

// The front-desk day-of page must send the client exactly what the day-of GET returns (#1142):
// no registration window, no role list, no sector or admin navigation props.
const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

type Row = Record<string, unknown>
const fake = vi.hoisted(() => {
  const grant = {
    id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete",
    expiresAt: new Date("2027-06-15T04:00:00Z"), revokedAt: null,
    adminUser: { organizationId: "org-fete", isActive: true, role: "front_desk" },
    event: {
      id: "evt-fete", organizationId: "org-fete", title: "Fête du village", publicStatus: "published",
      startDate: new Date("2027-06-14T00:00:00Z"), endDate: new Date("2027-06-14T00:00:00Z"),
      organization: { name: "Fête du village", timeZone: "Europe/Zurich" },
    },
  }
  const event = {
    id: "evt-fete", startDate: new Date("2027-06-14T00:00:00Z"), endDate: new Date("2027-06-14T00:00:00Z"),
    publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
    organization: { timeZone: "Europe/Zurich" }, shifts: [],
  }
  const client = {
    adminEventAccess: { findFirst: async (): Promise<Row | null> => grant },
    event: { findFirst: async (): Promise<Row | null> => event },
    $extends: () => client,
    then: undefined,
  }
  return { client }
})
vi.mock("@/lib/prisma", () => ({ prisma: fake.client }))
vi.mock("@/components/admin/SignOutButton", () => ({ default: () => null }))
vi.mock("@/components/admin/FrontDeskDayOfBoard", () => ({ default: function FrontDeskDayOfBoard() { return null } }))

import FrontDeskDayOfPage from "@/app/admin/front-desk/events/[id]/page"

const colette = { user: { id: "adm-colette", name: "Colette Favre", email: "colette.favre@example.org", role: "front_desk", organizationId: "org-fete" } }

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

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue(colette)
})

describe("the front-desk day-of page's client props", () => {
  it("passes exactly the day-of snapshot: eventId, board, today, refreshedAt, timeZone", async () => {
    const tree = await FrontDeskDayOfPage({ params: Promise.resolve({ id: "evt-fete" }) })
    const board = find(tree, "FrontDeskDayOfBoard")
    expect(board).not.toBeNull()
    expect(Object.keys(board!.props).sort()).toEqual(["board", "eventId", "refreshedAt", "timeZone", "today"])
    expect(board!.props).not.toHaveProperty("registrationWindow")
    expect(board!.props.eventId).toBe("evt-fete")
    expect(board!.props.timeZone).toBe("Europe/Zurich")
  })
})
