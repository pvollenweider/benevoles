// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"
import {
  ADMIN_BOOTSTRAP_BCRYPT_COST,
  ADMIN_BOOTSTRAP_LOCK,
  bootstrapSuperAdmin,
  decideAdminBootstrap,
  isHostedDeployment,
  type AdminBootstrapPrisma,
} from "../admin-bootstrap"

const reported = vi.hoisted(() => vi.fn())
vi.mock("../report-error", () => ({
  reportError: (context: string) => (error: unknown) => reported(context, error),
}))

const PASSWORD = "Correct-Horse-Battery9!"
const ENV = {
  HOSTED_SERVICE: "false",
  ADMIN_EMAIL: "  New.Admin@Example.org ",
  ADMIN_PASSWORD: PASSWORD,
  ADMIN_NAME: "  Opérateur  ",
}

type AdminUserRow = {
  id: string
  email: string
  name: string
  role: string
  organizationId: string | null
  isActive: boolean
  passwordHash: string
}

/** The slice of Prisma the bootstrap uses, in memory: enough to assert what reaches the database. */
function fakeDb(initial: AdminUserRow[] = []) {
  const rows = [...initial]
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    adminUser: {
      count: vi.fn(async ({ where }: { where: { role: string } }) => rows.filter((r) => r.role === where.role).length),
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => rows.find((r) => r.email === where.email) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<AdminUserRow, "id"> }) => {
        if (rows.some((r) => r.email.toLowerCase() === data.email.toLowerCase())) throw new Error("unique constraint")
        const row = { id: `id-${rows.length + 1}`, ...data }
        rows.push(row)
        return row
      }),
    },
  }
  const transaction = vi.fn(async (fn: (t: unknown) => unknown) => fn(tx))
  const prisma = { $transaction: transaction } as unknown as AdminBootstrapPrisma
  return { prisma, tx, rows, transaction }
}

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  reported.mockClear()
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("decideAdminBootstrap (#1334)", () => {
  it("does nothing on the hosted service, whatever the variables", () => {
    expect(decideAdminBootstrap({ ...ENV, HOSTED_SERVICE: "true" }, { superAdminExists: false, emailTaken: false }))
      .toEqual({ action: "skip", reason: "hosted-service" })
  })

  it("tells the hosted service from a local try-out by its address when HOSTED_SERVICE is unset", () => {
    const state = { superAdminExists: false, emailTaken: false }
    const unset = { ...ENV, HOSTED_SERVICE: undefined }
    for (const url of ["https://www.benevol.app", "https://benevol.app"]) {
      expect(decideAdminBootstrap({ ...unset, NEXT_PUBLIC_APP_URL: url }, state)).toEqual({ action: "skip", reason: "hosted-service" })
    }
    for (const url of ["http://localhost:3000", "http://127.0.0.1:3000", "https://benevoles.example.org", undefined]) {
      expect(decideAdminBootstrap({ ...unset, NEXT_PUBLIC_APP_URL: url }, state).action, String(url)).toBe("create")
    }
    expect(isHostedDeployment({ HOSTED_SERVICE: "false", NEXT_PUBLIC_APP_URL: "https://www.benevol.app" })).toBe(false)
  })

  it("does nothing when neither variable is set", () => {
    expect(decideAdminBootstrap({ HOSTED_SERVICE: "false" }, { superAdminExists: false, emailTaken: false }))
      .toEqual({ action: "skip", reason: "not-configured" })
  })

  it("treats blank values as unset", () => {
    expect(decideAdminBootstrap({ HOSTED_SERVICE: "false", ADMIN_EMAIL: "  ", ADMIN_PASSWORD: "" }))
      .toEqual({ action: "skip", reason: "not-configured" })
  })

  it("warns about the missing variable when only one is set", () => {
    expect(decideAdminBootstrap({ HOSTED_SERVICE: "false", ADMIN_EMAIL: "admin@example.org" }))
      .toEqual({ action: "warn", missing: "ADMIN_PASSWORD" })
    expect(decideAdminBootstrap({ HOSTED_SERVICE: "false", ADMIN_PASSWORD: PASSWORD }))
      .toEqual({ action: "warn", missing: "ADMIN_EMAIL" })
  })

  it("does nothing once a super admin exists, even with a password that breaks the rules", () => {
    expect(decideAdminBootstrap({ ...ENV, ADMIN_PASSWORD: "weak" }, { superAdminExists: true, emailTaken: false }))
      .toEqual({ action: "skip", reason: "super-admin-exists" })
  })

  it("asks for the database state once the environment is complete", () => {
    expect(decideAdminBootstrap(ENV)).toEqual({ action: "check-database" })
  })

  it("refuses a password that breaks the rules and returns every failing rule", () => {
    const decision = decideAdminBootstrap({ ...ENV, ADMIN_PASSWORD: "abc" }, { superAdminExists: false, emailTaken: false })
    expect(decision.action).toBe("refuse")
    if (decision.action !== "refuse" || decision.reason !== "invalid-password") throw new Error("expected invalid-password")
    expect(decision.errors).toEqual(expect.arrayContaining(["10 caractères minimum", "Une lettre majuscule", "Un chiffre"]))
  })

  it("refuses an address that already has an account, before the password rules", () => {
    expect(
      decideAdminBootstrap({ ...ENV, ADMIN_PASSWORD: "weak" }, { superAdminExists: false, emailTaken: true }),
    ).toEqual({ action: "refuse", reason: "email-taken", email: "new.admin@example.org" })
  })

  it("creates with the login's normalisation, ADMIN_NAME trimmed, and the default name", () => {
    expect(decideAdminBootstrap(ENV, { superAdminExists: false, emailTaken: false })).toEqual({
      action: "create",
      email: "new.admin@example.org",
      name: "Opérateur",
      password: PASSWORD,
    })
    expect(decideAdminBootstrap({ ...ENV, ADMIN_NAME: undefined }, { superAdminExists: false, emailTaken: false }))
      .toMatchObject({ action: "create", name: "Administrateur" })
  })
})

