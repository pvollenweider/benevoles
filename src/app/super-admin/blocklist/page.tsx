// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import BlocklistManager from "@/components/super-admin/BlocklistManager"
import SignupSwitch from "@/components/super-admin/SignupSwitch"
import { readSignupSwitch } from "@/lib/signup-switch"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Inscriptions et blocage" }

/** The self-service sign-up's controls (#810): the « Inscriptions fermées » switch and the block list. */
export default async function BlocklistPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")
  const signupState = await readSignupSwitch()
  const blocks = await prisma.signupBlock.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, label: true, reason: true, expiresAt: true, createdAt: true },
  })
  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Inscriptions et blocage</h1>
        <p className="text-sm text-gray-700 mt-1">
          Fermer d&apos;un coup les inscriptions en libre-service, ou bloquer une adresse, un domaine ou une adresse IP. Une inscription bloquée reçoit la même réponse que les autres, sans que rien soit enregistré. Une adresse IP n&apos;est jamais conservée en clair et son blocage expire toujours.
        </p>
      </div>
      <SignupSwitch initial={signupState} />
      <BlocklistManager initialBlocks={blocks.map((b) => ({ ...b, expiresAt: b.expiresAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString() }))} />
    </div>
  )
}
