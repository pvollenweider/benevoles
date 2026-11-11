import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres: off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

// A poste reserved to an answer (#962): checked at the public sign-up on the form's answers; a
// known member's stored answer counts only with proof of the address (no oracle on it, AUTHZ-01).
const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  questionFindMany: vi.fn(),
  txCreate: vi.fn(),
  volunteerFindFirst: vi.fn(),
  answerFindMany: vi.fn(),
  regFindFirst: vi.fn(),
  txRegFindFirst: vi.fn(),
}))
vi.mock("@/lib/prisma", async () => {
  const locked = (await import("./helpers/locked-shifts")).lockedShiftReads()
  return {
    prisma: {
      charterVersion: { upsert: vi.fn() },
      eventQuestion: { findMany: m.questionFindMany },
      event: { findFirst: m.eventFindFirst },
      shift: { findMany: locked.top(m.shiftFindMany) },
      volunteer: { findFirst: m.volunteerFindFirst },
      questionAnswer: { findMany: m.answerFindMany },
      registration: { findFirst: m.regFindFirst, findMany: vi.fn().mockResolvedValue([]) },
      memberInvite: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
        $queryRaw: vi.fn().mockResolvedValue([{ id: "vol-1", erasedAt: null, email: "lea@x.ch" }]),
        shift: { findMany: locked.tx(vi.fn().mockResolvedValue([])) },
        volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }) },
        charterVersion: { upsert: vi.fn() },
        rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
        shiftDecline: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        registration: { findFirst: m.txRegFindFirst, findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }), create: m.txCreate },
        questionAnswer: { upsert: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
        eventQuestion: { findMany: vi.fn().mockResolvedValue([permit]) },
      })),
    },
  }
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ collectNotifications: () => ({ send: vi.fn(), payloads: [] }), enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))

const permit = { id: "q1", label: "Permis de conduire", type: "yesno", options: [], required: false, parentId: null, showIfValues: [], displayScope: "event", displayRoleNames: [], answers: [] }
const navette = {
  id: "s1", label: "Navette", roleName: "Navette", capacity: 5, minAge: null, waitlistEnabled: false, requiresApproval: false, overlapAllowed: false,
  registrations: [], reservedTags: [], reservedQuestionId: "q1", reservedAnswers: ["Oui"], date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00",
}
const post = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/public/registrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, charterAccepted: true, ...extra }),
})

describe("public sign-up to a poste reserved to an answer (#962)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "a", timeZone: null }, confirmationMessage: null })
    m.shiftFindMany.mockResolvedValue([navette])
    m.questionFindMany.mockResolvedValue([permit])
    m.volunteerFindFirst.mockResolvedValue(null)
    m.answerFindMany.mockResolvedValue([])
    m.regFindFirst.mockResolvedValue(null)
    // The token's link is still this member's (line 472); no registration already holds the shift.
    m.txRegFindFirst.mockImplementation(async ({ where }: { where?: { shiftId?: unknown } }) => where?.shiftId ? null : { id: "link-reg" })
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s1", status: "active", waitingPosition: null })
  })

  it("is accepted with the accepted answer", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ answers: { q1: "Oui" } }))
    expect(res.status).toBeLessThan(300)
    expect(m.txCreate).toHaveBeenCalledOnce()
  })

  it("is refused with another answer or no answer, near the question and the shift", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    for (const answers of [{ q1: "Non" }, {}]) {
      const res = await POST(post({ answers }))
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe("Ce poste est réservé aux personnes qui répondent Oui à « Permis de conduire ».")
      expect(body.reservedAnswerShiftIds).toEqual(["s1"])
      expect(body.questionErrors).toEqual([{ questionId: "q1", message: body.error }])
      expect(m.txCreate).not.toHaveBeenCalled()
    }
  })

  it("is accepted from « Mes inscriptions » when the volunteer answers the question", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "vol-1" })
    m.regFindFirst.mockResolvedValue({ volunteerId: "vol-1", phone: null, volunteer: { firstName: "Léa", lastName: "M", phone: null } })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ personalToken: "tok", answers: { q1: "Oui" } }))
    expect(res.status).toBeLessThan(300)
    expect(m.txCreate).toHaveBeenCalledOnce()
  })

  it("without proof of the address, checks the typed answer only, never the stored one", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "vol-1" })
    m.answerFindMany.mockResolvedValue([{ questionId: "q1", values: ["Non"] }])
    const { POST } = await import("@/app/api/public/registrations/route")
    // A refusal here would tell a stranger that this member answered « Non ».
    expect((await POST(post({ answers: { q1: "Oui" } }))).status).toBeLessThan(300)
    m.answerFindMany.mockResolvedValue([{ questionId: "q1", values: ["Oui"] }])
    expect((await POST(post({ answers: { q1: "Non" } }))).status).toBe(403)
    expect(m.answerFindMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ volunteerId: "vol-1" }) }))
  })

  it("with the personal link, the stored answer counts when the form does not send it again", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "vol-1" })
    m.regFindFirst.mockResolvedValue({ volunteerId: "vol-1", phone: null, volunteer: { firstName: "Léa", lastName: "M", phone: null } })
    m.answerFindMany.mockResolvedValue([{ questionId: "q1", values: ["Oui"] }])
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post({ personalToken: "tok", answers: {} }))).status).toBeLessThan(300)
  })

})
