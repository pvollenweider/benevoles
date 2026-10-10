// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
// eslint-disable-next-line no-restricted-imports -- public page before any session: the link is looked up across organisations
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { keepLinkValid } from "@/lib/org-keep"
import KeepConfirm from "@/components/admin/KeepConfirm"
import InvalidKeepLink from "@/components/admin/InvalidKeepLink"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Conserver mon organisation", robots: { index: false } }

/**
 * The link of « Conserver mon organisation » (#811). Opening it changes nothing (mail scanners
 * open links): the page names the space, and its button records the answer.
 */
export default async function KeepPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token
  const secret = typeof raw === "string" ? raw : ""
  const link = secret.length >= 32
    ? await prisma.orgKeepLink.findUnique({
      where: { tokenHash: hashToken(secret) },
      select: { expiresAt: true, organization: { select: { name: true, active: true, suspendedAt: true } } },
    })
    : null
  const organizationName = link && keepLinkValid(link, new Date()) ? link.organization.name : null

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Conserver mon organisation</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {organizationName ? <KeepConfirm secret={secret} organizationName={organizationName} /> : <InvalidKeepLink />}
        </div>
      </div>
    </main>
  )
}
