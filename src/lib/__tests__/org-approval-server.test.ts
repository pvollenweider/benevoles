// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import { COLETTE, ELODIE, SAMI, adminsMatching, teamOf } from "@/__tests__/helpers/front-desk-accounts"
import { AUTOMATIC_APPROVAL_LABEL } from "../org-approval"
import { ORG_ACCOUNT_ROLE_WHERE } from "../permissions"
import {
  APPROVAL_GRANT_WHERE,
  approvalRefusalReason,
  approveOrganization,
  type ApprovalActor,
} from "../org-approval-server"

const enqueue = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: enqueue }))

const ORG_ID = "org-fete-du-village"
const NOW = new Date("2026-11-17T10:00:00Z")

type OrgRow = {
  id: string
  name: string
  slug: string
  active: boolean
  suspendedAt: Date | null
  publicationApprovedAt: Date | null
  outboundEmailApprovedAt: Date | null
}

const pendingOrg = (): OrgRow => ({
  id: ORG_ID,
  name: "Fête du village",
  slug: "fete-du-village",
  active: true,
  suspendedAt: null,
  publicationApprovedAt: null,
  outboundEmailApprovedAt: null,
})

/**
 * The transaction slice `approveOrganization` uses, over one organisation row. `updateManyAndReturn`
 * applies the real four conditions, so a second call on the same row behaves like the database.
 */
function fakeTx(org: OrgRow | null, team = teamOf(ORG_ID)) {
  const row = org ? { ...org } : null
  const queries: string[] = []
  const updateArgs: { where: Record<string, unknown>; data: Record<string, unknown> }[] = []
  const orgLogs: Record<string, unknown>[] = []
  const operatorLogs: Record<string, unknown>[] = []
  const adminQueries: Record<string, unknown>[] = []
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join("?"))
      return row ? [{ id: row.id }] : []
    }),
    organization: {
      updateManyAndReturn: vi.fn(async (args: { where: Record<string, unknown>; data: { publicationApprovedAt: Date; outboundEmailApprovedAt: Date } }) => {
        updateArgs.push(args)
        if (!row) return []
        const matches = row.active === true
          && row.suspendedAt === null
          && row.publicationApprovedAt === null
          && row.outboundEmailApprovedAt === null
        if (!matches) return []
        row.publicationApprovedAt = args.data.publicationApprovedAt
        row.outboundEmailApprovedAt = args.data.outboundEmailApprovedAt
        return [{ id: row.id, name: row.name, slug: row.slug }]
      }),
      findUnique: vi.fn(async () => row && {
        active: row.active,
        suspendedAt: row.suspendedAt,
        publicationApprovedAt: row.publicationApprovedAt,
        outboundEmailApprovedAt: row.outboundEmailApprovedAt,
      }),
    },
    orgLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { orgLogs.push(data) }) },
    operatorLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { operatorLogs.push(data) }) },
    adminUser: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        adminQueries.push(args as unknown as Record<string, unknown>)
        return adminsMatching(args.where, team).map(({ email, name }) => ({ email, name }))
      }),
    },
  }
  return { tx, row, queries, updateArgs, orgLogs, operatorLogs, adminQueries }
}

type FakeTx = ReturnType<typeof fakeTx>
const asTx = (t: FakeTx) => t.tx as unknown as Parameters<typeof approveOrganization>[0]

const run = (t: FakeTx, actor: ApprovalActor = { type: "operator", id: "sa-1", label: "Opérateur" }) =>
  approveOrganization(asTx(t), { organizationId: ORG_ID, actor, now: NOW })

beforeEach(() => {
  vi.clearAllMocks()
  enqueue.mockResolvedValue(["outbox-1"])
})

