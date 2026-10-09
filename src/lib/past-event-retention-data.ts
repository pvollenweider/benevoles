// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { pastEventCutoff, type PastEventObservation } from "@/lib/past-event-retention"

/**
 * What the 3-year rule of #813 would anonymise today, per organisation: read only (observation
 * mode). Server only: Prisma and raw SQL; the rule itself is in src/lib/past-event-retention.ts.
 */
export async function observePastEvents(now: Date = new Date()): Promise<PastEventObservation[]> {
  const cutoff = pastEventCutoff(now)
  type Row = { organizationId: string; organizationName: string; events: bigint; registrations: bigint; members: bigint; membersOnlyOld: bigint; answers: bigint; invites: bigint; sectorLeaders: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    WITH old AS (
      SELECT e."id", e."organizationId" FROM "Event" e WHERE e."endDate" < ${cutoff}
    ),
    regs AS (
      SELECT old."organizationId", r."id", r."volunteerId"
      FROM "Registration" r JOIN old ON old."id" = r."eventId"
    ),
    only_old AS (
      SELECT DISTINCT regs."organizationId", regs."volunteerId" FROM regs
      WHERE NOT EXISTS (
        SELECT 1 FROM "Registration" r2 JOIN "Event" e2 ON e2."id" = r2."eventId"
        WHERE r2."volunteerId" = regs."volunteerId" AND e2."endDate" >= ${cutoff}
      )
    )
    SELECT o."id" AS "organizationId", o."name" AS "organizationName",
      (SELECT COUNT(*) FROM old WHERE old."organizationId" = o."id") AS "events",
      (SELECT COUNT(*) FROM regs WHERE regs."organizationId" = o."id") AS "registrations",
      (SELECT COUNT(DISTINCT regs."volunteerId") FROM regs WHERE regs."organizationId" = o."id") AS "members",
      (SELECT COUNT(*) FROM only_old WHERE only_old."organizationId" = o."id") AS "membersOnlyOld",
      (SELECT COUNT(*) FROM "QuestionAnswer" a JOIN old ON old."id" = a."eventId" WHERE old."organizationId" = o."id") AS "answers",
      (SELECT COUNT(*) FROM "MemberInvite" i JOIN old ON old."id" = i."eventId" WHERE old."organizationId" = o."id") AS "invites",
      (SELECT COUNT(*) FROM "SectorLeader" s JOIN old ON old."id" = s."eventId" WHERE old."organizationId" = o."id") AS "sectorLeaders"
    FROM "Organization" o
    WHERE EXISTS (SELECT 1 FROM old WHERE old."organizationId" = o."id")
    ORDER BY o."name"
  `
  return rows.map((r) => ({
    organizationId: r.organizationId,
    organizationName: r.organizationName,
    events: Number(r.events),
    registrations: Number(r.registrations),
    members: Number(r.members),
    membersOnlyOld: Number(r.membersOnlyOld),
    answers: Number(r.answers),
    invites: Number(r.invites),
    sectorLeaders: Number(r.sectorLeaders),
  }))
}
