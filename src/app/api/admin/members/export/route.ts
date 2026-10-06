// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { exportFileName, membersCsv } from "@/lib/data-export"
import { orgTimeZone } from "@/lib/time-zone"
import { kindLabel, OUTCOME_LABEL_FR, REASON_LABEL_FR } from "@/lib/outbox-view"
import type { SmtpOutcome, SmtpReason } from "@/lib/notifications/smtp-outcome"
// Reads the Organization row for its name and time zone, not a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"

/** Every member of the organization as CSV (#384), inactive ones included. */
export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const [org, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, timeZone: true } }),
    db.volunteer.findMany({
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, tags: true, active: true, notes: true, birthDate: true,
        availabilityPeriods: true, availabilityNote: true, createdAt: true,
        _count: { select: { registrations: { where: { status: "active" } } } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ])
  // The member's own delivery outcomes (#598): this export is how an access request is answered
  // (guide/exporter-et-conserver-ses-donnees.md), so it carries the member's own data
  // — in French words and a normalized reason, never the raw SMTP reply or the address.
  const outcomes = await prisma.deliveryOutcome.findMany({
    where: { organizationId, volunteerId: { in: members.map((m) => m.id) } },
    orderBy: { createdAt: "desc" },
    select: { volunteerId: true, kind: true, outcome: true, reason: true, createdAt: true },
  })
  const outcomesByVolunteer = new Map<string, typeof outcomes>()
  for (const o of outcomes) {
    if (!o.volunteerId) continue
    if (!outcomesByVolunteer.has(o.volunteerId)) outcomesByVolunteer.set(o.volunteerId, [])
    outcomesByVolunteer.get(o.volunteerId)!.push(o)
  }
  // Last time each member accepted the volunteer charter (#569), across every registration they
  // have (several possible per person); null for a member whose registrations were all added by
  // an admin by hand. Ordered newest first, so the first row kept per volunteer is the latest.
  const acceptances = await db.registration.findMany({
    where: { volunteerId: { in: members.map((m) => m.id) }, charterAcceptedAt: { not: null } },
    orderBy: { charterAcceptedAt: "desc" },
    select: { volunteerId: true, charterAcceptedAt: true },
  })
  const latestCharterAcceptanceByVolunteer = new Map<string, Date>()
  for (const a of acceptances) {
    if (!latestCharterAcceptanceByVolunteer.has(a.volunteerId) && a.charterAcceptedAt) {
      latestCharterAcceptanceByVolunteer.set(a.volunteerId, a.charterAcceptedAt)
    }
  }
  const now = new Date()
  const csv = membersCsv(members.map(({ _count, id, ...m }) => ({
    ...m,
    registrationCount: _count.registrations,
    deliveryOutcomes: (outcomesByVolunteer.get(id) ?? []).map((o) => ({
      date: o.createdAt,
      kind: kindLabel(o.kind),
      outcome: OUTCOME_LABEL_FR[o.outcome as SmtpOutcome] ?? o.outcome,
      reason: o.reason ? (REASON_LABEL_FR[o.reason as SmtpReason] ?? o.reason) : null,
    })),
    charterAcceptedAt: latestCharterAcceptanceByVolunteer.get(id) ?? null,
  })), orgTimeZone(org))
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(`${org?.name ?? "organisation"}-membres`, now, "csv")}"`,
      "Cache-Control": "no-store",
    },
  })
}
