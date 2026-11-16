// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * #1371 against a real Postgres: the shared approval, the refusal and an owner's account
 * activation, run as real concurrent transactions (`Promise.all`). Two approvals of the same
 * pending space cannot both win; an approval and a refusal cannot both win; an approval and a
 * suspension serialise on the organisation row; an activation and a refusal take their two locks
 * in the same order and cannot deadlock. A half-granted space is approved, as before the branch.
 *
 * The refusal and the activation transactional parts are exported from `src/lib` so this test
 * calls the very functions their routes call, without HTTP.
 */

// The routes deliver after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))
// The suspension route is a super admin route: a session without NextAuth.
vi.mock("@/lib/auth-guard", () => ({
  requireSuperAdmin: async () => ({ db: {}, session: { user: { id: null, name: "Opérateur", email: "operator@example.org", role: "super_admin" } } }),
}))

import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { approveOrganization } from "@/lib/org-approval-server"
import { refuseOrganization } from "@/lib/org-refusal-server"
import { activateAccount } from "@/lib/account-activation-server"
import { PATCH as operatorPatch } from "@/app/api/super-admin/organizations/[id]/route"

const url = process.env.DATABASE_URL
const tag = `int-approval-${Date.now()}`

const approve = (organizationId: string, now = new Date()) =>
  prisma.$transaction((tx) => approveOrganization(tx, {
    organizationId,
    actor: { type: "operator", id: null, label: "Opérateur" },
    now,
  }))

const refuse = (organizationId: string) =>
  prisma.$transaction((tx) => refuseOrganization(tx, {
    organizationId,
    actor: { id: null, name: "Opérateur", email: "operator@example.org" },
  }))

