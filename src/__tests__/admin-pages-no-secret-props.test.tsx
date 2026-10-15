import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactElement, ReactNode } from "react"
import { applySelect, expectNoSecretFields } from "./helpers/no-secret-fields"

// Props of a client component are sent to the browser (#1009): the sector leaders and shifts
// pages must not hand their rows' link token (hash, encrypted copy, clear legacy) to it.

const m = vi.hoisted(() => ({ db: {} as Record<string, unknown> }))
vi.mock("@/lib/auth-guard", () => ({ getOrgContext: async () => ({ organizationId: "org-a", db: m.db, session: {} }) }))
vi.mock("@/components/admin/SectorLeadersManager", () => ({ default: function SectorLeadersManager() { return null } }))
vi.mock("@/components/admin/ShiftsManager", () => ({ default: function ShiftsManager() { return null } }))
vi.mock("@/components/admin/WizardSteps", () => ({ default: () => null }))
vi.mock("@/components/admin/HelpLink", () => ({ default: () => null }))

function find(node: ReactNode, name: string): ReactElement | null {
  if (!node || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) { const hit = find(child, name); if (hit) return hit }
    return null
  }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (typeof el.type === "function" && el.type.name === name) return el
  return find(el.props?.children, name)
}

const SECRETS = { tokenLegacy: "clear-token", tokenHash: "h".repeat(64), tokenEnc: "v2:k1:iv:tag:ct" }
const answers = (rows: () => Record<string, unknown>[] | Record<string, unknown>) =>
  vi.fn(async (args?: { select?: unknown; include?: unknown }) => {
    const r = rows()
    return Array.isArray(r) ? r.map((x) => applySelect(x, args)) : applySelect(r, args)
  })

describe("admin pages pass no secret field to client components (#1009)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sector leaders page: initialLeaders carry who leads what, never the token", async () => {
    m.db = {
      event: { findFirst: vi.fn(async () => ({ id: "evt-1", title: "Festival" })) },
      sectorLeader: { findMany: answers(() => [{ id: "l1", eventId: "evt-1", roleName: "Bar", name: "Alice", email: "a@x.com", createdAt: new Date("2026-09-01"), ...SECRETS }]) },
      shift: { findMany: vi.fn(async () => [{ roleName: "Bar" }]) },
      registration: { findMany: vi.fn(async () => []) },
    }
    const { default: Page } = await import("@/app/admin/events/[id]/sector-leaders/page")
    const el = find(await Page({ params: Promise.resolve({ id: "evt-1" }) }), "SectorLeadersManager") as ReactElement<{ initialLeaders: Record<string, unknown>[] }> | null
    expect(el?.props.initialLeaders).toHaveLength(1)
    expect(el?.props.initialLeaders[0]).toMatchObject({ id: "l1", roleName: "Bar", name: "Alice", email: "a@x.com" })
    expectNoSecretFields(el?.props)
  })

  it("shifts page: initialShifts keep the count, not the registrations", async () => {
    const registration = { id: "r1", status: "active", editTokenLegacy: "clear-token", editTokenHash: "h".repeat(64), editTokenEnc: "v2:k1:iv:tag:ct" }
    m.db = {
      event: {
        findFirst: answers(() => ({
          id: "evt-1", title: "Festival", startDate: new Date("2030-07-04"), endDate: new Date("2030-07-05"), showSchedule: [],
          organization: { timeZone: "Europe/Zurich" }, shiftRecurrences: [],
          shifts: [{ id: "s1", roleName: "Bar", label: "Bar", date: new Date("2030-07-04"), startTime: "10:00", endTime: "12:00", capacity: 3, status: "open", registrations: [registration, { ...registration, id: "r2" }] }],
        })),
      },
    }
    const { default: Page } = await import("@/app/admin/events/[id]/shifts/page")
    const el = find(await Page({ params: Promise.resolve({ id: "evt-1" }), searchParams: Promise.resolve({}) }), "ShiftsManager") as ReactElement<{ initialShifts: Record<string, unknown>[] }> | null
    expect(el?.props.initialShifts[0]).toMatchObject({ id: "s1", registrationCount: 2 })
    expect(el?.props.initialShifts[0]).not.toHaveProperty("registrations")
    expectNoSecretFields(el?.props)
  })
})
