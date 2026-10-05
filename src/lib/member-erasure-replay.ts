// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Replays the erasure register (#516) on a restored database: every member erased since the
 * backup was taken comes back with their personal data, and is erased again here. Used by
 * scripts/erasure-register.ts (operator) and the integration test. Server-only.
 */

import type { prisma as Prisma } from "./prisma"
import { getOrgClient } from "./prisma-org"
import { SYSTEM_ACTOR } from "./event-log"
import { erasureEmailHash, registerLine, replayDecision, type ErasureRegisterLine } from "./member-erasure-register"
import { runMemberErasure } from "./member-erasure-transaction"

type Db = typeof Prisma

export interface ReplayReport {
  erased: number
  wouldErase: number
  alreadyErased: number
  notFound: number
  /** One sentence per line of the register, no personal data (ids only). */
  log: string[]
}

/** The whole register, oldest first, in the export format. */
export async function exportErasureRegister(db: Db): Promise<string[]> {
  const rows = await db.erasureRecord.findMany({ orderBy: { erasedAt: "asc" } })
  return rows.map((r) => registerLine(r))
}

/** Dry run unless `apply`. `secret` is the app's AUTH_SECRET (address hashes). */
export async function replayErasureRegister(db: Db, lines: ErasureRegisterLine[], opts: { apply: boolean; secret: string }): Promise<ReplayReport> {
  const report: ReplayReport = { erased: 0, wouldErase: 0, alreadyErased: 0, notFound: 0, log: [] }
  for (const line of lines) {
    const org = await db.organization.findUnique({ where: { id: line.organizationId }, select: { id: true } })
    if (!org) {
      report.notFound++
      report.log.push(`${line.volunteerId}: organization not in this database, skipped.`)
      continue
    }
    const byId = await db.volunteer.findFirst({ where: { id: line.volunteerId, organizationId: org.id }, select: { id: true, erasedAt: true } })
    let candidates: { id: string; createdAt: Date; erasedAt: Date | null; emailHash: string | null }[] = []
    if (!byId && line.emailHash) {
      const rows = await db.volunteer.findMany({ where: { organizationId: org.id, email: { not: null }, erasedAt: null }, select: { id: true, email: true, createdAt: true, erasedAt: true } })
      candidates = rows.map((r) => ({ id: r.id, createdAt: r.createdAt, erasedAt: r.erasedAt, emailHash: erasureEmailHash(org.id, r.email!, opts.secret) }))
    }
    for (const decision of replayDecision(line, byId, candidates)) {
      if (decision.kind === "not_found") {
        report.notFound++
        report.log.push(`${line.volunteerId}: no matching record (already deleted, or created after the erasure), nothing to do.`)
        continue
      }
      if (decision.kind === "already_erased") {
        report.alreadyErased++
        // Re-creates the register row if the restored database lacks it; writes nothing else.
        if (opts.apply) await runMemberErasure(getOrgClient(org.id), org.id, SYSTEM_ACTOR, decision.volunteerId)
        report.log.push(`${decision.volunteerId}: already erased.`)
        continue
      }
      const how = decision.matchedBy === "id" ? "id" : "address hash"
      if (!opts.apply) {
        report.wouldErase++
        report.log.push(`${decision.volunteerId}: would erase (matched by ${how}).`)
        continue
      }
      await runMemberErasure(getOrgClient(org.id), org.id, SYSTEM_ACTOR, decision.volunteerId)
      report.erased++
      report.log.push(`${decision.volunteerId}: erased (matched by ${how}).`)
    }
  }
  return report
}
