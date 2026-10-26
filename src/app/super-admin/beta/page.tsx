// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import BetaCapabilitiesForm from "@/components/super-admin/BetaCapabilitiesForm"
import { readOpenBetaCapabilities } from "@/lib/beta-access"
import { BETA_CAPABILITIES, BETA_CAPABILITY_IDS } from "@/lib/beta-capabilities"
import { APP_TIME_ZONE } from "@/lib/time-zone"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Fonctions bêta" }

/** Beta access (#1168), operator level: what is open for trial, and which organisations take part. */
export default async function BetaPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")
  const [open, orgs] = await Promise.all([
    readOpenBetaCapabilities(),
    prisma.organization.findMany({
      where: { betaOptInAt: { not: null } },
      orderBy: { betaOptInAt: "asc" },
      select: { id: true, name: true, slug: true, betaOptInAt: true },
    }),
  ])
  const capabilities = BETA_CAPABILITY_IDS.map((id) => ({ id, ...BETA_CAPABILITIES[id] }))
  const since = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Fonctions bêta</h1>
        <p className="text-sm text-gray-700 mt-1">
          Ouvrir une fonction avancée à l&apos;essai. Seules les organisations dont un propriétaire a choisi d&apos;essayer les fonctions bêta, dans leurs paramètres, peuvent l&apos;adopter, événement par événement. Chaque changement est inscrit au journal de l&apos;opérateur.
        </p>
      </div>
      <BetaCapabilitiesForm capabilities={capabilities} initialOpen={open} />
      <section aria-labelledby="beta-orgs-title" className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 id="beta-orgs-title" className="text-base font-semibold text-gray-900">Organisations participantes</h2>
        {orgs.length === 0 ? (
          <p className="text-sm text-gray-700">Aucune organisation ne participe à la bêta.</p>
        ) : (
          <ul className="text-sm text-gray-800 space-y-1">
            {orgs.map((o) => (
              <li key={o.id}>{o.name} ({o.slug}){o.betaOptInAt ? `, depuis le ${since(o.betaOptInAt)}` : ""}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