const suspend = (organizationId: string) => operatorPatch(
  new Request(`http://localhost/api/super-admin/organizations/${organizationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suspended: true, suspensionReason: "Enquête en cours" }),
  }),
  { params: Promise.resolve({ id: organizationId }) },
)

type Grants = { publicationApprovedAt?: Date | null; outboundEmailApprovedAt?: Date | null }

describe.skipIf(!url)("approval, refusal, suspension and activation on Postgres (#1371)", () => {
  const orgIds: string[] = []

  afterAll(async () => {
    // The outbox rows first: they are not deleted with the organisation.
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.orgLog.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.operatorLog.deleteMany({ where: { entityId: { in: orgIds } } })
    await prisma.adminUser.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
    await prisma.$disconnect()
  })

  /** A pending space with its administrators (owner then organiser), all active. */
  async function space(suffix: string, opts: { grants?: Grants; admins?: number } = {}) {
    const { grants = {}, admins = 2 } = opts
    const org = await prisma.organization.create({
      data: { name: `Comité ${tag} ${suffix}`, slug: `${tag}-${suffix}`, ...grants },
    })
    orgIds.push(org.id)
    const accounts = []
    for (let i = 0; i < admins; i++) {
      accounts.push(await prisma.adminUser.create({
        data: {
          organizationId: org.id,
          name: `Admin ${suffix} ${i}`,
          email: `${tag}-${suffix}-${i}@example.org`,
          passwordHash: "x",
          role: i === 0 ? "admin" : "organizer",
          isActive: true,
        },
      }))
    }
    return { org, accounts }
  }

  /** A pending space whose only account is an inactive owner holding a valid setup link. */
  async function invitedOwner(suffix: string) {
    const { org } = await space(suffix, { admins: 0 })
    const token = `${tag}-${suffix}-setup-token-000000000000`
    const account = await prisma.adminUser.create({
      data: {
        organizationId: org.id,
        name: `Propriétaire ${suffix}`,
        email: `${tag}-${suffix}-owner@example.org`,
        passwordHash: "x",
        role: "admin",
        isActive: false,
        setupTokenHash: hashToken(token),
        setupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
    return { org, account, token }
  }

  const activate = (org: { name: string; slug: string }, account: { id: string; name: string; email: string; role: string; organizationId: string | null }, token: string) =>
    prisma.$transaction((tx) => activateAccount(tx, {
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        organizationId: account.organizationId,
      },
      organization: { name: org.name, slug: org.slug },
      token,
      passwordHash: "y",
    }))

  it("two approvals of the same pending space at the same time: one approved, one already_approved, one log each, one email per administrator", async () => {
    const { org, accounts } = await space("approve-twice")
    const now = new Date()
    const results = await Promise.all([approve(org.id, now), approve(org.id, now)])

    expect(results.filter((r) => r.approved)).toHaveLength(1)
    expect(results.filter((r) => !r.approved)).toEqual([{ approved: false, reason: "already_approved" }])
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.approved" } })).toBe(1)
    expect(await prisma.operatorLog.count({ where: { entityId: org.id, action: "organization.approved" } })).toBe(1)

    const outbox = await prisma.notificationOutbox.findMany({ where: { organizationId: org.id } })
    expect(outbox).toHaveLength(accounts.length)
    expect(new Set(outbox.map((row) => row.dedupeKey))).toEqual(new Set(accounts.map((a) => `space_approved:${org.id}:${a.email}`)))

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after.publicationApprovedAt).not.toBeNull()
    expect(after.outboundEmailApprovedAt).not.toBeNull()
  })

  it("an approval and a refusal at the same time: never both, and no half-deleted row", async () => {
    const { org, accounts } = await space("approve-refuse")
    const [approval, refusal] = await Promise.all([approve(org.id), refuse(org.id)])

    expect(refusal.refused || approval.approved).toBe(true)
    expect(refusal.refused && approval.approved).toBe(false)

    const after = await prisma.organization.findUnique({ where: { id: org.id } })
    if (approval.approved) {
      // The approval committed first: the refusal re-read it under the locks and answered 409.
      expect(refusal).toMatchObject({ refused: false, status: 409 })
      expect(after).not.toBeNull()
      expect(after!.publicationApprovedAt).not.toBeNull()
      expect(after!.outboundEmailApprovedAt).not.toBeNull()
      expect(await prisma.adminUser.count({ where: { organizationId: org.id } })).toBe(accounts.length)
    } else {
      // The refusal committed first: the organisation and its accounts are gone, never half-deleted.
      expect(approval).toEqual({ approved: false, reason: "not_found" })
      expect(refusal).toMatchObject({ refused: true })
      expect(after).toBeNull()
      expect(await prisma.adminUser.count({ where: { organizationId: org.id } })).toBe(0)
    }
  })

  it("an approval and a suspension at the same time: only the two serial orders", async () => {
    const { org } = await space("approve-suspend")
    const [approval, response] = await Promise.all([approve(org.id), suspend(org.id)])
    expect(response.status).toBe(200)

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after.active).toBe(false)
    expect(after.suspendedAt).not.toBeNull()

    // Allowed outcomes, from the code. Approval locks the organisation FOR UPDATE and suspension
    // FOR NO KEY UPDATE: the two locks conflict, so the two writes serialise and there is no third,
    // interleaved state.
    //  - Suspension first: the approval's grant requires suspendedAt = null, so it fails with
    //    `suspended`; no approval log and no email is written.
    //  - Approval first: it commits both grants and its email, then the suspension applies on top;
    //    the final row is suspended WITH both grants (a deliberate suspension after the approval).
    if (approval.approved) {
      expect(after.publicationApprovedAt).not.toBeNull()
      expect(after.outboundEmailApprovedAt).not.toBeNull()
    } else {
      expect(approval).toEqual({ approved: false, reason: "suspended" })
      expect(after.publicationApprovedAt).toBeNull()
      expect(after.outboundEmailApprovedAt).toBeNull()
      expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.approved" } })).toBe(0)
    }
  })

  it("an owner's activation while the space is refused: no deadlock, one of the two wins cleanly", async () => {
    const { org, account, token } = await invitedOwner("activate-refuse")
    const [refusal, outboxIds] = await Promise.all([refuse(org.id), activate(org, account, token)])

    // Both lock the administrator row(s) first, then the organisation: one waits for the other,
    // PostgreSQL aborts neither, and the refusal always ends up deleting this still-pending space.
    expect(refusal).toMatchObject({ refused: true })
    if (outboxIds === null) {
      // The refusal took the administrator row first: the activation's update matched no row.
      expect(await prisma.adminUser.count({ where: { organizationId: org.id } })).toBe(0)
    } else {
      // The activation committed first; the refusal then deleted the space it had not approved.
      expect(outboxIds).toHaveLength(1)
    }
    expect(await prisma.organization.findUnique({ where: { id: org.id } })).toBeNull()
    expect(await prisma.adminUser.count({ where: { organizationId: org.id } })).toBe(0)
  })

  it("a half-granted space is approved, as before the branch: both timestamps, one log each, the emails", async () => {
    const old = new Date("2026-01-01T00:00:00Z")
    const cases: { suffix: string; grants: Grants }[] = [
      { suffix: "half-publication", grants: { publicationApprovedAt: old } },
      { suffix: "half-outbound", grants: { outboundEmailApprovedAt: old } },
    ]

    for (const c of cases) {
      const { org, accounts } = await space(c.suffix, { grants: c.grants })
      const now = new Date()
      expect(await approve(org.id, now)).toMatchObject({ approved: true })

      // The route wrote both timestamps before #1371, the already-granted one included.
      const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
      expect(after.publicationApprovedAt?.getTime()).toBe(now.getTime())
      expect(after.outboundEmailApprovedAt?.getTime()).toBe(now.getTime())
      expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.approved" } })).toBe(1)
      expect(await prisma.operatorLog.count({ where: { entityId: org.id, action: "organization.approved" } })).toBe(1)
      expect(await prisma.notificationOutbox.count({ where: { organizationId: org.id } })).toBe(accounts.length)
    }
  })
})
