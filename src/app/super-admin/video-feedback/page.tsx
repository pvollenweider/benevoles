// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { RETENTION_DAYS } from "@/lib/retention"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { summarizeFeedback } from "@/lib/video-feedback"
import { VIDEO_SORT_COLS } from "@/lib/super-admin-tables"
import { parseSortParam } from "@/lib/table-sort"
import VideoFeedbackTable from "@/components/super-admin/VideoFeedbackTable"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Avis sur les vidéos" }

/**
 * Super-admin view of the « Cette vidéo vous a-t-elle été utile ? » answers (#646): Oui / Non /
 * total per video and revision, internal only (no public score). A regenerated video (new
 * revision in videos/catalog.json) gets its own row starting at zero; the older revision's row
 * stays visible while it has answers, never merged into the new one.
 */
export default async function VideoFeedbackPage({ searchParams }: { searchParams: Promise<{ tri?: string | string[] }> }) {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const grouped = await prisma.videoFeedback.groupBy({
    by: ["videoId", "revision", "useful"],
    _count: { _all: true },
  })
  const rows = summarizeFeedback(
    grouped.map((g) => ({ videoId: g.videoId, revision: g.revision, useful: g.useful, count: g._count._all })),
    loadVideoCatalog(),
  )
  const { tri } = await searchParams
  const totalAnswers = rows.reduce((sum, r) => sum + r.total, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Avis sur les vidéos</h1>
        <p className="text-sm text-gray-700 mt-1">
          Réponses à « Cette vidéo vous a-t-elle été utile ? » sous chaque vidéo tutorielle, par vidéo et par révision. Une vidéo régénérée (nouvelle révision) repart de zéro. Les réponses sont anonymes et gardées {RETENTION_DAYS.videoFeedback} jours.
        </p>
        <p className="text-sm text-gray-700 mt-1">{totalAnswers === 0 ? "Aucune réponse pour l'instant." : `${totalAnswers} réponse${totalAnswers > 1 ? "s" : ""} en tout.`}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune vidéo dans le catalogue.</p>
      ) : (
      <VideoFeedbackTable rows={rows} initialSort={parseSortParam(tri, VIDEO_SORT_COLS)} />
      )}
    </div>
  )
}
