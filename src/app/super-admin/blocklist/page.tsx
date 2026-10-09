// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import BlocklistManager from "@/components/super-admin/BlocklistManager"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Liste de blocage" }

/** Block list of the self-service sign-up (#810, part 5). */
export default async function BlocklistPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")
  const blocks = await prisma.signupBlock.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, label: true, reason: true, expiresAt: true, createdAt: true },
  })
  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Liste de blocage</h1>
        <p className="text-sm text-gray-700 mt-1">
          Les inscriptions en libre-service venant d&apos;une adresse, d&apos;un domaine ou d&apos;une adresse IP bloqués reçoivent la même réponse que les autres, sans que rien soit enregistré. Une adresse IP n&apos;est jamais conservée en clair et son blocage expire toujours.
        </p>
      </div>
      <BlocklistManager initialBlocks={blocks.map((b) => ({ ...b, expiresAt: b.expiresAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString() }))} />
    </div>
  )
}