describe("approveOrganization: a manual approval (#1371)", () => {
  it("writes one conditional grant, both logs and the administrator emails", async () => {
    const t = fakeTx(pendingOrg())
    const result = await run(t)

    expect(result).toEqual({ approved: true, outboxIds: ["outbox-1"] })
    // The organisation row is locked first, before the conditional grant.
    expect(t.queries[0]).toMatch(/FOR UPDATE/)
    expect(t.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(t.tx.organization.updateManyAndReturn.mock.invocationCallOrder[0])

    expect(t.updateArgs[0].where).toEqual({ id: ORG_ID, ...APPROVAL_GRANT_WHERE })
    expect(t.updateArgs[0].where).toMatchObject({
      active: true,
      suspendedAt: null,
      publicationApprovedAt: null,
      outboundEmailApprovedAt: null,
    })
    expect(t.updateArgs[0].data).toEqual({ publicationApprovedAt: NOW, outboundEmailApprovedAt: NOW })

    expect(t.orgLogs[0]).toMatchObject({
      organizationId: ORG_ID,
      actorType: "admin",
      actorId: "sa-1",
      action: "organization.approved",
      entityType: "Organization",
      entityId: ORG_ID,
      changes: { source: { from: null, to: "operator" } },
    })
    expect(t.operatorLogs[0]).toMatchObject({
      action: "organization.approved",
      actorId: "sa-1",
      actorLabel: "Opérateur",
      source: "operator",
      target: "Fête du village (fete-du-village)",
      detail: null,
    })
  })

  it("emails the administrators only, with the same recipients and dedupe keys, never the front desk", async () => {
    const t = fakeTx(pendingOrg())
    await run(t)

    expect(t.adminQueries[0]).toEqual({
      where: { organizationId: ORG_ID, ...ORG_ACCOUNT_ROLE_WHERE },
      select: { email: true, name: true },
    })
    const [payloads, tx] = enqueue.mock.calls[0] as [Record<string, unknown>[], unknown]
    expect(tx).toBe(t.tx)
    expect(payloads.map((p) => (p.recipient as { email: string }).email)).toEqual([ELODIE.email, SAMI.email])
    expect(payloads.map((p) => (p.recipient as { email: string }).email)).not.toContain(COLETTE.email)
    expect(payloads[0]).toEqual({
      kind: "space_approved",
      organizationId: ORG_ID,
      recipient: { email: ELODIE.email, name: ELODIE.name },
      dedupeKey: `space_approved:${ORG_ID}:${ELODIE.email}`,
      data: { adminName: ELODIE.name, organizationName: "Fête du village", adminUrl: "http://localhost:3000/admin/events" },
    })
    expect(payloads[1]).toMatchObject({ dedupeKey: `space_approved:${ORG_ID}:${SAMI.email}`, recipient: { email: SAMI.email, name: SAMI.name } })
  })
})

describe("approveOrganization: an automatic approval (#1371)", () => {
  it("shares the grants and emails, with no acting account and the automatic source", async () => {
    const t = fakeTx(pendingOrg())
    const result = await run(t, { type: "automatic" })

    expect(result).toEqual({ approved: true, outboxIds: ["outbox-1"] })
    expect(t.updateArgs[0].data).toEqual({ publicationApprovedAt: NOW, outboundEmailApprovedAt: NOW })
    expect(t.orgLogs[0]).toMatchObject({
      organizationId: ORG_ID,
      actorType: "system",
      actorId: null,
      action: "organization.approved",
      changes: { source: { from: null, to: "automatic" } },
    })
    expect(t.operatorLogs[0]).toMatchObject({
      action: "organization.approved",
      actorId: null,
      actorLabel: AUTOMATIC_APPROVAL_LABEL,
      source: "automatic",
      target: "Fête du village (fete-du-village)",
    })
    expect(AUTOMATIC_APPROVAL_LABEL).toBe("Validation automatique")
    expect(enqueue).toHaveBeenCalledTimes(1)
  })
})

describe("approveOrganization: nothing else is written when the grant matches no row", () => {
  const cases: { name: string; org: OrgRow | null; reason: string }[] = [
    { name: "not_found", org: null, reason: "not_found" },
    { name: "already_approved", org: { ...pendingOrg(), publicationApprovedAt: NOW, outboundEmailApprovedAt: NOW }, reason: "already_approved" },
    { name: "one grant already given", org: { ...pendingOrg(), outboundEmailApprovedAt: NOW }, reason: "already_approved" },
    { name: "inactive", org: { ...pendingOrg(), active: false }, reason: "inactive" },
    { name: "suspended", org: { ...pendingOrg(), active: false, suspendedAt: NOW }, reason: "suspended" },
  ]

  for (const c of cases) {
    it(c.name, async () => {
      const t = fakeTx(c.org)
      expect(await run(t)).toEqual({ approved: false, reason: c.reason })
      expect(t.updateArgs).toHaveLength(1)
      expect(t.orgLogs).toHaveLength(0)
      expect(t.operatorLogs).toHaveLength(0)
      expect(enqueue).not.toHaveBeenCalled()
    })
  }

  it("tells the reasons from the single row read after the failed write", () => {
    expect(approvalRefusalReason(null)).toBe("not_found")
    expect(approvalRefusalReason({ active: false, suspendedAt: NOW, publicationApprovedAt: null, outboundEmailApprovedAt: null })).toBe("suspended")
    expect(approvalRefusalReason({ active: false, suspendedAt: null, publicationApprovedAt: null, outboundEmailApprovedAt: null })).toBe("inactive")
    expect(approvalRefusalReason({ active: true, suspendedAt: null, publicationApprovedAt: NOW, outboundEmailApprovedAt: NOW })).toBe("already_approved")
  })
})

describe("approveOrganization: a second call and a concurrent decision", () => {
  it("a second call on the same space is already_approved and sends no second email", async () => {
    const t = fakeTx(pendingOrg())
    expect(await run(t)).toMatchObject({ approved: true })
    expect(await run(t)).toEqual({ approved: false, reason: "already_approved" })

    expect(t.updateArgs).toHaveLength(2)
    expect(t.orgLogs).toHaveLength(1)
    expect(t.operatorLogs).toHaveLength(1)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it("a space deleted by a refusal that ran first is not approved", async () => {
    // The refusal transaction deleted the organisation: its row is gone when the approval locks.
    const t = fakeTx(null)
    expect(await run(t)).toEqual({ approved: false, reason: "not_found" })
    expect(t.orgLogs).toHaveLength(0)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("a suspended space is never approved, whichever transaction ran first", async () => {
    const t = fakeTx({ ...pendingOrg(), active: false, suspendedAt: NOW })
    expect(await run(t)).toEqual({ approved: false, reason: "suspended" })
    expect(t.row?.publicationApprovedAt).toBeNull()
    expect(t.orgLogs).toHaveLength(0)
    expect(enqueue).not.toHaveBeenCalled()
  })
})
