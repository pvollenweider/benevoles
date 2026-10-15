import { describe, it, expect, vi, beforeEach } from "vitest"

// « Mes réponses » on the personal page (#984): the API sends the event's active questions with the
// answers of the link's volunteer only, never another member's, in the order of the form.

const findFirst = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
const questionFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst, findMany }, eventQuestion: { findMany: questionFindMany } } }))
vi.mock("@/lib/urls", () => ({
  orgBaseUrl: () => "http://localhost:3000",
  eventPublicUrl: (org: string, slug: string) => `http://localhost:3000/${slug}?org=${org}`,
}))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/withdrawal-notifications", () => ({ buildWithdrawalNotifications: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

const shift = { id: "s1", label: "Bar", roleName: "Bar", date: new Date("2099-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" }

// The questions of event e1 as stored, with the answers of two members (v1 has the link).
const stored = [
  { id: "q2", eventId: "e1", label: "Taille de t-shirt ?", position: 1, archivedAt: null, answers: [{ volunteerId: "v2", values: ["L"] }, { volunteerId: "v1", values: ["M"] }] },
  { id: "q1", eventId: "e1", label: "Repas du soir ?", position: 0, archivedAt: null, answers: [{ volunteerId: "v2", values: ["Oui"] }] },
  { id: "q3", eventId: "e1", label: "Ancienne question ?", position: 2, archivedAt: new Date("2026-10-01"), answers: [{ volunteerId: "v1", values: ["X"] }] },
  { id: "q9", eventId: "e2", label: "Autre événement ?", position: 0, archivedAt: null, answers: [{ volunteerId: "v1", values: ["Y"] }] },
]

// What the database would answer for the arguments the route passes.
type Args = { where: { eventId: string; archivedAt: null }; select: { answers: { where: { volunteerId: string } } } }
function database(args: Args) {
  return stored
    .filter((q) => q.eventId === args.where.eventId && (args.where.archivedAt !== null || q.archivedAt === null))
    .sort((a, b) => a.position - b.position)
    .map((q) => ({ ...q, answers: q.answers.filter((a) => a.volunteerId === args.select.answers.where.volunteerId).map(({ values }) => ({ values })) }))
}

function stub() {
  findFirst.mockResolvedValue({
    id: "r1", volunteerId: "v1", eventId: "e1", phone: null, status: "active",
    volunteer: { firstName: "A", lastName: "B", email: "a@x.com", phone: null },
    event: {
      id: "e1", title: "Fête", slug: "fete", confirmationMessage: null, pages: [], sectorLeaders: [],
      publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
      endDate: new Date("2099-07-04T00:00:00Z"),
      organization: { slug: "asso-a", timeZone: "Europe/Zurich", replyToEmail: null },
    },
  })
  findMany.mockResolvedValue([{ id: "r1", editTokenLegacy: "tok", editTokenEnc: null, phone: null, status: "active", createdAt: new Date("2026-06-01"), groupLink: null, shift }])
  questionFindMany.mockImplementation(async (args: Args) => database(args))
}

async function body(url = "http://localhost/api/public/registrations/tok") {
  const { GET } = await import("@/app/api/public/registrations/[token]/route")
  const res = await GET(new Request(url, { headers: { "x-forwarded-for": `a-${Math.random()}` } }), { params: Promise.resolve({ token: "tok" }) })
  expect(res.status).toBe(200)
  return res.json()
}

describe("GET /api/public/registrations/[token] — the volunteer's answers (#984)", () => {
  beforeEach(() => { vi.clearAllMocks(); stub() })

  it("sends the link volunteer's own answers, in form order, without the archived questions", async () => {
    expect((await body()).answers.map(({ id, label, answer }: { id: string; label: string; answer: string | null }) => ({ id, label, answer }))).toEqual([
      { id: "q1", label: "Repas du soir ?", answer: null },
      { id: "q2", label: "Taille de t-shirt ?", answer: "M" },
    ])
  })

  it("reads the answers of the link's volunteer, on the link's event, whatever the request says", async () => {
    const b = await body("http://localhost/api/public/registrations/tok?volunteerId=v2&eventId=e2")
    const args = questionFindMany.mock.calls[0][0]
    expect(args.where).toEqual({ eventId: "e1", archivedAt: null })
    expect(args.select.answers.where).toEqual({ volunteerId: "v1" })
    expect(JSON.stringify(b)).not.toContain("\"L\"")
    expect(JSON.stringify(b)).not.toContain("Autre événement")
  })

  it("sends what the edit form needs, and whether editing is still open (#984, part 2)", async () => {
    const b = await body()
    expect(b.answers[1]).toMatchObject({ id: "q2", values: ["M"], required: false })
    // The shift is in 2099: the volunteer can still withdraw online, so change answers.
    expect(b.answersEdit).toEqual({ allowed: true })
  })

  it("an event without questions sends an empty list", async () => {
    questionFindMany.mockResolvedValue([])
    expect((await body()).answers.map(({ id, label, answer }: { id: string; label: string; answer: string | null }) => ({ id, label, answer }))).toEqual([])
  })

  it("an unknown link reads no question", async () => {
    findFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/public/registrations/[token]/route")
    const res = await GET(new Request("http://localhost/api/public/registrations/nope", { headers: { "x-forwarded-for": `b-${Math.random()}` } }), { params: Promise.resolve({ token: "nope" }) })
    expect(res.status).toBe(404)
    expect(questionFindMany).not.toHaveBeenCalled()
  })
})
