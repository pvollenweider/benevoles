import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

// More shifts from the personal page (#1013): POST /api/public/registrations with the session's
// personal link. The link proves ownership of its own member's address on this event only; then
// what changed in the form (name, phone, answers) is saved with the personal page's rules (#997),
// and nothing is written, logged or told when nothing changed.

const m = vi.hoisted(() => ({
  volFindFirst: vi.fn(),
  regFindFirst: vi.fn(),
  regFindMany: vi.fn(),
  txRegFindMany: vi.fn(),
  txCreate: vi.fn(),
  txVolUpdate: vi.fn(),
  txRegUpdateMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  volUpdate: vi.fn(),
  recordAnswerChanges: vi.fn(),
  enqueueNotifications: vi.fn(),
}))

// The event's active questions, with the stored answers of v1 (the link's member).
const questions = [
  { id: "size", label: "Taille ?", type: "single", options: ["S", "M", "L"], required: true, position: 0, archivedAt: null, roleName: null, answers: [{ values: ["M"] }] },
  { id: "note", label: "Remarque ?", type: "text", options: [], required: false, position: 1, archivedAt: null, roleName: null, answers: [{ values: ["Végétarien"] }] },
]
const questionRead = async (args: { select: { answers?: unknown } }) =>
  args.select.answers ? questions : questions.map(({ answers: _a, ...q }) => q)

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "v1", erasedAt: null, email: "julie@x.com" }]),
    shift: { findMany: vi.fn().mockResolvedValue([]) },
    volunteer: { createMany: vi.fn(), findFirstOrThrow: vi.fn(), update: m.txVolUpdate },
    charterVersion: { upsert: vi.fn() },
    rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    eventQuestion: { findMany: questionRead },
    questionAnswer: { upsert: m.upsert, deleteMany: m.deleteMany, createMany: m.createMany },
    registration: {
      // The link is checked again under the member lock (#1138 follow-up).
      findFirst: (...args: unknown[]) => m.regFindFirst(...args),
      findMany: m.txRegFindMany,
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
      create: m.txCreate,
      updateMany: m.txRegUpdateMany,
    },
  }
  return {
    prisma: {
      eventQuestion: { findMany: questionRead },
      event: {
        findFirst: vi.fn().mockResolvedValue({
          id: "evt-1", organizationId: "org-a", title: "Festival", confirmationMessage: null, publicStatus: "published",
          registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, requirePhone: false,
          cancelDeadlineDays: null, cancelDeadlineHours: null, startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01"),
          organization: { slug: "a", timeZone: "Europe/Zurich", volunteerCharter: null },
        }),
      },
      shift: {
        findMany: vi.fn().mockResolvedValue([
          { id: "shift-2", label: "Bar", roleName: "Bar", capacity: 5, minAge: null, waitlistEnabled: false, registrations: [], date: new Date("2030-06-01T00:00:00Z"), startTime: "14:00", endTime: "16:00" },
        ]),
      },
      volunteer: { findFirst: m.volFindFirst, update: m.volUpdate },
      memberInvite: { findFirst: vi.fn(), updateMany: vi.fn() },
      registration: { findFirst: m.regFindFirst, findMany: m.regFindMany },
      eventGroupLink: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  }
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => ({ payloads: [], send: async () => ({ ok: true }) }),
  enqueueNotifications: m.enqueueNotifications,
  deliverAfterResponse: vi.fn(),
}))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("@/lib/org-activity", () => ({ touchOrgActivity: vi.fn() }))
vi.mock("@/lib/answer-change-save", async (orig) => ({ ...(await orig<typeof import("@/lib/answer-change-save")>()), recordAnswerChanges: m.recordAnswerChanges }))

const member = { id: "v1", email: "julie@x.com" }
// The link's registration: v1's, on this event, phone given at sign-up.
const link = { volunteerId: "v1", phone: "079 111 11 11", volunteer: { firstName: "Julie", lastName: "Martin", phone: null } }

function post(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `pl-${Math.random()}` },
    body: JSON.stringify({
      eventId: "evt-1", shiftIds: ["shift-2"], firstName: "Julie", lastName: "Martin", email: "julie@x.com",
      phone: "079 111 11 11", consent: true, charterAccepted: true, answers: { size: "M", note: "Végétarien" },
      personalToken: "my-tok", ...extra,
    }),
  })
}

