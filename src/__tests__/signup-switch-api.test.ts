import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextResponse } from "next/server"

// The « Inscriptions fermées » switch (#810): super admin only, stored at once, logged with it.
const m = vi.hoisted(() => ({ guard: vi.fn(), stored: null as null | { closed: boolean }, upsert: vi.fn(), log: vi.fn() }))
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: m.guard }))
vi.mock("@/lib/prisma", () => {
  const tx = {
    platformSetting: { upsert: m.upsert },
    operatorLog: { create: m.log },
  }
  return {
    prisma: {
      platformSetting: { findUnique: vi.fn(async () => (m.stored ? { value: m.stored } : null)) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})

const put = (body: unknown) => new Request("http://localhost/api/super-admin/signup-switch", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  m.stored = null
  m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur" } } })
  m.upsert.mockImplementation(async ({ create }) => { m.stored = create.value })
})
afterEach(() => { delete process.env.SIGNUP })

describe("signup switch API (#810)", () => {
  it("is for the super admin only", async () => {
    m.guard.mockResolvedValueOnce(NextResponse.json({ error: "Non autorisé" }, { status: 403 }))
    const { PUT } = await import("@/app/api/super-admin/signup-switch/route")
    expect((await PUT(put({ closed: true }))).status).toBe(403)
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("closes at once and logs it, and refuses a body without a yes or no", async () => {
    const { PUT, GET } = await import("@/app/api/super-admin/signup-switch/route")
    expect((await PUT(put({ closed: "yes" }))).status).toBe(400)
    const res = await PUT(put({ closed: true }))
    expect(await res.json()).toEqual({ open: false, closedBy: "operator" })
    expect(m.log).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "signup.closed", actorId: "sa-1", entityType: "Platform" }) })
    expect(await (await GET()).json()).toEqual({ open: false, closedBy: "operator" })
  })

  it("says the configuration closed it, whatever the switch", async () => {
    process.env.SIGNUP = "off"
    const { GET } = await import("@/app/api/super-admin/signup-switch/route")
    expect(await (await GET()).json()).toEqual({ open: false, closedBy: "config" })
  })
})

describe("signupSwitchState", () => {
  it("puts the configuration first, then the operator's switch", async () => {
    const { signupSwitchState } = await import("@/lib/signup-switch")
    expect(signupSwitchState(true, false)).toEqual({ open: true, closedBy: null })
    expect(signupSwitchState(true, true)).toEqual({ open: false, closedBy: "operator" })
    expect(signupSwitchState(false, false)).toEqual({ open: false, closedBy: "config" })
    expect(signupSwitchState(false, true)).toEqual({ open: false, closedBy: "config" })
  })
})
