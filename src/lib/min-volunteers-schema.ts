// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { minVolunteersShapeProblem } from "./staffing"

/**
 * A shift's minimum (#949) as the routes receive it: a whole number from 1 to SHIFT_PLACES_MAX,
 * null to remove it, absent to leave it. Whether it fits the places is judged by each route
 * (`minVolunteersProblem`), which knows the places the shift will have.
 */
export const minVolunteersSchema = z.number().nullable().optional().superRefine((min, ctx) => {
  const problem = minVolunteersShapeProblem(min)
  if (problem) ctx.addIssue({ code: "custom", message: problem })
})
