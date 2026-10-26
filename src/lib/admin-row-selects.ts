// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"

/**
 * Allow-lists for rows that leave the server (#1009): admin API responses and props given to
 * client components. SectorLeader, Registration and MemberInvite hold the personal link's token
 * as `…Hash`, `…Enc` and `…Legacy` (src/lib/token-vault.ts): server-side secrets that never go
 * to a browser, even an admin's. A new column is therefore hidden until it is added here.
 *
 * Kept free of runtime imports: only a type from the generated client, so a module used by a
 * client component can import these without pulling Prisma in.
 */

export const SECTOR_LEADER_ADMIN_SELECT = {
  id: true,
  eventId: true,
  roleName: true,
  // A sector leader (#1169): roleName is null, sectorId set.
  sectorId: true,
  name: true,
  email: true,
  createdAt: true,
} as const satisfies Prisma.SectorLeaderSelect

/**
 * Every Registration column except the link token (`editToken…`) and `charterAcceptedHash`
 * (the server compares it to the current charter and sends a label instead, see
 * registrations/page.tsx).
 */
export const REGISTRATION_ADMIN_SELECT = {
  id: true,
  eventId: true,
  shiftId: true,
  volunteerId: true,
  status: true,
  source: true,
  comment: true,
  phone: true,
  reminderJ2Sent: true,
  reminderJ1Sent: true,
  reminderDdSent: true,
  waitingPosition: true,
  waitingOfferedAt: true,
  waitingExpiresAt: true,
  checkedInAt: true,
  linkEmailedAt: true,
  charterAcceptedAt: true,
  groupLinkId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.RegistrationSelect
