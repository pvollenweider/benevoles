// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { loadMemberActivity } from "@/lib/member-activity-data"
import { activitySummary, memberTimeline } from "@/lib/member-activity"
import { orgTimeZone } from "@/lib/time-zone"
import { loadAddressStatuses } from "@/lib/delivery-outcomes-data"
import { addressHash } from "@/lib/notifications/smtp-outcome"
import { addressStatusSentence } from "@/lib/address-status"
import { env } from "@/lib/env"

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
  const fmtDay = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long", year: "numeric" })
  const { member } = data

  // Whether the member's current address needs checking (#599), same rule as the members list.
  const statuses = await loadAddressStatuses(ctx.organizationId, [
    { id: member.id, addressHash: member.email ? addressHash(member.email, env.AUTH_SECRET) : null },
  ])
  const status = statuses.get(member.id) ?? { kind: "ok" as const }
  const statusSentence = addressStatusSentence(status, fmtDay)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/members" className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <span aria-hidden="true">← </span>Membres
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Activité de {member.firstName} {member.lastName}</h1>
        <p className="text-sm text-gray-700 mt-1">{member.email ?? "Sans email"}{member.active ? "" : " · fiche désactivée"}</p>
        <p className="text-sm text-gray-700 mt-2">{activitySummary(data.sources)}</p>
        {statusSentence && (
          // Not role="status": this block is part of the page's own initial content, read in
          // document order like the rest — role="status" is for a region whose content changes
          // after the page has already loaded, which this never does.
          <div
            className={`mt-3 rounded-xl border px-4 py-3 text-sm forced-colors:border-[CanvasText] ${
              status.kind === "to_verify" ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-gray-50 border-gray-300 text-gray-800"
            }`}
          >
            <p className="font-medium"><span aria-hidden="true">⚠ </span>{statusSentence}</p>
            {status.kind === "to_verify" && (
              <p className="mt-2 space-x-3">
                <Link href={`/admin/members?edit=${member.id}`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  Modifier l&apos;adresse<span className="sr-only"> de {member.firstName} {member.lastName}</span>
                </Link>
                <Link href={`/admin/members?q=${encodeURIComponent(`${member.firstName} ${member.lastName}`)}`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  Chercher un doublon<span className="sr-only"> pour {member.firstName} {member.lastName}</span>
                </Link>
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-gray-600 mt-2">
          Les faits enregistrés par l&apos;application (invitations, inscriptions, présences, responsabilités, modifications de la fiche), sans appréciation. Les notes internes sont sur la fiche du membre. Ces données disparaissent avec les événements et la fiche.
        </p>
        <p className="mt-3 space-x-4">
          <Link href={`/admin/members/${member.id}/certificate`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Attestation de bénévolat
          </Link>
          <Link href={`/admin/members/${member.id}/merge`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Fusionner avec un autre membre<span className="sr-only"> (doublon confirmé)</span>
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
