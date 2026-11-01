import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { isAuthEndpoint } from "../auth-endpoints"

describe("next-auth endpoints skip the proxy's session wrapper (pentest F8)", () => {
  it("matches /api/auth and everything below it, nothing else", () => {
    for (const p of ["/api/auth", "/api/auth/signout", "/api/auth/session", "/api/auth/callback/credentials", "/api/auth/csrf"]) expect(isAuthEndpoint(p), p).toBe(true)
    for (const p of ["/api/authx", "/api/author/1", "/api/admin/events", "/admin/login", "/api/public/auth/x", "/"]) expect(isAuthEndpoint(p), p).toBe(false)
  })

  it("is how the proxy dispatches, and next-auth's route lives there", () => {
    const proxy = fs.readFileSync(path.join(__dirname, "..", "..", "proxy.ts"), "utf-8")
    expect(proxy).toMatch(/if \(isAuthEndpoint\(req\.nextUrl\.pathname\)\) return handle\(/)
    expect(fs.existsSync(path.join(__dirname, "..", "..", "app", "api", "auth", "[...nextauth]", "route.ts"))).toBe(true)
  })
})