const signUp = async (extra: Record<string, unknown> = {}) => {
  const { POST } = await import("@/app/api/public/registrations/route")
  const res = await POST(post(extra))
  return { res, body: await res.json() }
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.volFindFirst.mockResolvedValue(member)
  m.regFindFirst.mockResolvedValue(link)
  m.enqueueNotifications.mockResolvedValue([])
  // Outside the transaction: no duplicate, no overlap; the phones of v1's live registrations.
  m.regFindMany.mockImplementation(async (args: { select?: { phone?: boolean } }) => (args.select?.phone ? [{ phone: "079 111 11 11" }] : []))
  // Inside: no overlap; v1's live registrations, the new one far ahead (answers still editable).
  m.txRegFindMany.mockImplementation(async (args: { select?: { status?: boolean } }) => (args.select?.status
    ? [{ status: "active", shift: { date: new Date("2030-06-01T00:00:00Z"), startTime: "14:00", endTime: "16:00" } }]
    : []))
  m.txCreate.mockResolvedValue({ id: "reg-new", shiftId: "shift-2", status: "active", waitingPosition: null })
})

describe("POST /api/public/registrations with the personal link (#1013)", () => {
  it("looks the link up on this event, live registrations only, by its hash", async () => {
    await signUp()
    expect(m.regFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ editTokenHash: hashToken("my-tok"), eventId: "evt-1", status: { in: expect.arrayContaining(["active", "waiting"]) } }),
    }))
  })

  it("nothing changed: no profile, phone or answer write, nothing logged nor told", async () => {
    const { res, body } = await signUp()
    expect(res.status).toBe(201)
    expect(body.updated).toEqual({ contact: [], answers: 0 })
    expect(body.editToken).toEqual(expect.any(String))
    expect(m.txVolUpdate).not.toHaveBeenCalled()
    expect(m.txRegUpdateMany).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.createMany).not.toHaveBeenCalled()
    expect(m.volUpdate).not.toHaveBeenCalled()
    expect(m.recordAnswerChanges).not.toHaveBeenCalled()
  })

  it("a changed phone and answer: saved on the member and the event's registrations, the answer logged and told", async () => {
    const { body } = await signUp({ phone: " 079 222 22 22 ", answers: { size: "L", note: "Végétarien" } })
    expect(body.updated).toEqual({ contact: ["phone"], answers: 1 })
    expect(m.txVolUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { phone: "079 222 22 22" } })
    expect(m.txRegUpdateMany).toHaveBeenCalledWith({ where: { volunteerId: "v1", eventId: "evt-1", status: { in: expect.any(Array) } }, data: { phone: "079 222 22 22" } })
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { questionId_volunteerId: { questionId: "size", volunteerId: "v1" } }, update: { values: ["L"] } }))
    expect(m.recordAnswerChanges).toHaveBeenCalledWith(expect.objectContaining({
      volunteerId: "v1",
      changes: [expect.objectContaining({ questionId: "size", from: ["M"], to: ["L"] })],
    }))
    // Not the invitation's unconditional profile rewrite.
    expect(m.volUpdate).not.toHaveBeenCalled()
  })

  it("an optional answer emptied in the form is removed", async () => {
    const { body } = await signUp({ answers: { size: "M", note: "" } })
    expect(body.updated.answers).toBe(1)
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { questionId: "note", volunteerId: "v1" } })
  })

  it("another member's link (email collision): nothing of that member is changed, no token", async () => {
    m.regFindFirst.mockResolvedValue({ ...link, volunteerId: "v-other" })
    const { res, body } = await signUp({ phone: "079 999 99 99", answers: { size: "L", note: "x" } })
    expect(res.status).toBe(201)
    expect(body.editToken).toBeNull()
    expect(body.updated).toBeUndefined()
    expect(m.txVolUpdate).not.toHaveBeenCalled()
    expect(m.txRegUpdateMany).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.recordAnswerChanges).not.toHaveBeenCalled()
  })

  it("an unknown or cancelled link proves nothing", async () => {
    m.regFindFirst.mockResolvedValue(null)
    const { body } = await signUp({ phone: "079 999 99 99", answers: { size: "L", note: "x" } })
    expect(body.editToken).toBeNull()
    expect(body.updated).toBeUndefined()
    expect(m.txVolUpdate).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("without the link, a sign-up of a known address is unchanged: no update", async () => {
    const { body } = await signUp({ personalToken: undefined, phone: "079 999 99 99" })
    expect(m.regFindFirst).not.toHaveBeenCalled()
    expect(body.editToken).toBeNull()
    expect(body.updated).toBeUndefined()
    expect(m.txVolUpdate).not.toHaveBeenCalled()
  })

  it("answers locked (every registration on the event started): only missing answers are added", async () => {
    m.txRegFindMany.mockImplementation(async (args: { select?: { status?: boolean } }) => (args.select?.status
      ? [{ status: "active", shift: { date: new Date("2020-06-01T00:00:00Z"), startTime: "14:00", endTime: "16:00" } }]
      : []))
    const { body } = await signUp({ answers: { size: "L", note: "Végétarien" } })
    expect(body.updated.answers).toBe(0)
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.recordAnswerChanges).not.toHaveBeenCalled()
  })
})
