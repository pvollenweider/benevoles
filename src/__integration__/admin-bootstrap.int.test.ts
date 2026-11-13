// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { bootstrapSuperAdmin } from "@/lib/admin-bootstrap"

/**
 * The startup bootstrap (#1334) against a real Postgres: one account, once, and two pods starting
 * together create one (the transaction-scoped advisory lock serialises them). The suite only runs
 * when the test database has no super admin of its own; it deletes the rows it creates.
 */

const url = process.env.DATABASE_URL
const tag = `int-admin-bootstrap-${Date.now()}`
const PASSWORD = "Correct-Horse-Battery9!"
const emailFor = (who: string) => `${tag}-${who}@example.org`

describe.skipIf(!url)("first super admin at startup (#1334)", () => {
  let blocked = false

  beforeAll(async () => {
    // Another file's super admin would make the bootstrap legitimately do nothing.
    blocked = (await prisma.adminUser.count({ where: { role: "super_admin" } })) > 0
  })

  beforeEach(async () => {
    if (!blocked) await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
  })

  afterAll(async () => {
    if (!blocked) await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("creates the super admin once, from a normalised address, and ignores the second start", async (ctx) => {
    if (blocked) ctx.skip()
    const email = emailFor("once")
    const env = { HOSTED_SERVICE: "false", ADMIN_EMAIL: `  ${email.toUpperCase()} `, ADMIN_PASSWORD: PASSWORD }

    await bootstrapSuperAdmin(env, prisma)
    await bootstrapSuperAdmin(env, prisma)

    const rows = await prisma.adminUser.findMany({ where: { email } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: "Administrateur", role: "super_admin", organizationId: null, isActive: true })
    expect(await bcrypt.compare(PASSWORD, rows[0].passwordHash)).toBe(true)
  })

  it("leaves an existing account with that address untouched", async (ctx) => {
    if (blocked) ctx.skip()
    const email = emailFor("taken")
    const before = await prisma.adminUser.create({
      data: {
        email,
        name: "Compte existant",
        passwordHash: await bcrypt.hash("Ancien-Mot-De-Passe1!", 4),
        role: "admin",
        organizationId: null,
        isActive: false,
      },
    })

    await bootstrapSuperAdmin({ HOSTED_SERVICE: "false", ADMIN_EMAIL: email, ADMIN_PASSWORD: PASSWORD }, prisma)

    expect(await prisma.adminUser.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
  })

  it("two concurrent starts create exactly one super admin", async (ctx) => {
    if (blocked) ctx.skip()
    const email = emailFor("race")
    const env = { HOSTED_SERVICE: "false", ADMIN_EMAIL: email, ADMIN_PASSWORD: PASSWORD }

    await Promise.all([bootstrapSuperAdmin(env, prisma), bootstrapSuperAdmin(env, prisma)])

    expect(await prisma.adminUser.count({ where: { email } })).toBe(1)
    expect(await prisma.adminUser.count({ where: { role: "super_admin" } })).toBe(1)
  })
})
