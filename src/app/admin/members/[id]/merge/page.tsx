// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { hasLevel } from "@/lib/permissions"
import MemberMergeFlow from "@/components/admin/MemberMergeFlow"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await getOrgContext()
  if (!ctx) return { title: "Fusionner un membre" }
  const { id } = await params
  const m = await ctx.db.volunteer.findFirst({ where: { id }, select: { firstName: true, lastName: true } })
  return { title: m ? `Fusionner ${m.firstName} ${m.lastName}` : "Fusionner un membre" }
}

/** Entry point for a member merge (#600): owner only, irreversible. */
export default async function MemberMergePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const member = await ctx.db.volunteer.findFirst({ where: { id }, select: { id: true, firstName: true, lastName: true, email: true } })
  if (!member) notFound()

  if (!hasLevel(ctx.session.user?.role, "owner")) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Link href={`/admin/members/${member.id}`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <span aria-hidden="true">← </span>Retour à la fiche
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Fusion réservée aux propriétaires</h1>
        <p className="text-sm text-gray-700">Demandez à un propriétaire de l&apos;organisation de fusionner ces deux fiches.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href={`/admin/members/${member.id}`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <span aria-hidden="true">← </span>Retour à la fiche
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Fusionner {member.firstName} {member.lastName}</h1>
      <MemberMergeFlow member={member} />
    </div>
  )
}
