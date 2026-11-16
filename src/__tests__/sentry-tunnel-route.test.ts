import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SENTRY_TUNNEL_MAX_BYTES } from "@/lib/sentry-tunnel"

const OWN = "https://abc123@o4500000000000001.ingest.de.sentry.io/4500000000000002"
const body = (dsn: string) => `${JSON.stringify({ dsn })}\n{"type":"event"}\n{"message":"x"}\n`
const post = (payload: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/monitoring", { method: "POST", body: payload, headers: { "Content-Type": "text/plain;charset=UTF-8", ...headers } })

describe("POST /monitoring", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", OWN)
    vi.stubEnv("SENTRY_DSN", "")
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("relays this project's envelope, bytes unchanged, with Sentry's status and rate limits", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "60", "X-Sentry-Rate-Limits": "60:error:organization", "Set-Cookie": "x=1" } }))
    const { POST } = await import("@/app/monitoring/route")
    const res = await POST(post(body(OWN), { Cookie: "session=secret", Authorization: "Bearer x" }))
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("60")
    expect(res.headers.get("x-sentry-rate-limits")).toBe("60:error:organization")
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("cache-control")).toBe("no-store")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://o4500000000000001.ingest.de.sentry.io/api/4500000000000002/envelope/")
    expect(new TextDecoder().decode(init.body)).toBe(body(OWN))
    expect(init.redirect).toBe("error")
    expect(JSON.stringify(init.headers)).not.toMatch(/cookie|authorization/i)
  })

  it("refuses another project's envelope without contacting anyone", async () => {
    const { POST } = await import("@/app/monitoring/route")
    const res = await POST(post(body("https://k@o1.ingest.sentry.io/2")))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refuses an envelope over the size cap, and a compressed body", async () => {
    const { POST } = await import("@/app/monitoring/route")
    expect((await POST(post(body(OWN) + "x".repeat(SENTRY_TUNNEL_MAX_BYTES)))).status).toBe(413)
    expect((await POST(post(body(OWN), { "Content-Encoding": "gzip" }))).status).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("answers 502 when Sentry cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { POST } = await import("@/app/monitoring/route")
    expect((await POST(post(body(OWN)))).status).toBe(502)
  })
})
