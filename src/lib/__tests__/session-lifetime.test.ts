import { describe, it, expect } from "vitest"
import {
  newSessionClaims,
  sessionCookieOverride,
  sessionHardExpiry,
  sessionWithinLifetime,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
} from "../session-lifetime"
import { authConfig } from "../../auth.config"

const at = (iso: string) => new Date(iso)
const signedInAt = (iso: string) => newSessionClaims(at(iso), () => "sid-1")

describe("session lifetime", () => {
  it("is 7 days idle and 30 days at most", () => {
    expect(SESSION_IDLE_SECONDS).toBe(7 * 86_400)
    expect(SESSION_ABSOLUTE_SECONDS).toBe(30 * 86_400)
  })

  it("starts a session with a random id and the sign-in time", () => {
    expect(signedInAt("2026-11-01T10:00:00Z")).toEqual({ sid: "sid-1", authTime: Date.parse("2026-11-01T10:00:00Z") / 1000 })
    const a = newSessionClaims(), b = newSessionClaims()
    expect(a.sid).not.toBe(b.sid)
    expect(a.sid.length).toBeGreaterThanOrEqual(32)
  })

  it("keeps a session used every day until 30 days after its sign-in, then ends it", () => {
    const claims = signedInAt("2026-11-01T10:00:00Z")
    expect(sessionWithinLifetime(claims, at("2026-11-01T10:00:00Z"))).toBe(true)
    expect(sessionWithinLifetime(claims, at("2026-11-30T09:59:59Z"))).toBe(true)
    expect(sessionWithinLifetime(claims, at("2026-12-01T10:00:00Z"))).toBe(false)
    expect(sessionWithinLifetime(claims, at("2027-03-01T00:00:00Z"))).toBe(false)
  })

  it("refuses a token issued before sessions had an id or a sign-in time (signs in again once)", () => {
    const now = at("2026-11-01T10:00:00Z")
    expect(sessionWithinLifetime({}, now)).toBe(false)
    expect(sessionWithinLifetime({ sid: "x" }, now)).toBe(false)
    expect(sessionWithinLifetime({ authTime: now.getTime() / 1000 }, now)).toBe(false)
  })

  it("refuses malformed claims and a sign-in time in the future", () => {
    const now = at("2026-11-01T10:00:00Z")
    const t = now.getTime() / 1000
    expect(sessionWithinLifetime({ sid: "", authTime: t }, now)).toBe(false)
    expect(sessionWithinLifetime({ sid: "x".repeat(65), authTime: t }, now)).toBe(false)
    expect(sessionWithinLifetime({ sid: "x", authTime: String(t) }, now)).toBe(false)
    expect(sessionWithinLifetime({ sid: "x", authTime: Number.NaN }, now)).toBe(false)
    expect(sessionWithinLifetime({ sid: "x", authTime: t + 3600 }, now)).toBe(false)
    // A minute of clock skew between pods is tolerated.
    expect(sessionWithinLifetime({ sid: "x", authTime: t + 30 }, now)).toBe(true)
  })

  it("dates the hard expiry of a revoked id 30 days after the sign-in", () => {
    const { authTime } = signedInAt("2026-11-01T10:00:00Z")
    expect(sessionHardExpiry(authTime).toISOString()).toBe("2026-12-01T10:00:00.000Z")
  })
})

describe("session cookie", () => {
  it("is a host-only __Host- cookie over HTTPS", () => {
    expect(sessionCookieOverride({ AUTH_URL: "https://www.benevol.app" })).toEqual({
      sessionToken: { name: "__Host-authjs.session-token", options: { httpOnly: true, sameSite: "lax", path: "/", secure: true } },
    })
    expect(sessionCookieOverride({ NEXTAUTH_URL: "https://example.org" })?.sessionToken.name).toBe("__Host-authjs.session-token")
  })

  it("keeps next-auth's default over plain HTTP (local development, end-to-end tests)", () => {
    expect(sessionCookieOverride({ AUTH_URL: "http://localhost:3000" })).toBeUndefined()
    expect(sessionCookieOverride({})).toBeUndefined()
  })
})

describe("authConfig", () => {
  const jwt = authConfig.callbacks!.jwt! as unknown as (p: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Record<string, unknown> | null

  it("renews the cookie for 7 days of inactivity", () => {
    expect(authConfig.session).toMatchObject({ strategy: "jwt", maxAge: SESSION_IDLE_SECONDS })
  })

  it("gives a new session its id and sign-in time at sign-in", () => {
    const token = jwt({ token: { sub: "a1" }, user: { id: "a1", role: "admin", organizationId: "o1", sessionVersion: 2 } })
    expect(token).toMatchObject({ role: "admin", organizationId: "o1", sessionVersion: 2, sid: expect.any(String), authTime: expect.any(Number) })
  })

  it("ends a session past its absolute lifetime, and one without an id, on the next request", () => {
    const now = Math.floor(Date.now() / 1000)
    expect(jwt({ token: { sub: "a1", sid: "s", authTime: now - 3600 } })).not.toBeNull()
    expect(jwt({ token: { sub: "a1", sid: "s", authTime: now - SESSION_ABSOLUTE_SECONDS - 1 } })).toBeNull()
    expect(jwt({ token: { sub: "a1" } })).toBeNull()
  })
})
