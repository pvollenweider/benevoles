import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

// Custom questions (#483) at sign-up: answers stored in the registration transaction, replaced
// only with proof the submitter owns the address.
const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  inviteFindFirst: vi.fn(),
  inviteFindUnique: vi.fn(),
  txCreate: vi.fn(),
  upsert: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
  volunteerFindFirst: vi.fn(),
  questions: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventQuestion: { findMany: m.questions },
    event: { findFirst: m.eventFindFirst },
    shift: { findMany: m.shiftFindMany },
    volunteer: { findFirst: m.volunteerFindFirst, update: vi.fn() },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    memberInvite: { findFirst: m.inviteFindFirst, findUnique: m.inviteFindUnique, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn().mockResolvedValue([{ id: "locked", erasedAt: null, email: "lea@x.ch" }]), // #516: a locked match, not erased, still at the address
      shift: { findMany: vi.fn().mockResolvedValue([]) },
      volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }), update: vi.fn() },
      // The invitation is checked again under the member lock (#1138 follow-up).
      memberInvite: { findFirst: (...args: unknown[]) => m.inviteFindFirst(...args) },
      charterVersion: { upsert: vi.fn() },
      rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      registration: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }), create: m.txCreate },
      questionAnswer: { upsert: m.upsert, createMany: m.createMany, deleteMany: m.deleteMany },
    })),
  },
}))
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ collectNotifications: () => ({ send: vi.fn(), payloads: [] }), enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))


const bar = { id: "s1", label: "Bar", roleName: "Bar", capacity: 5, minAge: null, waitlistEnabled: false, registrations: [], reservedTags: [], date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00" }
const post = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/public/registrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, charterAccepted: true, ...extra }),
})

// Answers to the custom questions (#483) are stored with the registration, in its transaction.
describe("public sign-up with custom questions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "a", timeZone: null }, confirmationMessage: null })
    m.shiftFindMany.mockResolvedValue([bar])
    m.volunteerFindFirst.mockResolvedValue(null)
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s1", status: "active", waitingPosition: null })
    m.questions.mockResolvedValue([
      { id: "size", label: "Taille", type: "single", options: ["S", "M"], required: true },
      { id: "diet", label: "Régime", type: "multiple", options: ["Végétarien", "Sans gluten"], required: false },
    ])
  })

  it("a new volunteer: upserts each answered question, clears the optional ones left empty", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ answers: { size: "M" } }))
    expect(res.status).toBeLessThan(300)
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.upsert.mock.calls[0][0]).toMatchObject({ where: { questionId_volunteerId: { questionId: "size", volunteerId: "vol-1" } }, create: { questionId: "size", eventId: "evt-1", volunteerId: "vol-1", values: ["M"] }, update: { values: ["M"] } })
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { volunteerId: "vol-1", questionId: { in: ["diet"] } } })
  })

  it("an existing volunteer without proof of the address: adds missing answers only, never replaces or clears", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "vol-9" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ answers: { size: "S" } }))
    expect(res.status).toBeLessThan(300)
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.createMany).toHaveBeenCalledWith({ data: [{ questionId: "size", eventId: "evt-1", volunteerId: "vol-9", values: ["S"] }], skipDuplicates: true })
  })

  it("an existing volunteer with a valid invitation: answers replaced as for a new one", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "vol-9" })
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ answers: { size: "S" }, inviteToken: "tok-inv" }))
    expect(res.status).toBeLessThan(300)
    expect(m.upsert.mock.calls[0][0]).toMatchObject({ where: { questionId_volunteerId: { questionId: "size", volunteerId: "vol-9" } }, update: { values: ["S"] } })
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { volunteerId: "vol-9", questionId: { in: ["diet"] } } })
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it("writes nothing when an answer is refused", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post({ answers: { size: "M", diet: ["Carnivore"] } }))).status).toBe(400)
    expect(m.txCreate).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
  })
})

// Questions asked to some postes only (#1140): judged from the shifts this sign-up registers.
describe("public sign-up with questions asked to some postes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "a", timeZone: null }, confirmationMessage: null })
    m.shiftFindMany.mockResolvedValue([bar])
    m.volunteerFindFirst.mockResolvedValue(null)
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s1", status: "active", waitingPosition: null })
    m.questions.mockResolvedValue([
      { id: "size", label: "Taille", type: "single", options: ["S", "M"], required: false },
      { id: "cash", label: "Caisse ?", type: "yesno", options: [], required: true, displayScope: "roles", displayRoleNames: ["Bar"] },
      { id: "kitchen", label: "Allergies ?", type: "text", options: [], required: true, displayScope: "roles", displayRoleNames: ["Cuisine"] },
      { id: "kitchen-more", label: "Lesquelles ?", type: "text", options: [], required: true, parentId: "kitchen", showIfValues: [] },
    ])
  })

  it("a required question of a poste not chosen never blocks; one of the chosen poste is required", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const missing = await POST(post({ answers: {} }))
    expect(missing.status).toBe(400)
    expect((await missing.json()).questionErrors.map((e: { questionId: string }) => e.questionId)).toEqual(["cash"])
    expect((await POST(post({ answers: { cash: "Oui" } }))).status).toBeLessThan(300)
  })

  it("an answer posted for a question of another poste is ignored, never stored nor refused", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ answers: { cash: "Non", kitchen: "x".repeat(500) } }))
    expect(res.status).toBeLessThan(300)
    expect(m.upsert.mock.calls.map((c) => c[0].create.questionId)).toEqual(["cash"])
  })

  it("with proof of the address, an empty asked question is cleared, an out-of-scope one (and its follow-up) keeps its stored answer", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "vol-9" })
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ answers: { cash: "Oui" }, inviteToken: "tok-inv" }))
    expect(res.status).toBeLessThan(300)
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { volunteerId: "vol-9", questionId: { in: ["size"] } } })
  })
})

