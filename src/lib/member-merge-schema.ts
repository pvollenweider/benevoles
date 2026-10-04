// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { MERGEABLE_FIELDS, type MergeableField } from "./member-merge"

const fieldChoice = z.enum(["keep", "absorb"])
const MERGEABLE_FIELD_SET = new Set<string>(MERGEABLE_FIELDS)

/**
 * A partial map of mergeable field names to a choice — `z.record(z.enum(...), …)` builds an
 * *exhaustive* record in this zod version (every enum key required), which a partial choices
 * object is never going to satisfy, so this validates keys with `.refine` instead.
 */
const fieldChoiceMap = z
  .record(z.string(), fieldChoice)
  .refine((obj) => Object.keys(obj).every((k) => MERGEABLE_FIELD_SET.has(k)), "Champ de fusion inconnu")
  .transform((obj) => obj as Partial<Record<MergeableField, "keep" | "absorb">>)

/** Request body shared by the preview and the merge endpoints (#600). */
export const mergeRequestSchema = z.object({
  otherId: z.string().min(1),
  choices: z
    .object({
      fields: fieldChoiceMap.optional(),
      notesMode: z.enum(["keep", "absorb", "concatenate"]).optional(),
      registrationConflicts: z.record(z.string(), fieldChoice).optional(),
      answerConflicts: z.record(z.string(), fieldChoice).optional(),
      inviteConflicts: z.record(z.string(), fieldChoice).optional(),
      sendLinksToKeptAddress: z.boolean().optional(),
    })
    .optional()
    .default({}),
})

export type MergeRequestBody = z.infer<typeof mergeRequestSchema>
