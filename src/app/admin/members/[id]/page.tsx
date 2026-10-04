// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { loadMemberActivity } from "@/lib/member-activity-data"
import { activitySummary, memberTimeline } from "@/lib/member-activity"
import { orgTimeZone } from "@/lib/time-zone"

export const dynamic = "force-dynamic"
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await getOrgContext()
  if (!ctx) return { title: "Activité d'un membre" }
  const { id } = await params
  const m = await ctx.db.volunteer.findFirst({ where: { id }, select: { firstName: true, lastName: true } })
  return { title: m ? `Activité de ${m.firstName} ${m.lastName}` : "Activité d'un membre" }
}

/** A member's factual chronology (#488): no score, only what happened, with the event. */
export default async function MemberActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const data = await loadMemberActivity(ctx.db, id)
  if (!data) notFound()
  const org = await ctx.db.organization.findUnique({ where: { id: ctx.organizationId }, select: { timeZone: true } })
  const timeZone = orgTimeZone(org)
  const facts = memberTimeline(data.sources)
  const when = (d: Date) => d.toLocaleString("fr-FR", { timeZone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  const { member } = data

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/members" className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <span aria-hidden="true">← </span>Membres
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Activité de {member.firstName} {member.lastName}</h1>
        <p className="text-sm text-gray-700 mt-1">{member.email ?? "Sans email"}{member.active ? "" : " · fiche désactivée"}</p>
        <p className="text-sm text-gray-700 mt-2">{activitySummary(data.sources)}</p>
        <p className="text-xs text-gray-600 mt-2">
          Les faits enregistrés par l&apos;application (invitations, inscriptions, présences, responsabilités, modifications de la fiche), sans appréciation. Les notes internes sont sur la fiche du membre. Ces données disparaissent avec les événements et la fiche.
        </p>
        <p className="mt-3">
          <Link href={`/admin/members/${member.id}/certificate`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Attestation de bénévolat
          </Link>
        </p>
      </div>
      <h2 id="chronologie" className="sr-only">Chronologie</h2>
      {facts.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune activité enregistrée pour ce membre.</p>
      ) : (
        <ol role="list" aria-labelledby="chronologie" className="space-y-2">
          {facts.map((f, i) => (
            <li key={`${f.kind}-${f.at.getTime()}-${i}`} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-sm text-gray-900">{f.text}</p>
              <p className="text-xs text-gray-700 mt-0.5">
                <time dateTime={f.at.toISOString()}>{when(f.at)}</time>
                {f.eventId && (
                  <>
                    {" · "}
                    <Link href={`/admin/events/${f.eventId}`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{f.eventTitle}</Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
