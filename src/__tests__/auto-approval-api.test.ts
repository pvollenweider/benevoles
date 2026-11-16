import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// « Validation automatique des nouveaux espaces » (#1371): super admin only, hosted service only,
// the end day validated on the server, every change logged with its date.
const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
// Some route imports reach the notification layer; its environment must import cleanly.
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32), CRON_SECRET: "c".repeat(32) } }))

type Logged = { action: string; actorId?: string | null; entityId?: string; detail?: string | null }
const store = vi.hoisted(() => ({
  setting: null as null | { value: unknown },
  logs: [] as Logged[],
  org: null as null | {
    id: string; name: string; slug: string;
    autoApprovedAt: Date | null; autoApprovalReviewedAt: Date | null;
  },
}))

vi.mock("@/lib/prisma", () => {
  const platformSetting = {
    findUnique: vi.fn(async () => (store.setting ? { value: store.setting.value } : null)),
    upsert: vi.fn(async ({ create, update }: { create?: { value: unknown }; update?: { value: unknown } }) => {
      store.setting = { value: create?.value ?? update?.value }
      return store.setting
    }),
    update: vi.fn(async ({ data }: { data: { value: unknown } }) => {
      store.setting = { value: data.value }
      return store.setting
    }),
  }
  const organization = {
    findUnique: vi.fn(async () => store.org),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; autoApprovedAt?: { not: null }; autoApprovalReviewedAt?: null }; data: { autoApprovalReviewedAt: Date } }) => {
      if (!store.org || where.id !== store.org.id) return { count: 0 }
      if (where.autoApprovedAt?.not === null && !store.org.autoApprovedAt) return { count: 0 }
      if (where.autoApprovalReviewedAt === null && store.org.autoApprovalReviewedAt) return { count: 0 }
      store.org = { ...store.org, ...data }
      return { count: 1 }
    }),
  }
  const tx = {
    $queryRaw: vi.fn(async () => (store.setting ? [{ value: store.setting.value }] : [])),
    platformSetting,
    organization,
    operatorLog: { create: vi.fn(async ({ data }: { data: Logged }) => { store.logs.push(data); return data }) },
    signupBlock: { findMany: vi.fn(async () => []) },
  }
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})

import { APP_TIME_ZONE } from "@/lib/time-zone"
import { addCalendarDays, autoApprovalDayInZone, autoApprovalDayLabel, AUTO_APPROVAL_HOSTED_ONLY, AUTO_APPROVAL_SETTING_KEY } from "@/lib/auto-approval"

