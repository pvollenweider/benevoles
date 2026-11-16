// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"

/**
 * #1371 against a real Postgres: the scheduled automatic validation. A space created by the
 * self-service sign-up is validated once its owner has been active for five minutes; a space
 * created before the option was turned on, or whose owner activated two minutes ago, waits. Two
 * runs at the same time validate a space once and consume one unit of budget. With one unit left
 * and two eligible spaces, exactly one is validated, the option is cut off, and the other waits.
 *
 * The step is exported from `src/lib/auto-approval-server.ts` so this test calls the very function
 * the outbox route calls, without HTTP. A pending space is always created with both grants
 * explicitly null: the database would fill them otherwise.
 */

// The routes deliver after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))
// No push or operator email from this test: the alert has its own tests.
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: vi.fn(async () => {}) }))

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { runAutoApproval } from "@/lib/auto-approval-server"
import { AUTO_APPROVAL_DAILY_CEILING, AUTO_APPROVAL_SETTING_KEY, autoApprovalBudgetDay } from "@/lib/auto-approval"

const url = process.env.DATABASE_URL
const tag = `int-auto-approval-${Date.now()}`
const startedAt = new Date()

type Grants = { publicationApprovedAt?: Date | null; outboundEmailApprovedAt?: Date | null }

describe.skipIf(!url)("automatic validation of new spaces on Postgres (#1371)", () => {
  const orgIds: string[] = []
  let previousSetting: { value: unknown; updatedById: string | null } | null = null
  let previousHostedService: string | undefined

  beforeAll(async () => {
    if (!url) return
    previousHostedService = process.env.HOSTED_SERVICE
    process.env.HOSTED_SERVICE = "true"
    const row = await prisma.platformSetting.findUnique({ where: { key: AUTO_APPROVAL_SETTING_KEY } })
    previousSetting = row ? { value: row.value, updatedById: row.updatedById } : null
  })

  afterAll(async () => {
    if (!url) return
    // The outbox rows first: they are not deleted with the organisation.
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.orgLog.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.operatorLog.deleteMany({ where: { OR: [{ entityId: { in: orgIds } }, { entityId: AUTO_APPROVAL_SETTING_KEY, createdAt: { gte: startedAt } }] } })
    await prisma.adminUser.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })

    // Put the setting row back exactly as it was.
    if (previousSetting) {
      await prisma.platformSetting.upsert({
        where: { key: AUTO_APPROVAL_SETTING_KEY },
        create: { key: AUTO_APPROVAL_SETTING_KEY, value: previousSetting.value as Prisma.InputJsonValue, updatedById: previousSetting.updatedById },
        update: { value: previousSetting.value as Prisma.InputJsonValue, updatedById: previousSetting.updatedById },
      })
    } else {
      await prisma.platformSetting.deleteMany({ where: { key: AUTO_APPROVAL_SETTING_KEY } })
    }
    if (previousHostedService === undefined) delete process.env.HOSTED_SERVICE
    else process.env.HOSTED_SERVICE = previousHostedService
    await prisma.$disconnect()
  })

  /** The option on, with the given session and daily budget. */
  async function enable(opts: { activatedAt: Date; budgetUsed?: number; until?: string; budgetDate?: string }) {
    await prisma.platformSetting.upsert({
      where: { key: AUTO_APPROVAL_SETTING_KEY },
      create: {
        key: AUTO_APPROVAL_SETTING_KEY,
        value: {
          until: opts.until ?? autoApprovalBudgetDay(new Date(opts.activatedAt.getTime() + 5 * 24 * 60 * 60 * 1000)),
          activatedAt: opts.activatedAt.toISOString(),
          activatedById: "sa-int",
          activatedByLabel: "Opérateur d'intégration",
          budgetDate: opts.budgetDate ?? autoApprovalBudgetDay(new Date()),
          budgetUsed: opts.budgetUsed ?? 0,
          totalSinceActivation: 0,
          cutOffAt: null,
          cutOffSeenAt: null,
          expiredAt: null,
          cutOffAlertedAt: null,
        },
      },
      update: {
        value: {
          until: opts.until ?? autoApprovalBudgetDay(new Date(opts.activatedAt.getTime() + 5 * 24 * 60 * 60 * 1000)),
          activatedAt: opts.activatedAt.toISOString(),
          activatedById: "sa-int",
          activatedByLabel: "Opérateur d'intégration",
          budgetDate: opts.budgetDate ?? autoApprovalBudgetDay(new Date()),
          budgetUsed: opts.budgetUsed ?? 0,
          totalSinceActivation: 0,
          cutOffAt: null,
          cutOffSeenAt: null,
          expiredAt: null,
          cutOffAlertedAt: null,
        },
      },
    })
  }

  /**
   * A pending self-service space and its owner account. Both grants are explicitly null: left out,
   * the database would grant them (only the sign-up confirmation leaves them empty).
   */
  async function space(suffix: string, opts: {
    createdAt: Date
    ownerActivatedAt: Date | null
    ownerActive?: boolean
    grants?: Grants
  }) {
    const PENDING: Grants = { publicationApprovedAt: null, outboundEmailApprovedAt: null }
    const org = await prisma.organization.create({
      data: {
        name: `Comité ${tag} ${suffix}`,
        slug: `${tag}-${suffix}`,
        createdAt: opts.createdAt,
        signupAt: opts.createdAt,
        ...PENDING,
        ...opts.grants,
      },
    })
    orgIds.push(org.id)
    const owner = await prisma.adminUser.create({
      data: {
        organizationId: org.id,
        name: `Sacha Bonvin ${suffix}`,
        email: `${tag}-${suffix}@example.org`,
        passwordHash: "x",
        role: "admin",
        isActive: opts.ownerActive ?? true,
        activatedAt: opts.ownerActivatedAt,
        createdAt: opts.createdAt,
      },
    })
    return { org, owner }
  }

  it("validates an eligible space, queues its « espace activé » email and sets the mark", async () => {
    const now = new Date()
    const activatedAt = new Date(now.getTime() - 60 * 60 * 1000)
    await enable({ activatedAt })
    const { org, owner } = await space("eligible", {
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      ownerActivatedAt: new Date(now.getTime() - 10 * 60 * 1000),
    })

    const counts = await runAutoApproval({ now })
    expect(counts.approved).toBe(1)

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after.publicationApprovedAt).not.toBeNull()
    expect(after.outboundEmailApprovedAt).not.toBeNull()
    expect(after.autoApprovedAt?.getTime()).toBe(now.getTime())
    expect(after.autoApprovalReviewedAt).toBeNull()

    const outbox = await prisma.notificationOutbox.findMany({ where: { organizationId: org.id } })
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ kind: "space_approved", dedupeKey: `space_approved:${org.id}:${owner.email}` })

    const setting = await prisma.platformSetting.findUniqueOrThrow({ where: { key: AUTO_APPROVAL_SETTING_KEY } })
    expect(setting.value).toMatchObject({ budgetUsed: 1, totalSinceActivation: 1 })
  })

  it("does not validate a space whose owner activated two minutes ago", async () => {
    const now = new Date()
    await enable({ activatedAt: new Date(now.getTime() - 60 * 60 * 1000) })
    const { org } = await space("two-minutes", {
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      ownerActivatedAt: new Date(now.getTime() - 2 * 60 * 1000),
    })

    expect((await runAutoApproval({ now })).approved).toBe(0)
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after.publicationApprovedAt).toBeNull()
    expect(after.outboundEmailApprovedAt).toBeNull()
    expect(after.autoApprovedAt).toBeNull()
    expect(await prisma.notificationOutbox.count({ where: { organizationId: org.id } })).toBe(0)
  })

  it("does not validate a space created before the option was turned on", async () => {
    const now = new Date()
    await enable({ activatedAt: new Date(now.getTime() - 10 * 60 * 1000) })
    const { org } = await space("before-activation", {
      createdAt: new Date(now.getTime() - 20 * 60 * 1000),
      ownerActivatedAt: new Date(now.getTime() - 15 * 60 * 1000),
    })

    expect((await runAutoApproval({ now })).approved).toBe(0)
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after.publicationApprovedAt).toBeNull()
    expect(after.outboundEmailApprovedAt).toBeNull()
  })

  it("two runs at the same time validate a space once and consume one unit of budget", async () => {
    const now = new Date()
    await enable({ activatedAt: new Date(now.getTime() - 60 * 60 * 1000) })
    const { org } = await space("concurrent", {
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      ownerActivatedAt: new Date(now.getTime() - 10 * 60 * 1000),
    })

    const [a, b] = await Promise.all([runAutoApproval({ now }), runAutoApproval({ now })])
    expect(a.approved + b.approved).toBe(1)

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after.publicationApprovedAt).not.toBeNull()
    expect(after.outboundEmailApprovedAt).not.toBeNull()
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.approved" } })).toBe(1)
    expect(await prisma.notificationOutbox.count({ where: { organizationId: org.id } })).toBe(1)

    const setting = await prisma.platformSetting.findUniqueOrThrow({ where: { key: AUTO_APPROVAL_SETTING_KEY } })
    expect(setting.value).toMatchObject({ budgetUsed: 1, totalSinceActivation: 1 })
  })

  it("with one unit left and two eligible spaces: one validation, the option cut off, the other pending", async () => {
    const now = new Date()
    const activatedAt = new Date(now.getTime() - 60 * 60 * 1000)
    await enable({ activatedAt, budgetUsed: AUTO_APPROVAL_DAILY_CEILING - 1 })
    const first = await space("budget-a", {
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      ownerActivatedAt: new Date(now.getTime() - 10 * 60 * 1000),
    })
    const second = await space("budget-b", {
      createdAt: new Date(now.getTime() - 20 * 60 * 1000),
      ownerActivatedAt: new Date(now.getTime() - 9 * 60 * 1000),
    })

    const counts = await runAutoApproval({ now })
    expect(counts.approved).toBe(1)
    expect(counts.cutOff).toBe(1)

    const rows = await prisma.organization.findMany({
      where: { id: { in: [first.org.id, second.org.id] } },
      select: { id: true, publicationApprovedAt: true, outboundEmailApprovedAt: true },
    })
    const approved = rows.filter((r) => r.publicationApprovedAt !== null || r.outboundEmailApprovedAt !== null)
    expect(approved).toHaveLength(1)
    const pending = rows.find((r) => r.id !== approved[0].id)!
    expect(pending.publicationApprovedAt).toBeNull()
    expect(pending.outboundEmailApprovedAt).toBeNull()

    const setting = await prisma.platformSetting.findUniqueOrThrow({ where: { key: AUTO_APPROVAL_SETTING_KEY } })
    expect(setting.value).toMatchObject({
      budgetUsed: AUTO_APPROVAL_DAILY_CEILING,
      cutOffAt: expect.any(String),
    })
    expect(await prisma.operatorLog.count({
      where: { action: "auto_approval.cut_off", entityId: AUTO_APPROVAL_SETTING_KEY, createdAt: { gte: startedAt } },
    })).toBe(1)
  })
})
