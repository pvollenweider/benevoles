import { describe, it, expect, vi, beforeEach } from "vitest"
import { FEEDBACK_RATE_LIMIT } from "@/lib/video-feedback"

// POST /api/public/video-feedback (#646): public, anonymous, validated against the catalogue.

const create = vi.hoisted(() => vi.fn())
const rateLimitUpsert = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    videoFeedback: { create },
    // The Postgres rate limit store goes through $queryRaw: it must never be used by this route.
    $queryRaw: (...args: unknown[]) => rateLimitUpsert(...args),
  },
}))
vi.mock("@/lib/video-catalog-load", () => ({
  loadVideoCatalog: () => [
    { id: "EVENT_CREATE_BLANK", revision: 2, manifest: { language: "fr-CH" } },
    { id: "VOLUNTEER_REGISTER", revision: 1, manifest: { language: "fr-CH" } },
  ],
}))

let ip = 0
function post(body: unknown, clientIp = `10.0.0.${++ip}`) {
  return new Request("http://localhost/api/public/video-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": clientIp },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const answer = { videoId: "EVENT_CREATE_BLANK", revision: 2, useful: true, context: "masterclass" }

async function route() {
  return (await import("@/app/api/public/video-feedback/route")).POST
}

describe("POST /api/public/video-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    create.mockResolvedValue({})
  })

  it("stores an anonymous answer: id, revision, language, answer, context and the day only", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-06T21:34:56.789Z"), toFake: ["Date"] })
    const POST = await route()
    const res = await POST(post({ ...answer, useful: false, context: "documentation" }))
    vi.useRealTimers()
    expect(res.status).toBe(201)
    expect(create).toHaveBeenCalledWith({
      data: {
        videoId: "EVENT_CREATE_BLANK",
        revision: 2,
        language: "fr",
        useful: false,
        context: "documentation",
        answeredOn: new Date("2026-10-06T00:00:00.000Z"),
      },
    })
  })

  it("never writes the IP, nor anything sent beyond the four fields", async () => {
    const POST = await route()
    await POST(post({ ...answer, email: "a@example.org", ip: "1.2.3.4" }, "203.0.113.9"))
    const data = create.mock.calls[0][0].data
    expect(JSON.stringify(data)).not.toContain("203.0.113.9")
    expect(Object.keys(data).sort()).toEqual(["answeredOn", "context", "language", "revision", "useful", "videoId"])
    // Rate limited in memory, not through the RateLimit table.
    expect(rateLimitUpsert).not.toHaveBeenCalled()
  })

  it("400s on a malformed body", async () => {
    const POST = await route()
    expect((await POST(post({ ...answer, useful: "oui" }))).status).toBe(400)
    expect((await POST(post({ ...answer, context: "email" }))).status).toBe(400)
    expect((await POST(post("not json"))).status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("404s for a video not in the catalogue", async () => {
    const POST = await route()
    expect((await POST(post({ ...answer, videoId: "NOT_A_VIDEO" }))).status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })

  it("409s for a revision that isn't the current one (regenerated video)", async () => {
    const POST = await route()
    expect((await POST(post({ ...answer, revision: 1 }))).status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })

  it("rate limits per IP, without blocking another IP", async () => {
    const POST = await route()
    for (let i = 0; i < FEEDBACK_RATE_LIMIT.limit; i++) {
      expect((await POST(post(answer, "198.51.100.1"))).status).toBe(201)
    }
    const refused = await POST(post(answer, "198.51.100.1"))
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect((await POST(post(answer, "198.51.100.2"))).status).toBe(201)
    expect(create).toHaveBeenCalledTimes(FEEDBACK_RATE_LIMIT.limit + 1)
  })
})
