// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { civilDateSchema } from "./civil-date"
import { cappedText } from "./text-limits-schema"
import { SHOW_NAME_MAX, SHOW_SCHEDULE_MAX, SHOW_TIME_MAX } from "./text-limits"

/** The shows of an event's schedule, as the create and update routes of an event receive them. */
export const showScheduleSchema = z.array(z.object({
  name: cappedText(SHOW_NAME_MAX, "Le nom du spectacle"),
  date: civilDateSchema,
  startTime: z.string().max(SHOW_TIME_MAX),
  endTime: z.string().max(SHOW_TIME_MAX),
})).max(SHOW_SCHEDULE_MAX)
