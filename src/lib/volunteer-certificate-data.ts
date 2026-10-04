// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Loader for the volunteer certificate (#556): the member and every `active` registration they
 * ever had, through the organisation-scoped client so a member of another organisation is simply
 * not found (see src/lib/prisma-org.ts). Shift status is fetched too (not pre-filtered) so the
 * pure counting rules in volunteer-hours.ts can apply "a cancelled shift never counts" themselves,
 * the same way for every caller.
 */
import type { OrgScopedPrisma } from "./prisma-org"
import type { HourRegistration } from "./volunteer-hours"

export type CertificateMember = { id: string; firstName: string; lastName: string }

export async function loadVolunteerHourData(
  db: OrgScopedPrisma,
  volunteerId: string,
): Promise<{ member: CertificateMember; registrations: HourRegistration[] } | null> {
  const member = await db.volunteer.findFirst({ where: { id: volunteerId }, select: { id: true, firstName: true, lastName: true } })
  if (!member) return null
  const registrations = await db.registration.findMany({
    where: { volunteerId, status: "active" },
    select: {
      id: true,
      status: true,
      checkedInAt: true,
      shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true } },
      event: { select: { id: true, title: true } },
    },
  })
  return { member, registrations }
}
