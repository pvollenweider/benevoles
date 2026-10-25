import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// A failed event update or deletion is logged like every other route error (src/lib/report-error.ts):
// one line with a category, a code and the scrubbed message, never the raw error object, whose
// message and properties can quote the organiser's event fields or an address.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "a" }), diffFields: () => null }))
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: () => null }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/urls", () => ({ orgBaseUrl: (slug: string) => `https://${slug}.example`, eventPublicUrl: (org: string, slug: string) => `https://${org}.example/${slug}` }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/withdrawal-notifications", () => ({ buildWithdrawalNotifications: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
const captureException = vi.hoisted(() => vi.fn())
vi.mock("@sentry/nextjs", () => ({ captureException }))

const SECRET_FIELD = "Fête chez jane.doe@example.com"
const failure = () => Object.assign(new Error(`Invalid update {\n  title: "${SECRET_FIELD}"\n}`), { meta: { title: SECRET_FIELD } })

describe("/api/admin/events/[id]: error logging", () => {
  const params = { params: Promise.resolve({ id: "evt-a" }) }
  const owned = { id: "evt-a", title: "F", publicStatus: "archived", isListed: true, startDate: new Date(0), endDate: new Date(0), publicInstructions: null, remindersEnabled: true, requirePhone: false }
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    requireOrgSessionMock.mockResolvedValue({
      db: {
        organization: { findUnique: vi.fn().mockResolvedValue({ shiftRosterDefault: true }) },
        event: { findFirst: vi.fn().mockResolvedValue(owned), update: vi.fn().mockRejectedValue(failure()), delete: vi.fn().mockRejectedValue(failure()) },
      },
      organizationId: "org-a",
      session: {},
    })
  })
  afterEach(() => consoleError.mockRestore())

  const expectScrubbedLine = (context: string) => {
    expect(consoleError).toHaveBeenCalledTimes(1)
    const args = consoleError.mock.calls[0]
    expect(args).toHaveLength(1)
    const line = args[0] as string
    expect(typeof line).toBe("string")
    expect(line.startsWith(`[${context}] code=Error `)).toBe(true)
    expect(line).not.toContain("jane.doe@example.com")
    expect(line).not.toContain("\n")
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { context } })
  }

  it("logs a failed update as one scrubbed line and answers a generic 500", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    const req = new Request("http://localhost/api/admin/events/evt-a", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: SECRET_FIELD }) })
    const res = await PATCH(req, params)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Erreur serveur" })
    expectScrubbedLine("event.update")
  })

  it("logs a failed deletion as one scrubbed line and answers a generic 500", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/route")
    const req = new Request("http://localhost/api/admin/events/evt-a", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmTitle: "F" }) })
    const res = await DELETE(req, params)
    expect(res.status).toBe(500)
    expectScrubbedLine("event.delete")
  })
})
