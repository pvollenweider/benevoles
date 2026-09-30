import { describe, it, expect, vi, beforeEach } from "vitest"

// Shifts per volunteer for a role (#466): the server decides, under the volunteer's lock, and
// the organiser can go over it knowingly.
const m = vi.hoisted(() => ({
  order: [] as string[],
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  txShiftFindMany: vi.fn(),
  txRegFindMany: vi.fn(),
  txCreate: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) }, // no custom question (#483)
    event: { findFirst: m.eventFindFirst },
    shift: { findMany: m.shiftFindMany },
    volunteer: { findFirst: vi.fn().mockResolvedValue({ id: "vol-1" }) },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    memberInvite: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => { m.order.push(strings.join("?").includes("Volunteer") ? "lock:volunteer" : "lock:shifts") }),
      shift: { findMany: vi.fn(async (args: unknown) => { m.order.push("limits"); return m.txShiftFindMany(args) }) },
      volunteer: { createMany: vi.fn(), findFirstOrThrow: vi.fn() },
      registration: {
        findMany: vi.fn(async (args: { where: { shift?: unknown } }) => (args.where.shift ? m.txRegFindMany(args) : [])),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
        create: m.txCreate,
      },
      notificationOutbox: { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    })),
  },
}))
vi.mock("@/lib/email", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ collectNotifications: () => ({ send: vi.fn(), payloads: [] }), enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "adm" }) }))

const loge = (id: string) => ({ id, label: "Loge", roleName: "Loge", capacity: 5, minAge: null, waitlistEnabled: true, registrations: [], date: new Date("2030-06-01T00:00:00Z"), startTime: id === "s1" ? "10:00" : "14:00", endTime: id === "s1" ? "12:00" : "16:00" })

function post(shiftIds: string[]) {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `test-${Math.random()}` },
    body: JSON.stringify({ eventId: "evt-1", shiftIds, firstName: "Alice", lastName: "Martin", email: "a@x.com", consent: true }),
  })
}

describe("public sign-up and the role limit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.order.length = 0
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Festival", organization: { slug: "a", timeZone: null }, confirmationMessage: null })
    m.shiftFindMany.mockResolvedValue([loge("s2")])
    m.txShiftFindMany.mockResolvedValue([{ roleName: "Loge", maxPerVolunteer: 2 }])
  })

  it("refuses one shift over the limit, counting the waitlist, checked after the volunteer lock", async () => {
    // Two live registrations already: one confirmed, one on the waitlist.
    m.txRegFindMany.mockResolvedValue([{ shift: { roleName: "Loge" } }, { shift: { roleName: "Loge" } }])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s2"]))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: "Vous avez déjà 2 créneaux « Loge », le maximum pour ce poste.", roleLimit: "Loge" })
    expect(m.txCreate).not.toHaveBeenCalled()
    expect(m.order.indexOf("lock:volunteer")).toBeLessThan(m.order.indexOf("limits"))
    expect(m.txRegFindMany.mock.calls[0][0].where.status.in).toEqual(["active", "waiting", "offered", "requested"])
  })

  it("accepts up to the limit", async () => {
    m.txRegFindMany.mockResolvedValue([{ shift: { roleName: "Loge" } }])
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s2", status: "active", waitingPosition: null })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s2"]))
    expect(m.txCreate).toHaveBeenCalledOnce()
    expect(res.status).toBeLessThan(300)
  })
})

describe("manual addition and the role limit", () => {
  const regCreate = vi.fn()
  const db = {
    shift: {
      findFirst: vi.fn().mockResolvedValue({ id: "s2", roleName: "Loge", capacity: 5, registrations: [] }),
      findMany: vi.fn().mockResolvedValue([{ roleName: "Loge", maxPerVolunteer: 1 }]),
      update: vi.fn(),
    },
    volunteer: { findFirst: vi.fn().mockResolvedValue({ id: "vol-1", firstName: "Alice", lastName: "Martin" }), create: vi.fn() },
    registration: { findMany: vi.fn().mockResolvedValue([{ id: "r-old" }]), create: regCreate },
  }
  beforeEach(() => {
    regCreate.mockReset().mockResolvedValue({ id: "r-new", volunteer: {}, shift: {} })
    vi.doMock("@/lib/auth-guard", () => ({ requireOrgSession: async () => ({ db, organizationId: "org-a", session: { user: { id: "adm" } } }) }))
  })
  const add = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/admin/registrations", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "evt-1", shiftId: "s2", firstName: "Alice", lastName: "Martin", email: "a@x.com", ...extra }),
  })

  it("warns first, then adds when the organiser confirms", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const warned = await POST(add())
    expect(warned.status).toBe(409)
    expect(await warned.json()).toEqual({ code: "role_limit", error: "Alice Martin a déjà 1 créneau « Loge », pour un maximum de 1 par personne." })
    expect(regCreate).not.toHaveBeenCalled()
    const forced = await POST(add({ allowOverLimit: true }))
    expect(forced.status).toBe(201)
    expect(regCreate).toHaveBeenCalledOnce()
  })
})
