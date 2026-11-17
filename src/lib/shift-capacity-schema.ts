// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { shiftCapacityProblem } from "./staffing"

/**
 * A shift's places as the routes receive them: a whole number from 1 to SHIFT_PLACES_MAX, the same
 * bound as the minimum (min-volunteers-schema.ts). A larger number would not fit the database.
 */
export const shiftCapacitySchema = z.number().superRefine((capacity, ctx) => {
  const problem = shiftCapacityProblem(capacity)
  if (problem) ctx.addIssue({ code: "custom", message: problem })
})
