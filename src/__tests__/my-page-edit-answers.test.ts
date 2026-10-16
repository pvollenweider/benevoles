import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Changing one's answers from the personal page (#984, part 2): PATCH
// /api/public/registrations/[token]/answers. Who and which event come from the link only; only the
// event's active questions are written; a required question can't be cleared; the withdrawals'
// lock applies; each change is logged and the organisers' email queued.

const findFirst = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
const questionFindMany = vi.hoisted(() => vi.fn())
const volunteerFindFirst = vi.hoisted(() => vi.fn())
const upsert = vi.hoisted(() => vi.fn())
const deleteMany = vi.hoisted(() => vi.fn())
const logEvent = vi.hoisted(() => vi.fn())
const queueAnswerChangeNotifications = vi.hoisted(() => vi.fn())
const deliverAfterResponse = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => {
  const tx = { volunteer: { findFirst: volunteerFindFirst }, questionAnswer: { upsert, deleteMany } }
  return {
    prisma: {
      registration: { findFirst, findMany },
      eventQuestion: { findMany: questionFindMany },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("@/lib/event-log", () => ({ logEvent }))
vi.mock("@/lib/answer-change-notifications", () => ({ queueAnswerChangeNotifications }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverAfterResponse }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))

// Event e1's questions as stored, with the answers of two members (v1 has the link). q9 is
// another event's; q3 is archived. The route asks the database for e1's active ones only.
const stored = [
  { id: "meal", eventId: "e1", label: "Repas du soir ?", type: "yesno", options: [], required: false, position: 0, archivedAt: null, answers: [{ volunteerId: "v1", values: ["Oui"] }, { volunteerId: "v2", values: ["Non"] }] },
  { id: "size", eventId: "e1", label: "Taille ?", type: "single", options: ["S", "M", "L"], required: true, position: 1, archivedAt: null, answers: [{ volunteerId: "v1", values: ["M"] }] },
  { id: "note", eventId: "e1", label: "Remarque ?", type: "text", options: [], required: false, position: 2, archivedAt: null, answers: [] },
  { id: "q3", eventId: "e1", label: "Ancienne ?", type: "text", options: [], required: false, position: 3, archivedAt: new Date("2026-06-01"), answers: [] },
  { id: "q9", eventId: "e2", label: "Autre événement ?", type: "text", options: [], required: false, position: 0, archivedAt: null, answers: [] },
]
type Args = { where: { eventId: string; archivedAt: null }; select: { answers: { where: { volunteerId: string } } } }
const database = (args: Args) => stored
  .filter((q) => q.eventId === args.where.eventId && q.archivedAt === null)
  .map((q) => ({ ...q, answers: q.answers.filter((a) => a.volunteerId === args.select.answers.where.volunteerId).map(({ values }) => ({ values })) }))

const event = { id: "e1", title: "Fête", organizationId: "org-1", cancelDeadlineDays: null, cancelDeadlineHours: null, organization: { timeZone: "Europe/Zurich" } }
const linkRegistration = { volunteerId: "v1", eventId: "e1", volunteer: { firstName: "Julie", lastName: "Martin" }, event }
// Sat 4 July 2026, 10:00 in Zurich.
const liveShift = { status: "active", shift: { date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" } }

let seq = 0
const patch = (body: unknown, token = `tok-${++seq}`) => import("@/app/api/public/registrations/[token]/answers/route").then(({ PATCH }) =>
  PATCH(new Request(`http://localhost/api/public/registrations/${token}/answers`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-forwarded-for": `ans-${Math.random()}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ token }) }))

describe("PATCH /api/public/registrations/[token]/answers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-06-04T08:00:00Z"))
    findFirst.mockResolvedValue(linkRegistration)
    findMany.mockResolvedValue([liveShift])
    questionFindMany.mockImplementation(async (args: Args) => database(args))
    volunteerFindFirst.mockResolvedValue({ id: "v1" })
    queueAnswerChangeNotifications.mockResolvedValue(["n1"])
  })
  afterEach(() => vi.useRealTimers())

  it("changes an answer: written for the link's volunteer, logged, the organisers' email queued", async () => {
    const res = await patch({ answers: { meal: "Non", size: "M", note: "" } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.changed).toBe(1)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({
      where: { questionId_volunteerId: { questionId: "meal", volunteerId: "v1" } },
      create: { questionId: "meal", eventId: "e1", volunteerId: "v1", values: ["Non"] },
      update: { values: ["Non"] },
    })
    expect(deleteMany).not.toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledWith({
      eventId: "e1",
      actor: { type: "volunteer", id: "v1" },
      action: "question.answer_changed",
      entityType: "EventQuestion",
      entityId: "meal",
      changes: { question: { from: "Repas du soir ?", to: "Repas du soir ?" }, answer: { from: "Oui", to: "Non" } },
    })
    // Nothing about the person in the log but the actor id.
    expect(JSON.stringify(logEvent.mock.calls)).not.toMatch(/Julie|Martin/)
    const queued = queueAnswerChangeNotifications.mock.calls[0][0]
    expect(queued).toMatchObject({ event: { id: "e1", organizationId: "org-1" }, volunteerId: "v1", volunteerName: "Julie Martin", changes: [{ questionId: "meal", from: ["Oui"], to: ["Non"] }] })
    expect(typeof queued.changeId).toBe("string")
    expect(deliverAfterResponse).toHaveBeenCalledWith(["n1"])
  })

  it("clears an optional answer, and only touches the questions sent", async () => {
    const res = await patch({ answers: { meal: "" } })
    expect(res.status).toBe(200)
    expect(deleteMany).toHaveBeenCalledWith({ where: { questionId: "meal", volunteerId: "v1" } })
    expect(upsert).not.toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ changes: { question: { from: "Repas du soir ?", to: "Repas du soir ?" }, answer: { from: "Oui", to: null } } }))
  })

  it("refuses to clear a required question, field by field, and writes nothing", async () => {
    const res = await patch({ answers: { meal: "Non", size: "" } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.questionErrors).toEqual([{ questionId: "size", message: "« Taille ? » est obligatoire." }])
    expect(upsert).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
    expect(queueAnswerChangeNotifications).not.toHaveBeenCalled()
  })

  it("refuses an unknown choice and a text too long", async () => {
    expect((await patch({ answers: { size: "XXL" } })).status).toBe(400)
    expect((await patch({ answers: { note: "x".repeat(201) } })).status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })

  it("a number answer (#1015): checked against its bounds, stored as digits, logged as the number", async () => {
    const guests = { id: "guests", eventId: "e1", label: "Combien ?", type: "number", options: [], required: false, minValue: 1, maxValue: 8, position: 0, archivedAt: null, answers: [{ values: ["3"] }] }
    questionFindMany.mockResolvedValue([guests])
    const refused = await patch({ answers: { guests: "9" } })
    expect(refused.status).toBe(400)
    expect((await refused.json()).questionErrors).toEqual([{ questionId: "guests", message: "« Combien ? » : entre 1 et 8." }])
    expect((await patch({ answers: { guests: "2,5" } })).status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
    expect((await patch({ answers: { guests: " 04 " } })).status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { values: ["4"] } }))
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ changes: { question: { from: "Combien ?", to: "Combien ?" }, answer: { from: "3", to: "4" } } }))
    expect(queueAnswerChangeNotifications.mock.calls[0][0]).toMatchObject({ changes: [{ questionId: "guests", from: ["3"], to: ["4"] }] })
  })

  it("refuses a body without answers", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch("not json")).status).toBe(400)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("nothing changed: no write, no log, no email", async () => {
    const res = await patch({ answers: { meal: "Oui", size: "M" } })
    expect(res.status).toBe(200)
    expect((await res.json()).changed).toBe(0)
    expect(upsert).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
    expect(queueAnswerChangeNotifications).not.toHaveBeenCalled()
  })

  it("ignores ids in the body: the volunteer and the event are the link's", async () => {
    await patch({ volunteerId: "v2", eventId: "e2", answers: { meal: "Non" } })
    expect(questionFindMany.mock.calls[0][0].where).toEqual({ eventId: "e1", archivedAt: null })
    expect(questionFindMany.mock.calls[0][0].select.answers.where).toEqual({ volunteerId: "v1" })
    expect(findMany.mock.calls[0][0].where).toMatchObject({ volunteerId: "v1", eventId: "e1" })
    for (const [args] of upsert.mock.calls) expect(args.create).toMatchObject({ eventId: "e1", volunteerId: "v1" })
  })

  it("another event's question or an archived one is never written", async () => {
    const res = await patch({ answers: { q9: "Injecté", q3: "Injecté" } })
    expect(res.status).toBe(200)
    expect((await res.json()).changed).toBe(0)
    expect(upsert).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("another volunteer's answers stay out of the comparison and of the reply", async () => {
    // v2 answered « Non »: for v1, « Oui » → « Oui » is no change, and v2's answer is never sent back.
    const res = await patch({ answers: { meal: "Oui" } })
    const body = await res.json()
    expect(body.changed).toBe(0)
    expect(body.answers.find((r: { id: string }) => r.id === "meal")).toMatchObject({ answer: "Oui" })
  })

  it("an unknown or cancelled link: 404, counted as a miss, nothing read", async () => {
    findFirst.mockResolvedValue(null)
    const res = await patch({ answers: { meal: "Non" } }, "someone-elses-guess")
    expect(res.status).toBe(404)
    expect(findFirst.mock.calls[0][0].where.status).toEqual({ in: ["active", "waiting", "offered", "requested"] })
    expect(questionFindMany).not.toHaveBeenCalled()
  })

  it("closed like a withdrawal: past the event's deadline, 409 with the reason, nothing written", async () => {
    findFirst.mockResolvedValue({ ...linkRegistration, event: { ...event, cancelDeadlineDays: 2 } })
    vi.setSystemTime(new Date("2026-07-03T08:00:00Z"))
    const res = await patch({ answers: { meal: "Non" } })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "answers_closed", reason: "deadline" })
    expect(upsert).not.toHaveBeenCalled()
  })

  it("closed once the shift has started", async () => {
    vi.setSystemTime(new Date("2026-07-04T08:30:00Z"))
    const res = await patch({ answers: { meal: "Non" } })
    expect(res.status).toBe(409)
    expect((await res.json()).reason).toBe("started")
  })

  it("a record erased since the lookup is never written to", async () => {
    volunteerFindFirst.mockResolvedValue(null)
    const res = await patch({ answers: { meal: "Non" } })
    expect(res.status).toBe(404)
    expect(upsert).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a failed email does not undo the saved answers", async () => {
    queueAnswerChangeNotifications.mockRejectedValue(new Error("smtp"))
    const res = await patch({ answers: { meal: "Non" } })
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalled()
  })

  it("rate limited per link: 30 saves an hour", async () => {
    const token = `tok-limit-${Date.now()}`
    for (let i = 0; i < 30; i++) expect((await patch({ answers: { meal: "Oui" } }, token)).status).toBe(200)
    expect((await patch({ answers: { meal: "Oui" } }, token)).status).toBe(429)
    // Another link is not affected.
    expect((await patch({ answers: { meal: "Oui" } })).status).toBe(200)
  })
})
