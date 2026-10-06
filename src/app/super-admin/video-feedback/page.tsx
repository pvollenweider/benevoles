// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { RETENTION_DAYS } from "@/lib/retention"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { summarizeFeedback } from "@/lib/video-feedback"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Avis sur les vidéos" }

/**
 * Super-admin view of the « Cette vidéo vous a-t-elle été utile ? » answers (#646): Oui / Non /
 * total per video and revision, internal only (no public score). A regenerated video (new
 * revision in videos/catalog.json) gets its own row starting at zero; the older revision's row
 * stays visible while it has answers, never merged into the new one.
 */
export default async function VideoFeedbackPage() {
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
      // Focusable region so a keyboard user can scroll the table sideways on a narrow screen.
      <div tabIndex={0} role="region" aria-label="Réponses par vidéo" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <table className="w-full text-sm">
          <caption className="sr-only">Réponses par vidéo et par révision</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Vidéo</th>
              <th scope="col" className="px-4 py-2 font-medium">Révision</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Oui</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Non</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={`${r.videoId}#${r.revision}`}>
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  {r.title ? (
                    <Link href={`/videos/${r.videoId}`} className="text-blue-600 underline hover:text-blue-700">{r.title}</Link>
                  ) : (
                    <span className="text-gray-900">Vidéo retirée du catalogue</span>
                  )}
                  <span className="block text-xs text-gray-600 font-mono break-all">{r.videoId}</span>
                </th>
                <td className="px-4 py-2 text-gray-800 whitespace-nowrap">
                  {r.revision}
                  <span className="block text-xs text-gray-600">{r.current ? "actuelle" : "ancienne"}</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-900">{r.yes}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-900">{r.no}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
