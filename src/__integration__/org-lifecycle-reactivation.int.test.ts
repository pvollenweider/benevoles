import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * Self-service reactivation (« Réactiver mon espace ») and the operator's decisions on the same
 * organisation, against a real Postgres: a suspension always wins. Whatever the order in which
 * they reach the database, no organisation ends up suspended and active, its admins never sign
 * in, the link is spent once and the reactivation logged at most once.
 */

// The operator's route: a super admin session, without NextAuth.
vi.mock("@/lib/auth-guard", () => ({
  requireSuperAdmin: async () => ({ session: { user: { id: null, name: "Opérateur", email: "operator@example.org", role: "super_admin" } } }),
}))

import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { organizationAllowsSignIn } from "@/lib/admin-sign-in"
import { POST as confirm } from "@/app/api/public/org-reactivation/confirm/route"
import { PATCH as operatorPatch } from "@/app/api/super-admin/organizations/[id]/route"

const url = process.env.DATABASE_URL
const tag = `int-react-race-${Date.now()}`
let n = 0

const post = (token: string) => new Request("http://localhost/x", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `${tag}-${++n}` },
  body: JSON.stringify({ token }),
})

const suspend = (id: string) => prisma.organization.update({ where: { id }, data: { active: false, suspendedAt: new Date(), suspensionReason: "Enquête en cours" } })

/** A space deactivated for inactivity, with one admin holding a valid reactivation link. */
async function deactivatedSpace(suffix: string) {
  const org = await prisma.organization.create({ data: { name: `Comité ${suffix}`, slug: `${tag}-${suffix}`, active: false, inactivityDeactivatedAt: new Date("2026-09-01T00:00:00Z") } })
  const token = `${tag}-${suffix}-reactivation-link-0000000000`
  const admin = await prisma.adminUser.create({
    data: { organizationId: org.id, name: "Julie", email: `${tag}-${suffix}@example.org`, role: "admin", passwordHash: "x", isActive: true, orgReactivationTokenHash: hashToken(token), orgReactivationExpiresAt: new Date(Date.now() + 3600_000) },
  })
  return { org, token, admin }
}

/**
 * Runs `fn` with the route's transaction wrapped: `onFirst` runs right after the route's first
 * read of `model.method` inside its transaction, from another connection.
 */
async function withHook<T>(model: string, method: string, onFirst: () => Promise<unknown>, fn: () => Promise<T>): Promise<T> {
  const original = prisma.$transaction.bind(prisma)
  let fired = false
  const spy = vi.spyOn(prisma, "$transaction").mockImplementation(((cb: (tx: unknown) => unknown, options: unknown) => original(async (tx) => {
    const proxied = new Proxy(tx, {
      get(target, key) {
        if (key !== model) return Reflect.get(target, key)
        const delegate = Reflect.get(target, key) as Record<string, (args: unknown) => Promise<unknown>>
        return new Proxy(delegate, {
          get(d, m) {
            if (m !== method) return Reflect.get(d, m)
            return async (args: unknown) => {
              const row = await d[method](args)
              if (!fired) {
                fired = true
                await onFirst()
              }
              return row
            }
          },
        })
      },
    })
    return cb(proxied)
  }, options as never)) as never)
  try {
    return await fn()
  } finally {
    spy.mockRestore()
  }
}

async function expectSuspended(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })
  expect(org.suspendedAt).not.toBeNull()
  expect(org.active).toBe(false)
  expect(organizationAllowsSignIn({ role: "admin", organization: org })).toBe(false)
}

describe.skipIf(!url)("reactivation never overrides a suspension (Postgres)", () => {
  const orgIds: string[] = []

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
    await prisma.$disconnect()
  })

  it("reactivates a space deactivated for inactivity, once", async () => {
    const { org, token } = await deactivatedSpace("plain")
    orgIds.push(org.id)
    const res = await confirm(post(token))
    expect(res.status).toBe(200)
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after).toMatchObject({ active: true, suspendedAt: null, inactivityDeactivatedAt: null })
    expect((await confirm(post(token))).status).toBe(400)
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.reactivated_after_inactivity" } })).toBe(1)
  })

  it("refuses when an operator suspension is committed after the link was read", async () => {
    const { org, token, admin } = await deactivatedSpace("between")
    orgIds.push(org.id)
    const res = await withHook("adminUser", "findUnique", () => suspend(org.id), () => confirm(post(token)))
    expect(res.status).toBe(400)
    await expectSuspended(org.id)
    // The link is spent all the same, and nothing is logged as a reactivation.
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } })).orgReactivationTokenHash).toBeNull()
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.reactivated_after_inactivity" } })).toBe(0)
  })

  it("lets a suspension arriving during the reactivation apply on top of it", async () => {
    const { org, token } = await deactivatedSpace("during")
    orgIds.push(org.id)
    let late: Promise<unknown> = Promise.resolve()
    // Started from another connection once the route holds the organisation's lock: it waits for
    // the route's commit, then applies.
    const res = await withHook("organization", "updateMany", async () => {
      late = suspend(org.id)
      await new Promise((r) => setTimeout(r, 150))
    }, () => confirm(post(token)))
    await late
    expect(res.status).toBe(200)
    await expectSuspended(org.id)
  })

  it("spends the link once when two confirmations run at the same time", async () => {
    const { org, token } = await deactivatedSpace("twice")
    orgIds.push(org.id)
    const answers = await Promise.all([confirm(post(token)), confirm(post(token))])
    expect(answers.map((r) => r.status).sort()).toEqual([200, 400])
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.reactivated_after_inactivity" } })).toBe(1)
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ active: true, suspendedAt: null })
  })

  it("never reactivates a space suspended before the link is used", async () => {
    const { org, token } = await deactivatedSpace("before")
    orgIds.push(org.id)
    await suspend(org.id)
    expect((await confirm(post(token))).status).toBe(400)
    await expectSuspended(org.id)
  })

  it("an operator's reactivation decided before a concurrent suspension is refused", async () => {
    const org = await prisma.organization.create({ data: { name: "Comité op", slug: `${tag}-op`, active: false } })
    orgIds.push(org.id)
    // The route reads the organisation outside its transaction first; the suspension lands right after.
    const original = prisma.organization.findUnique.bind(prisma.organization)
    let fired = false
    const spy = vi.spyOn(prisma.organization, "findUnique").mockImplementation((async (args: never) => {
      const row = await original(args)
      if (!fired) {
        fired = true
        await suspend(org.id)
      }
      return row
    }) as never)
    try {
      const res = await operatorPatch(
        new Request("http://localhost/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) }),
        { params: Promise.resolve({ id: org.id }) },
      )
      expect(res.status).toBe(409)
    } finally {
      spy.mockRestore()
    }
    await expectSuspended(org.id)
  })
})
