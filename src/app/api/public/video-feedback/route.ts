// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getClientIp, memoryStore, rateLimit } from "@/lib/rate-limit"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { checkFeedbackTarget, feedbackDay, feedbackLanguage, FEEDBACK_RATE_LIMIT } from "@/lib/video-feedback"
import { feedbackBodySchema } from "@/lib/video-feedback-schema"

/**
 * « Cette vidéo vous a-t-elle été utile ? » (#646). Public and unauthenticated: the video library
 * has no session. Stores one anonymous row (video id, revision, language, Oui/Non, context, day),
 * never the IP, a cookie or anything about the person.
 *
 * Abuse: the shared rate limiter, but with a store in this process's memory (`memoryStore`), not
 * the Postgres `RateLimit` table, so the client's IP is never written to the database for this
 * route. Per replica and reset on restart: enough to slow a script down, and the answers are an
 * internal signal, not a public score.
 */
const ipWindows = memoryStore()

export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "video-feedback", FEEDBACK_RATE_LIMIT.limit, FEEDBACK_RATE_LIMIT.windowMs, ipWindows)
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de réponses." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } })
  }

  const parsed = feedbackBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 })
  const body = parsed.data

  const catalog = loadVideoCatalog()
  const target = checkFeedbackTarget(body, catalog)
  if (target === "unknown-video") return NextResponse.json({ error: "Vidéo inconnue." }, { status: 404 })
  if (target === "stale-revision") return NextResponse.json({ error: "Cette vidéo a été mise à jour." }, { status: 409 })
  const video = catalog.find((v) => v.id === body.videoId)!

  await prisma.videoFeedback.create({
    data: {
      videoId: body.videoId,
      revision: body.revision,
      language: feedbackLanguage(video.manifest.language),
      useful: body.useful,
      context: body.context,
      answeredOn: feedbackDay(new Date()),
    },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
