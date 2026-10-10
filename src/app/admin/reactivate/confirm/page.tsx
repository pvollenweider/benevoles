// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
// eslint-disable-next-line no-restricted-imports -- public page before any session: the link is looked up across organisations
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { reactivationLinkValid } from "@/lib/org-reactivation"
import InvalidReactivationLink from "@/components/admin/InvalidReactivationLink"
import ReactivateConfirm from "@/components/admin/ReactivateConfirm"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Réactiver mon espace", robots: { index: false } }

/**
 * The link of « Réactiver mon espace » (#811). Opening it changes nothing (mail scanners open
 * links): the page names the space, and its button does the reactivation.
 */
export default async function ReactivateConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token
  const secret = typeof raw === "string" ? raw : ""
  const admin = secret.length >= 32
    ? await prisma.adminUser.findUnique({
      where: { orgReactivationTokenHash: hashToken(secret) },
      select: {
        isActive: true, orgReactivationExpiresAt: true,
        organization: { select: { name: true, active: true, suspendedAt: true, inactivityDeactivatedAt: true } },
      },
    })
    : null
  const organizationName = admin && reactivationLinkValid(admin, new Date()) ? admin.organization!.name : null

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Réactiver mon espace</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {organizationName ? (
            <ReactivateConfirm secret={secret} organizationName={organizationName} />
          ) : (
            <InvalidReactivationLink />
          )}
        </div>
      </div>
    </main>
  )
}
