// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import HelpLink from "@/components/admin/HelpLink"
import ProposalWorkspace from "@/components/admin/ProposalWorkspace"
import { loadProposalPage } from "@/lib/proposal-page-data"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Proposition d'affectations" }

const linkClass = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * « Proposition d'affectations » (#1172, beta « assignmentProposals »): generate a proposed
 * planning written as draft assignments, follow the computation and read its result. Nothing is
 * published here: the drafts page publishes. `?run=` shows an earlier run.
 */
export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const q = await searchParams
  const data = await loadProposalPage(ctx.db, ctx.organizationId, id, first(q.run) ?? null)
  if (!data) notFound()
  const drafts = `/admin/events/${id}/availability/drafts`

  return (
    <div data-admin-wide="" className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Proposition d&apos;affectations</h1>
        <HelpLink route="/admin/events/[id]/availability/proposal" />
        <p className="max-w-[75ch] text-sm text-gray-700 mt-1">
          Choisissez les dates, les postes et les personnes : une répartition est proposée selon les disponibilités, les règles de l&apos;événement et l&apos;objectif d&apos;heures de chacun, puis écrite dans les affectations en brouillon. Rien n&apos;est publié : vous comparez, verrouillez ou corrigez les brouillons, puis vous publiez vous-même.
        </p>
        <p className="text-sm text-gray-700 mt-1"><Link href={drafts} className={linkClass}>Retour aux affectations en brouillon</Link></p>
      </div>
      <ProposalWorkspace key={id} data={data} eventInfoHref={`/admin/events/${id}/edit`} draftsHref={drafts} basePath={`/admin/events/${id}/availability/proposal`} />
    </div>
  )
}
