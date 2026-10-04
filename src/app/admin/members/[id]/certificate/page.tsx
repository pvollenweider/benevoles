// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { loadVolunteerHourData } from "@/lib/volunteer-certificate-data"
import { defaultPeriod, volunteerHourEntries } from "@/lib/volunteer-hours"
import { orgTimeZone } from "@/lib/time-zone"
import CertificateView from "@/components/admin/CertificateView"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await getOrgContext()
  if (!ctx) return { title: "Attestation de bénévolat" }
  const { id } = await params
  const m = await ctx.db.volunteer.findFirst({ where: { id }, select: { firstName: true, lastName: true } })
  return { title: m ? `Attestation de ${m.firstName} ${m.lastName}` : "Attestation de bénévolat" }
}

/**
 * The volunteer certificate (#556): an owner or organizer only (`getOrgContext()` — a sector
 * leader or a volunteer never holds this kind of session, see src/lib/auth-guard.ts). Org-scoped
 * through `ctx.db`: a member of another organization is `notFound()`, exactly like the member
 * activity page it is linked from.
 */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const data = await loadVolunteerHourData(ctx.db, id)
  if (!data) notFound()

  const org = await ctx.db.organization.findUnique({ where: { id: ctx.organizationId }, select: { name: true, timeZone: true } })
  const timeZone = orgTimeZone(org)
  const now = new Date()
  const entries = volunteerHourEntries(data.registrations, timeZone)
  const period = defaultPeriod(now, timeZone)
  const generatedAt = now.toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="max-w-3xl mx-auto space-y-4 print:max-w-none">
      <div className="print:hidden">
        <Link href={`/admin/members/${id}`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <span aria-hidden="true">← </span>Retour à l&apos;activité de {data.member.firstName} {data.member.lastName}
        </Link>
      </div>
      <CertificateView
        memberId={id}
        memberName={`${data.member.firstName} ${data.member.lastName}`}
        organizationName={org?.name ?? ""}
        entries={entries}
        defaultPeriod={period}
        generatedAt={generatedAt}
      />
    </div>
  )
}
