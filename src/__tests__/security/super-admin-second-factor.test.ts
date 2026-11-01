import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { applySecondFactor } from "@/lib/second-factor-session"

/**
 * Pentest F6: the second factor is enforced on the server for every super-admin route and page,
 * not only by the proxy's redirect. Every API handler under /api/super-admin goes through
 * requireSuperAdmin (401 while pending); every page under /super-admin checks the session's role,
 * which a pending session doesn't have (masked by applySecondFactor), or only redirects.
 */

const appDir = path.join(__dirname, "..", "..", "app")

function walk(dir: string, file: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p, file) : e.name === file ? [p] : []
  })
}

function handlers(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /export async function (GET|POST|PATCH|PUT|DELETE)\b/g
  const starts = [...source.matchAll(re)]
  starts.forEach((match, i) => { out[match[1]] = source.slice(match.index, starts[i + 1]?.index ?? source.length) })
  return out
}

describe("second factor on the super-admin surface", () => {
  const routes = walk(path.join(appDir, "api", "super-admin"), "route.ts")

  it("finds the super-admin API routes", () => {
    expect(routes.length).toBeGreaterThan(10)
  })

  it.each(routes.map((r) => [path.relative(appDir, r), r]))("%s: every handler asks requireSuperAdmin()", (_, file) => {
    const found = handlers(fs.readFileSync(file, "utf8"))
    expect(Object.keys(found).length).toBeGreaterThan(0)
    for (const [method, body] of Object.entries(found)) expect(body, method).toContain("await requireSuperAdmin()")
  })

  it.each(walk(path.join(appDir, "super-admin"), "page.tsx").map((p) => [path.relative(appDir, p), p]))("%s: checks the super admin role, or only redirects", (_, file) => {
    const source = fs.readFileSync(file, "utf8")
    const checksRole = /role\s*!==\s*"super_admin"/.test(source) || /role\s*===\s*"super_admin"/.test(source)
    const onlyRedirects = !source.includes("auth()") && /redirect\(/.test(source) && !/prisma/.test(source)
    expect(checksRole || onlyRedirects).toBe(true)
  })

  it("a pending session has no super admin role for those checks to find", () => {
    const session = applySecondFactor({ user: { role: "super_admin", organizationId: null as string | null } }, { role: "super_admin", loginNonce: "n", authAt: Date.now() }, Date.now())
    expect(session.user.role).not.toBe("super_admin")
  })

  it("the two-factor step's own route checks its session, never an organisation session", () => {
    const source = fs.readFileSync(path.join(appDir, "api", "admin", "two-factor", "route.ts"), "utf8")
    expect(source).toContain("await requireSecondFactorStep()")
    expect(source).not.toContain("requireOrgSession")
  })
})
