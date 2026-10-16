// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The admin API's schema of a custom question (#483). Apart from event-questions.ts so that zod
 * stays out of the public sign-up page's JavaScript (#773).
 */
import { z } from "zod"
import { NUMBER_ANSWER_MAX, QUESTION_TYPES } from "./event-questions"

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
    /** Bounds of a number question (#1015), whole numbers 0 or more; ignored for the other types. */
    minValue: z.number({ error: "Le minimum doit être un nombre entier." }).int("Le minimum doit être un nombre entier.").min(0, "Le minimum ne peut pas être négatif.").max(NUMBER_ANSWER_MAX, `Le minimum ne peut pas dépasser ${NUMBER_ANSWER_MAX}.`).nullable().optional(),
    maxValue: z.number({ error: "Le maximum doit être un nombre entier." }).int("Le maximum doit être un nombre entier.").min(0, "Le maximum ne peut pas être négatif.").max(NUMBER_ANSWER_MAX, `Le maximum ne peut pas dépasser ${NUMBER_ANSWER_MAX}.`).nullable().optional(),
    /** Poste the question concerns (#984, part 3); "" or null for none, absent to keep it on an edit. */
    roleName: z.string().trim().max(100).nullable().optional(),
  })
  .transform((q) => ({
    ...q,
    options: q.type === "single" || q.type === "multiple" ? firstSpellings(q.options) : [],
    // The minimum is stored, 0 when left out; a maximum left out means none.
    minValue: q.type === "number" ? (q.minValue ?? 0) : null,
    maxValue: q.type === "number" ? (q.maxValue ?? null) : null,
    ...(q.roleName !== undefined ? { roleName: q.roleName || null } : {}),
  }))
  .refine((q) => !(q.type === "single" || q.type === "multiple") || q.options.length >= 2, { message: "Donnez au moins deux choix.", path: ["options"] })
  .refine((q) => q.maxValue === null || q.minValue === null || q.minValue <= q.maxValue, { message: "Le maximum doit être au moins égal au minimum.", path: ["maxValue"] })
export type QuestionInput = z.infer<typeof questionSchema>
