import { describe, it, expect, vi, beforeEach } from "vitest"

// Event option "téléphone obligatoire": the public sign-up is refused without a phone number
// when the event requires one (the form's `required` is only a courtesy).

const eventFindFirst = vi.hoisted(() => vi.fn())
const shiftFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: eventFindFirst },
    shift: { findMany: shiftFindMany },
  },
}))
vi.mock("@/lib/email", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))

function post(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
    body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "A", lastName: "B", email: "a@x.com", consent: true, ...extra }),
  })
}

const event = (requirePhone: boolean) => ({
  id: "evt-1", organizationId: "org-a", title: "F", organization: { slug: "a" }, confirmationMessage: null, requirePhone,
})

describe("POST /api/public/registrations — required phone", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Stop right after the phone check: no shift found → 409 "invalides ou fermés".
    shiftFindMany.mockResolvedValue([])
  })

  it("refuses a sign-up without phone when the event requires one", async () => {
    eventFindFirst.mockResolvedValue(event(true))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("téléphone est obligatoire")
    expect(shiftFindMany).not.toHaveBeenCalled()
  })

  it("treats a blank phone as missing", async () => {
    eventFindFirst.mockResolvedValue(event(true))
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post({ phone: "   " }))).status).toBe(400)
  })

  it("lets it through with a phone", async () => {
    eventFindFirst.mockResolvedValue(event(true))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ phone: "079 123 45 67" }))
    expect(res.status).toBe(409) // went past the phone check, stopped at the (mocked) shift lookup
    expect(shiftFindMany).toHaveBeenCalled()
  })

  it("doesn't require it when the event doesn't", async () => {
    eventFindFirst.mockResolvedValue(event(false))
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post())).status).toBe(409)
    expect(shiftFindMany).toHaveBeenCalled()
  })
})