describe("bootstrapSuperAdmin (#1334)", () => {
  it("creates the super admin once, in one transaction, with a bcrypt hash at the app's cost", async () => {
    const { prisma, tx, rows } = fakeDb()

    await bootstrapSuperAdmin(ENV, prisma)

    expect(tx.$executeRaw).toHaveBeenCalledOnce()
    expect(tx.$executeRaw).toHaveBeenCalledWith(expect.anything(), ADMIN_BOOTSTRAP_LOCK)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: "new.admin@example.org",
      name: "Opérateur",
      role: "super_admin",
      organizationId: null,
      isActive: true,
    })
    expect(bcrypt.getRounds(rows[0].passwordHash)).toBe(ADMIN_BOOTSTRAP_BCRYPT_COST)
    expect(await bcrypt.compare(PASSWORD, rows[0].passwordHash)).toBe(true)
    expect(logSpy).toHaveBeenCalledWith("Compte super admin créé pour new.admin@example.org")
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining(PASSWORD))
  })

  it("does nothing on the next start: the account exists", async () => {
    const { prisma, tx } = fakeDb()

    await bootstrapSuperAdmin(ENV, prisma)
    await bootstrapSuperAdmin(ENV, prisma)

    expect(tx.adminUser.create).toHaveBeenCalledOnce()
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it("leaves an existing account with that address untouched", async () => {
    const existing: AdminUserRow = {
      id: "u1",
      email: "new.admin@example.org",
      name: "Compte existant",
      role: "admin",
      organizationId: "org-1",
      isActive: false,
      passwordHash: "existing-hash",
    }
    const { prisma, tx, rows } = fakeDb([existing])

    await bootstrapSuperAdmin(ENV, prisma)

    expect(tx.adminUser.create).not.toHaveBeenCalled()
    expect(rows[0]).toEqual(existing)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("déjà"))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("sans compte existant"))
  })

  it("creates nothing when ADMIN_PASSWORD breaks the rules", async () => {
    const { prisma, tx } = fakeDb()

    await bootstrapSuperAdmin({ ...ENV, ADMIN_PASSWORD: "weak" }, prisma)

    expect(tx.adminUser.create).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("10 caractères minimum"))
  })

  it("does not touch the database on the hosted service or with no configuration", async () => {
    const hosted = fakeDb()
    await bootstrapSuperAdmin({ ...ENV, HOSTED_SERVICE: "true" }, hosted.prisma)
    expect(hosted.transaction).not.toHaveBeenCalled()

    const unconfigured = fakeDb()
    await bootstrapSuperAdmin({ HOSTED_SERVICE: "false" }, unconfigured.prisma)
    expect(unconfigured.transaction).not.toHaveBeenCalled()
  })

  it("warns about the missing variable and creates nothing", async () => {
    const { prisma, transaction } = fakeDb()

    await bootstrapSuperAdmin({ HOSTED_SERVICE: "false", ADMIN_EMAIL: "admin@example.org" }, prisma)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ADMIN_PASSWORD"))
    expect(transaction).not.toHaveBeenCalled()
  })

  it("never throws on an unexpected failure: logs in French and reports it", async () => {
    const { prisma, transaction } = fakeDb()
    transaction.mockRejectedValueOnce(new Error("base injoignable"))

    await expect(bootstrapSuperAdmin(ENV, prisma)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("super admin"), expect.stringContaining("base injoignable"))
    expect(reported).toHaveBeenCalledWith("admin.bootstrap", expect.any(Error))
  })
})
