// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { MEMBER_TAG_MAX, MEMBER_TAGS_MAX, tooLongMessage } from "./text-limits"

/** A string capped at `max` characters, with a French message naming the field (text-limits.ts). */
export function cappedText(max: number, label: string) {
  return z.string().max(max, { message: tooLongMessage(label, max) })
}

/** A member's tags: how many, and how long each (text-limits.ts). */
export const memberTagsSchema = z.array(z.string().max(MEMBER_TAG_MAX)).max(MEMBER_TAGS_MAX)
