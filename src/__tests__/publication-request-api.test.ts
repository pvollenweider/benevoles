import { describe, it, expect, vi, beforeEach } from "vitest"

// « Demander la publication » (#810): a space awaiting validation asks the operator, at most once a
// day; the answer is the same either way, and nothing is published.
const m = vi.hoisted(() => ({ guard: vi.fn(), findFirst: vi.fn(), limit: vi.fn(), notify: vi.fn() }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: m.guard }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.limit }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: m.notify }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))

import { PUBLICATION_REQUESTED_MESSAGE } from "@/lib/org-approval"

const pendingEvent = { title: "Fête du village", organization: { name: "Comité", slug: "comite", publicationApprovedAt: null } }
const post = () => new Request("http://localhost/api/admin/events/evt-a/publication-request", { method: "POST" })
const params = { params: Promise.resolve({ id: "evt-a" }) }

beforeEach(() => {
  vi.clearAllMocks()
  m.guard.mockResolvedValue({ organizationId: "org-a", db: { event: { findFirst: m.findFirst } }, session: { user: { role: "admin" } } })
  m.findFirst.mockResolvedValue(pendingEvent)
  m.limit.mockResolvedValue({ ok: true, remaining: 0, retryAfter: 0 })
  m.notify.mockResolvedValue(undefined)
})

describe("POST /api/admin/events/[id]/publication-request (#810)", () => {
  it("tells the operator once, with the space and the event, and answers with the waiting message", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/publication-request/route")
    const res = await POST(post(), params)
    expect(await res.json()).toEqual({ ok: true, message: PUBLICATION_REQUESTED_MESSAGE })
    expect(m.limit).toHaveBeenCalledWith("org-a", "publication-request", 1, 24 * 60 * 60 * 1000)
    await vi.waitFor(() => expect(m.notify).toHaveBeenCalledTimes(1))
    expect(m.notify.mock.calls[0][0]).toMatchObject({ title: "Demande de publication", priority: 4, message: "Comité demande à publier « Fête du village » : son espace attend une validation." })
  })

  it("answers the same, with no new alert, once the day's request is made", async () => {
    m.limit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 3600 })
    const { POST } = await import("@/app/api/admin/events/[id]/publication-request/route")
    expect((await (await POST(post(), params)).json()).message).toBe(PUBLICATION_REQUESTED_MESSAGE)
    await new Promise((r) => setTimeout(r, 0))
    expect(m.notify).not.toHaveBeenCalled()
  })

  it("refuses a validated space, which can simply publish", async () => {
    m.findFirst.mockResolvedValue({ ...pendingEvent, organization: { ...pendingEvent.organization, publicationApprovedAt: new Date() } })
    const { POST } = await import("@/app/api/admin/events/[id]/publication-request/route")
    expect((await POST(post(), params)).status).toBe(409)
    expect(m.limit).not.toHaveBeenCalled()
  })
})
