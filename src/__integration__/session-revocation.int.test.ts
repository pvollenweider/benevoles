import { describe, it, expect, afterAll, beforeAll } from "vitest"

/**
 * Administration sessions against a real Postgres and next-auth's own handlers (pentest F2):
 * « Se déconnecter » revokes the session on the server, so the cookie copied before signing out is
 * refused afterwards, while the person's other sessions stay open. And the per-account login slot
 * (pentest F4): concurrent attempts on Postgres get one slot at a time.
 */

process.env.AUTH_URL ??= "http://localhost:3000"
process.env.AUTH_SECRET ??= "integration-secret-integration-secret-0123"

import bcrypt from "bcryptjs"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { postgresLoginSlots } from "@/lib/login-slot"

const url = process.env.DATABASE_URL
const tag = `int-session-${Date.now()}`
const email = `${tag}@example.org`
const PASSWORD = "Correct-Horse-Battery9!"
const BASE = process.env.AUTH_URL

type Jar = Map<string, string>

function remember(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";")
    const at = pair.indexOf("=")
    const name = pair.slice(0, at).trim()
    const value = pair.slice(at + 1).trim()
    const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a.trim()))
    if (expired || value === "") jar.delete(name)
    else jar.set(name, value)
  }
}
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ")

describe.skipIf(!url)("sign-out ends the session on the server (pentest F2)", () => {
  let handlers: typeof import("@/auth").handlers

  beforeAll(async () => {
    ;({ handlers } = await import("@/auth"))
    await prisma.adminUser.create({
      data: { email, name: "Léa Rochat", passwordHash: await bcrypt.hash(PASSWORD, 4), role: "super_admin", organizationId: null },
    })
  })

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email } })
    await prisma.rateLimit.deleteMany({ where: { key: { contains: tag } } })
    await prisma.$disconnect()
  })

  const get = async (path: string, jar: Jar) => {
    const res = await handlers.GET(new NextRequest(`${BASE}${path}`, { headers: { cookie: cookieHeader(jar) } }))
    remember(jar, res)
    return res
  }
  const post = async (path: string, jar: Jar, form: Record<string, string>) => {
    const res = await handlers.POST(new NextRequest(`${BASE}${path}`, {
      method: "POST",
      headers: { cookie: cookieHeader(jar), "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250)}` },
      body: new URLSearchParams(form).toString(),
    }))
    remember(jar, res)
    return res
  }
  const csrf = async (jar: Jar) => ((await (await get("/api/auth/csrf", jar)).json()) as { csrfToken: string }).csrfToken

  async function signIn(): Promise<Jar> {
    const jar: Jar = new Map()
    await post("/api/auth/callback/credentials", jar, { csrfToken: await csrf(jar), email, password: PASSWORD })
    expect([...jar.keys()].some((k) => k.endsWith("authjs.session-token")), "signed in").toBe(true)
    return jar
  }
  const sessionUser = async (jar: Jar) => ((await (await get("/api/auth/session", jar)).json()) as { user?: { email?: string } } | null)?.user?.email ?? null

  it("refuses the cookie copied before signing out, and keeps the other sessions", async () => {
    const browser = await signIn()
    const phone = await signIn()
    const copy: Jar = new Map(browser)
    expect(await sessionUser(copy)).toBe(email)

    await post("/api/auth/signout", browser, { csrfToken: await csrf(browser) })
    expect([...browser.keys()].some((k) => k.endsWith("authjs.session-token")), "cookie cleared").toBe(false)
    expect(await prisma.revokedSession.count({ where: { expiresAt: { gt: new Date() } } })).toBeGreaterThan(0)

    // The copy kept elsewhere no longer opens the session...
    expect(await sessionUser(new Map(copy))).toBeNull()
    // ...while the phone, signed in separately, still does.
    expect(await sessionUser(phone)).toBe(email)
  })

  it("ends a session 30 days after its sign-in even if used every day, and one issued without an id", async () => {
    const { encode } = await import("next-auth/jwt")
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { email } })
    const salt = "authjs.session-token"
    const forge = async (claims: Record<string, unknown>) => {
      const value = await encode({ token: { sub: admin.id, email, sessionVersion: admin.sessionVersion, ...claims }, secret: process.env.AUTH_SECRET!, salt })
      return new Map([[salt, value]]) as Jar
    }
    const now = Math.floor(Date.now() / 1000)
    expect(await sessionUser(await forge({ sid: `${tag}-recent`, authTime: now - 29 * 86_400 }))).toBe(email)
    expect(await sessionUser(await forge({ sid: `${tag}-old`, authTime: now - 30 * 86_400 - 60 }))).toBeNull()
    expect(await sessionUser(await forge({}))).toBeNull()
  })
})

describe.skipIf(!url)("login slot on Postgres (pentest F4)", () => {
  afterAll(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: `login-slot:${tag}` } } })
    await prisma.$disconnect()
  })

  it("gives the slot to exactly one of 25 concurrent attempts", async () => {
    const key = `login-slot:${tag}-crowd`
    const waits = await Promise.all(Array.from({ length: 25 }, () => postgresLoginSlots.claim(key, 4000)))
    const granted = waits.filter((w) => w !== null)
    expect(granted).toHaveLength(1)
    expect(granted[0]).toBeGreaterThan(3500)
    expect(granted[0]).toBeLessThanOrEqual(4001)
  })

  it("can be claimed again once passed, and a refused claim doesn't move it", async () => {
    const key = `login-slot:${tag}-again`
    expect(await postgresLoginSlots.claim(key, 60_000)).not.toBeNull()
    const before = (await prisma.rateLimit.findUniqueOrThrow({ where: { key } })).resetAt
    expect(await postgresLoginSlots.claim(key, 1000)).toBeNull()
    expect((await prisma.rateLimit.findUniqueOrThrow({ where: { key } })).resetAt).toEqual(before)

    await prisma.rateLimit.update({ where: { key }, data: { resetAt: new Date(Date.now() - 1000) } })
    const wait = await postgresLoginSlots.claim(key, 2000)
    expect(wait).not.toBeNull()
    expect(wait!).toBeGreaterThan(1500)
  })
})
