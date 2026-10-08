// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The admin API's schema of a custom question (#483). Apart from event-questions.ts so that zod
 * stays out of the public sign-up page's JavaScript (#773).
 */
import { z } from "zod"
import { QUESTION_TYPES } from "./event-questions"

/** Options without case-insensitive duplicates, the first spelling kept. */
function firstSpellings(options: string[]): string[] {
  const seen = new Set<string>()
  return options.filter((o) => {
    const k = o.toLocaleLowerCase("fr")
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export const questionSchema = z
  .object({
    label: z.string().trim().min(1, "La question est obligatoire.").max(120),
    type: z.enum(QUESTION_TYPES),
    options: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
    required: z.boolean().default(false),
  })
  .transform((q) => ({ ...q, options: q.type === "single" || q.type === "multiple" ? firstSpellings(q.options) : [] }))
  .refine((q) => !(q.type === "single" || q.type === "multiple") || q.options.length >= 2, { message: "Donnez au moins deux choix.", path: ["options"] })
export type QuestionInput = z.infer<typeof questionSchema>
