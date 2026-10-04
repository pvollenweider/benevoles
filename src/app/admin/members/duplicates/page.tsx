// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { hasLevel } from "@/lib/permissions"
import { loadDuplicatePairs } from "@/lib/member-duplicates-data"
import MemberDuplicatesManager from "@/components/admin/MemberDuplicatesManager"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Doublons possibles" }

/**
 * « Doublons possibles » (#601): organizer level, like the rest of the members area — only the
 * merge link each pair offers is owner-only (member-merge.ts, #600). `?member=<id>` (from the
 * members list's « Doublon ? » action, #599) prefilters to that member's own pairs.
 */
export default async function MemberDuplicatesPage({ searchParams }: { searchParams: Promise<{ member?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { member } = await searchParams
  const requestedMemberId = (Array.isArray(member) ? member[0] : member) || undefined

  // Validated server-side (org-scoped `db`) rather than trusted from the URL: an unknown or
  // cross-org id is treated the same as no `?member=` at all. Its name is only for the empty-state
  // message and the organizer's search link below, in case this member has no suggested pair left.
  let prefilterMember: { id: string; firstName: string; lastName: string } | undefined
  if (requestedMemberId) {
    const m = await ctx.db.volunteer.findFirst({ where: { id: requestedMemberId }, select: { id: true, firstName: true, lastName: true } })
    if (m) prefilterMember = m
  }

  const pairs = await loadDuplicatePairs(ctx.db, ctx.organizationId)
  const isOwner = hasLevel(ctx.session.user?.role, "owner")

  return (
    <MemberDuplicatesManager
      initialPairs={pairs}
      isOwner={isOwner}
      prefilterMemberId={prefilterMember?.id}
      prefilterMemberName={prefilterMember ? `${prefilterMember.firstName} ${prefilterMember.lastName}` : undefined}
    />
  )
}