const PUT_URL = "http://localhost/api/super-admin/auto-approval"
const json = (method: string, body?: unknown) => new Request(PUT_URL, {
  method,
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const today = () => autoApprovalDayInZone(new Date(), APP_TIME_ZONE)
const day = (n: number) => addCalendarDays(today(), n)

beforeEach(() => {
  vi.clearAllMocks()
  store.setting = null
  store.logs = []
  store.org = null
  process.env.HOSTED_SERVICE = "true"
  auth.mockResolvedValue({ user: { id: "sa-1", name: "Opérateur", email: "ops@example.org", role: "super_admin" } })
})
afterEach(() => { delete process.env.HOSTED_SERVICE })

describe("the automatic validation routes (#1371)", () => {
  it("is refused to a signed-out caller, an organiser and a front-desk account, touching nothing", async () => {
    const { GET, PUT, DELETE } = await import("@/app/api/super-admin/auto-approval/route")
    for (const role of [null, "admin", "organizer", "front_desk"]) {
      auth.mockResolvedValue(role ? { user: { id: "u1", role, organizationId: "org-fete" } } : null)
      expect((await GET()).status, String(role)).toBe(role ? 403 : 401)
      expect((await PUT(json("PUT", { until: day(2) }))).status, String(role)).toBe(role ? 403 : 401)
      expect((await DELETE()).status, String(role)).toBe(role ? 403 : 401)
    }
    expect(store.setting).toBeNull()
    expect(store.logs).toEqual([])
  })

  it("turns on, changes the end day and turns off, each change logged with its date", async () => {
    const { GET, PUT, DELETE } = await import("@/app/api/super-admin/auto-approval/route")

    expect((await (await GET()).json()).state).toBe("off")
    const first = day(10)
    const put = await PUT(json("PUT", { until: first }))
    expect(put.status).toBe(200)
    const view = await put.json()
    expect(view.state).toBe("on")
    expect(view.until).toBe(first)
    expect(view.untilLabel).toBe(autoApprovalDayLabel(first))
    expect(store.setting?.value).toMatchObject({ until: first, activatedById: "sa-1", budgetUsed: 0, totalSinceActivation: 0 })

    const second = day(12)
    expect((await PUT(json("PUT", { until: second }))).status).toBe(200)
    expect(store.setting?.value).toMatchObject({ until: second })
    expect(store.logs.map((l) => l.action)).toEqual(["auto_approval.activated", "auto_approval.until_changed"])
    expect(store.logs[0]).toMatchObject({ actorId: "sa-1", entityId: AUTO_APPROVAL_SETTING_KEY })
    expect(store.logs[0].detail).toContain(`${autoApprovalDayLabel(first)} inclus`)
    expect(store.logs[1].detail).toContain(`${autoApprovalDayLabel(second)} inclus`)

    const off = await DELETE()
    expect(off.status).toBe(200)
    expect((await off.json()).state).toBe("off")
    expect(store.logs.at(-1)).toMatchObject({ action: "auto_approval.deactivated", actorId: "sa-1" })
    expect((await (await GET()).json()).state).toBe("off")
  })

  it("validates the end day on the server: today and +30 accepted, +31 and a malformed day refused", async () => {
    const { PUT } = await import("@/app/api/super-admin/auto-approval/route")
    expect((await PUT(json("PUT", { until: day(0) }))).status).toBe(200)
    expect((await PUT(json("PUT", { until: day(30) }))).status).toBe(200)

    for (const until of [day(31), day(-1), "", "2026-02-30", null, undefined]) {
      const res = await PUT(json("PUT", { until }))
      expect(res.status, String(until)).toBe(400)
      const body = await res.json()
      expect(body.field).toBe("until")
      expect(body.error).toMatch(/Indiquez une date de fin|Choisissez une date entre aujourd'hui et le/)
    }
    // Only the two accepted calls wrote and logged.
    expect(store.logs).toHaveLength(2)
  })

  it("refuses every route on an instance that is not the hosted service, with a clear message", async () => {
    process.env.HOSTED_SERVICE = "false"
    store.setting = { value: { until: day(5), activatedAt: new Date().toISOString() } }
    const { GET, PUT, DELETE } = await import("@/app/api/super-admin/auto-approval/route")
    const { POST: dismiss } = await import("@/app/api/super-admin/auto-approval/dismiss/route")
    const { POST: reviewed } = await import("@/app/api/super-admin/organizations/[id]/reviewed/route")

    for (const res of [await GET(), await PUT(json("PUT", { until: day(2) })), await DELETE(), await dismiss(), await reviewed(json("POST"), params("org-1"))]) {
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe(AUTO_APPROVAL_HOSTED_ONLY)
    }
    expect(store.logs).toEqual([])
  })

  it("dismisses the cut-off notice without a log, and leaves the option cut off", async () => {
    const cutOffAt = new Date().toISOString()
    store.setting = { value: { until: day(5), activatedAt: new Date().toISOString(), cutOffAt, cutOffSeenAt: null } }
    const { POST } = await import("@/app/api/super-admin/auto-approval/dismiss/route")
    const res = await POST()
    expect(res.status).toBe(200)
    const view = await res.json()
    expect(view.state).toBe("cut_off")
    expect(view.cutOffNotice).toBeNull()
    expect(store.setting?.value).toMatchObject({ cutOffAt, cutOffSeenAt: expect.any(String) })
    expect(store.logs).toEqual([])
  })
})

describe("marking an automatic validation as reviewed (#1371)", () => {
  const org = (autoApprovedAt: Date | null, reviewedAt: Date | null = null) => ({
    id: "org-fete", name: "Fête du village", slug: "fete", autoApprovedAt, autoApprovalReviewedAt: reviewedAt,
  })

  it("records the review and logs it, once", async () => {
    store.org = org(new Date("2026-11-16T09:00:00Z"))
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/reviewed/route")
    const first = await POST(json("POST"), params("org-fete"))
    expect(first.status).toBe(200)
    expect((await first.json()).ok).toBe(true)
    expect(store.org?.autoApprovalReviewedAt).toBeInstanceOf(Date)
    expect(store.logs).toEqual([expect.objectContaining({
      action: "auto_approval.reviewed", actorId: "sa-1", entityId: "org-fete", target: "Fête du village (fete)",
    })])

    const twice = await POST(json("POST"), params("org-fete"))
    expect(twice.status).toBe(409)
    expect(store.logs).toHaveLength(1)
  })

  it("refuses a space that was not validated automatically", async () => {
    store.org = org(null)
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/reviewed/route")
    const res = await POST(json("POST"), params("org-fete"))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Cet espace n'a pas été validé automatiquement.")
    expect(store.logs).toEqual([])
  })
})
