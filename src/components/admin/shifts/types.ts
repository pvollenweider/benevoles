// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { AdminShift } from "../AdminDayTimeline"

/** A shift as the admin shifts page holds it (Prisma shift converted to AdminShift, plus the form-only fields). */
export type RawShift = AdminShift & {
  description?: string | null; internalNotes?: string | null; locationDetails?: string | null
  contactName?: string | null; contactPhone?: string | null; instructions?: string | null
  latitude?: number | null; longitude?: number | null
  /** Shifts per volunteer for the role (#466), shared by the role's shifts. */
  maxPerVolunteer?: number | null
  /** Tags reserving the role (#470), shared by the role's shifts. */
  reservedTags?: string[]
}
