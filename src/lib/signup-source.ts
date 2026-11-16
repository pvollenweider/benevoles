// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { formatCount } from "@/lib/usage-counters"

/**
 * « Comment avez-vous connu benevol.app ? » (#1094): an optional question of the space request
 * form. Server logs cannot tell word of mouth from a direct visit and the site promises no
 * tracking, so the operator asks. Stored with the request, copied to the organisation it creates,
 * shown only in the super admin space; the statistics count the spaces per answer. Pure,
 * Prisma-free: the form imports it.
 */

export const SIGNUP_SOURCES = [
  { value: "search", label: "Moteur de recherche" },
  { value: "association", label: "Une autre association ou un bénévole" },
  { value: "social", label: "Réseau social" },
  { value: "article", label: "Article ou blog" },
  { value: "event", label: "Salon ou événement" },
  { value: "other", label: "Autre" },
] as const

export type SignupSource = (typeof SIGNUP_SOURCES)[number]["value"]

const SOURCE_VALUES = SIGNUP_SOURCES.map((s) => s.value) as [SignupSource, ...SignupSource[]]

/** The « Autre » precision: a few words, one line. */
export const SIGNUP_SOURCE_DETAIL_MAX = 100
export const SOURCE_DETAIL_LONG_MESSAGE = `La précision est trop longue (${SIGNUP_SOURCE_DETAIL_MAX} caractères au plus).`
export const SOURCE_UNKNOWN_MESSAGE = "Choisissez une des réponses proposées, ou aucune."

/** Typed text kept on one line: control characters and line breaks become spaces, spaces collapse. */
export function cleanSourceDetail(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim()
}

/** The two form fields, both optional: an empty choice is no answer. */
export const signupSourceFields = {
  source: z.union([z.enum(SOURCE_VALUES, { error: SOURCE_UNKNOWN_MESSAGE }), z.literal("")], { error: SOURCE_UNKNOWN_MESSAGE }).nullish(),
  sourceDetail: z.string().transform(cleanSourceDetail).pipe(z.string().max(SIGNUP_SOURCE_DETAIL_MAX, SOURCE_DETAIL_LONG_MESSAGE)).nullish(),
}

/**
 * What is stored: the choice, or null without one; the precision only with « Autre » and when
 * not empty (a precision typed before switching to another choice is dropped).
 */
export function normalizeSignupSource(source: string | null | undefined, detail: string | null | undefined): { source: SignupSource | null; detail: string | null } {
  const known = SOURCE_VALUES.find((v) => v === source) ?? null
  if (known !== "other") return { source: known, detail: null }
  const clean = cleanSourceDetail(detail ?? "").slice(0, SIGNUP_SOURCE_DETAIL_MAX)
  return { source: known, detail: clean || null }
}

/** The answer as the operator reads it: « Réseau social », « Autre : la commune »; null without one. */
export function signupSourceLabel(source: string | null | undefined, detail: string | null | undefined): string | null {
  const entry = SIGNUP_SOURCES.find((s) => s.value === source)
  if (!entry) return null
  return entry.value === "other" && detail ? `${entry.label} : ${detail}` : entry.label
}

/**
 * The per-answer totals of the statistics: one row per choice in the form's order, then « Sans
 * réponse » (no choice, or a value the form no longer offers). Counts only, never the precisions.
 */
export function signupSourceRows(groups: readonly { source: string | null; count: number }[]): { key: string; label: string; value: string }[] {
  const total = (value: string) => groups.filter((g) => g.source === value).reduce((n, g) => n + g.count, 0)
  const answered = SIGNUP_SOURCES.map((s) => ({ key: `source-${s.value}`, label: s.label, count: total(s.value) }))
  const none = groups.reduce((n, g) => n + g.count, 0) - answered.reduce((n, r) => n + r.count, 0)
  return [...answered, { key: "source-none", label: "Sans réponse", count: none }].map((r) => ({ key: r.key, label: r.label, value: formatCount(r.count) }))
}
