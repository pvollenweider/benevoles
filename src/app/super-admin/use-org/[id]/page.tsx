// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { resolveSuperAdminOrg } from "@/lib/auth-guard"
import { orgSwitchAction, safeAdminNext } from "@/lib/admin-next"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Changer d'organisation", robots: { index: false } }

/**
 * Where a super admin lands from an email link to an event of another organization than the one
 * picked (#1048). Opening it changes nothing (mail scanners open links, and a page of another
 * address must not switch it): it names the organization, and its button posts the switch.
 */
export default async function UseOrgPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ next?: string | string[] }> }) {
  const session = await auth()
  if (session?.user?.role !== "super_admin") redirect("/admin/login")

  const { id } = await params
  const rawNext = (await searchParams).next
  const next = safeAdminNext(typeof rawNext === "string" ? rawNext : null)

  const [org, currentId] = await Promise.all([
    prisma.organization.findUnique({ where: { id }, select: { id: true, name: true } }),
    resolveSuperAdminOrg(),
  ])
  if (!org) notFound()
  const current = currentId ? await prisma.organization.findUnique({ where: { id: currentId }, select: { name: true } }) : null

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Changer d&apos;organisation</h1>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <p className="text-sm text-gray-800 break-words">
          La page demandée appartient à l&apos;organisation <strong>{org.name}</strong>.{" "}
          {current ? <>Vous travaillez actuellement dans <strong>{current.name}</strong>.</> : <>Vous n&apos;avez pas encore choisi d&apos;organisation.</>}
        </p>
        <form method="post" action={orgSwitchAction(org.id)} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-xl font-medium border border-transparent hover:bg-blue-700 transition-colors break-words text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Travailler dans {org.name}
          </button>
          <Link
            href="/super-admin/organizations"
            className="text-sm border border-blue-600 text-blue-600 px-4 py-2 rounded-xl font-medium hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Retour aux organisations
          </Link>
        </form>
      </div>
    </div>
  )
}
