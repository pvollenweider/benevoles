// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import type { Audience } from "@/lib/video-catalog"

/**
 * « Cette vidéo vous a-t-elle été utile ? » (#646): pure helpers shared by the detail page's
 * VideoFeedback component, the public POST route (/api/public/video-feedback) and the super-admin
 * view (/super-admin/video-feedback). No Prisma and no `fs` import: the component is bundled for
 * the browser (see the top comment of src/lib/video-catalog.ts).
 *
 * Privacy: an answer is anonymous. What is stored is the video id, its catalogue revision, the
 * language, Oui/Non, the reading context and the day; never an IP, a cookie, a session or an
 * organization. Abuse is limited per IP in memory only (the route), and one answer per video and
 * revision per browser through localStorage (best effort, `feedbackStorageKey`).
 */

/** Where the video was opened from: the video library, or a link in the documentation (#645). */
export const FEEDBACK_CONTEXTS = ["masterclass", "documentation"] as const
export type FeedbackContext = (typeof FEEDBACK_CONTEXTS)[number]

/**
 * Query parameter a documentation link adds to /videos/[id] so the answer is counted under
 * « documentation » (#645): `/videos/EVENT_CREATE_BLANK?from=doc`. Any other value, or none, is
 * the video library (« masterclass »).
 */
export const FROM_DOC_PARAM = "from"
export const FROM_DOC_VALUE = "doc"

export function feedbackContextFrom(from: string | string[] | undefined | null): FeedbackContext {
  const value = Array.isArray(from) ? from[0] : from
  return value === FROM_DOC_VALUE ? "documentation" : "masterclass"
}

export const feedbackBodySchema = z.object({
  videoId: z.string().regex(/^[A-Z][A-Z0-9_]+$/).max(100),
  revision: z.number().int().min(1).max(100_000),
  useful: z.boolean(),
  context: z.enum(FEEDBACK_CONTEXTS),
})
export type FeedbackBody = z.infer<typeof feedbackBodySchema>

/** Primary language subtag of the manifest's language: "fr-CH" → "fr". */
export function feedbackLanguage(manifestLanguage: string): string {
  return manifestLanguage.split("-")[0].trim().toLowerCase() || "fr"
}

/** The UTC day of `now` at midnight: only the day is stored, never the time. */
export function feedbackDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Checks a posted answer against the loaded catalogue: the id must exist and the revision must be
 * the current one (a page left open across a regeneration posts the old revision, which no longer
 * describes the video being served).
 */
export function checkFeedbackTarget(
  body: Pick<FeedbackBody, "videoId" | "revision">,
  catalog: { id: string; revision: number }[],
): "ok" | "unknown-video" | "stale-revision" {
  const video = catalog.find((v) => v.id === body.videoId)
  if (!video) return "unknown-video"
  if (video.revision !== body.revision) return "stale-revision"
  return "ok"
}

/** localStorage key remembering this browser already answered this video at this revision. */
export function feedbackStorageKey(videoId: string, revision: number): string {
  return `video-feedback:${videoId}:${revision}`
}

/** Rate limit of the public route, per IP, in this process's memory only. */
export const FEEDBACK_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 }

// --- wording ---------------------------------------------------------------------------------

export type FeedbackWording = {
  question: string
  thanks: string
  alreadyAnswered: string
  error: string
  stale: string
  tooMany: string
}

/**
 * « tu » for a volunteer-only video, « vous » otherwise (organizer, super-admin or mixed
 * audiences), as in the rest of the product (PRODUCT.md, « Brand Personality »).
 */
export function feedbackWording(audience: readonly Audience[]): FeedbackWording {
  const tu = audience.length > 0 && audience.every((a) => a === "benevole")
  return tu
    ? {
        question: "Cette vidéo t'a-t-elle été utile ?",
        thanks: "Merci pour ta réponse.",
        alreadyAnswered: "Tu as déjà répondu pour cette vidéo. Merci.",
        error: "Ta réponse n'a pas pu être enregistrée. Réessaie dans un moment.",
        stale: "Cette vidéo a été mise à jour. Recharge la page pour répondre.",
        tooMany: "Trop de réponses envoyées depuis cette connexion. Réessaie plus tard.",
      }
    : {
        question: "Cette vidéo vous a-t-elle été utile ?",
        thanks: "Merci pour votre réponse.",
        alreadyAnswered: "Vous avez déjà répondu pour cette vidéo. Merci.",
        error: "Votre réponse n'a pas pu être enregistrée. Réessayez dans un moment.",
        stale: "Cette vidéo a été mise à jour. Rechargez la page pour répondre.",
        tooMany: "Trop de réponses envoyées depuis cette connexion. Réessayez plus tard.",
      }
}

// --- super-admin aggregation -----------------------------------------------------------------

/** One `groupBy(videoId, revision, useful)` row. */
export type FeedbackCountRow = { videoId: string; revision: number; useful: boolean; count: number }

export type FeedbackSummaryRow = {
  videoId: string
  title: string | null
  revision: number
  current: boolean
  yes: number
  no: number
  total: number
}

/**
 * Oui / Non / total per video and revision, in catalogue order, newest revision first. Every
 * catalogued video appears at its current revision, even with no answer yet (so the videos nobody
 * answered for are visible); an older revision appears only if it has answers, and is never added
 * to the current one: a regenerated video starts fresh. Answers for an id no longer in the
 * catalogue come last, untitled.
 */
export function summarizeFeedback(
  rows: FeedbackCountRow[],
  catalog: { id: string; title: string; revision: number }[],
): FeedbackSummaryRow[] {
  const byKey = new Map<string, { yes: number; no: number }>()
  for (const r of rows) {
    const key = `${r.videoId}#${r.revision}`
    const entry = byKey.get(key) ?? { yes: 0, no: 0 }
    if (r.useful) entry.yes += r.count
    else entry.no += r.count
    byKey.set(key, entry)
  }

  const out: FeedbackSummaryRow[] = []
  const row = (videoId: string, title: string | null, revision: number, current: boolean): FeedbackSummaryRow => {
    const c = byKey.get(`${videoId}#${revision}`) ?? { yes: 0, no: 0 }
    return { videoId, title, revision, current, yes: c.yes, no: c.no, total: c.yes + c.no }
  }
  const revisionsOf = (videoId: string) =>
    [...new Set(rows.filter((r) => r.videoId === videoId).map((r) => r.revision))].sort((a, b) => b - a)

  const catalogued = new Set<string>()
  for (const video of catalog) {
    catalogued.add(video.id)
    out.push(row(video.id, video.title, video.revision, true))
    for (const revision of revisionsOf(video.id)) {
      if (revision !== video.revision) out.push(row(video.id, video.title, revision, false))
    }
  }
  const orphans = [...new Set(rows.map((r) => r.videoId))].filter((id) => !catalogued.has(id)).sort()
  for (const id of orphans) {
    for (const revision of revisionsOf(id)) out.push(row(id, null, revision, false))
  }
  return out
}
