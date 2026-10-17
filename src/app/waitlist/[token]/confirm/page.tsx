// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { orgTimeZone } from "@/lib/time-zone"
import { offerDeadline } from "@/lib/waitlist-copy"
import { dayLabel, spokenTimeRange } from "@/lib/spoken-time"
import { WAITLIST_OFFER_PAGE_TITLES, waitlistOfferPageState } from "@/lib/waitlist-offer"
import WaitlistOfferConfirm, { type WaitlistOfferDetails } from "@/components/public/WaitlistOfferConfirm"

export const dynamic = "force-dynamic"

/** One read per request, shared by generateMetadata and the page. Read-only (#1044). */
const loadOffer = cache(async (token: string) => {
  const reg = token
    ? await prisma.registration.findFirst({
        where: registrationToken.where(token),
        select: {
          status: true,
          waitingExpiresAt: true,
          shift: { select: { label: true, date: true, startTime: true, endTime: true, requiresApproval: true } },
          event: { select: { title: true, organization: { select: { timeZone: true } } } },
        },
      })
    : null
  const state = waitlistOfferPageState(reg, new Date())
  const details: WaitlistOfferDetails | null = reg && state === "offered"
    ? {
        eventTitle: reg.event.title,
        shiftLabel: reg.shift.label,
        // Shift dates are calendar days at midnight UTC.
        day: dayLabel(reg.shift.date.toISOString().slice(0, 10)),
        time: spokenTimeRange(reg.shift.startTime, reg.shift.endTime),
        deadline: offerDeadline(reg.waitingExpiresAt, orgTimeZone(reg.event.organization)),
        requiresApproval: reg.shift.requiresApproval,
      }
    : null
  return { state, details }
})

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const { state } = await loadOffer(token)
  return { title: WAITLIST_OFFER_PAGE_TITLES[state], robots: { index: false, follow: false } }
}

/**
 * Where the waitlist offer email's link lands. Opening it changes nothing (#1044): mail scanners
 * open links, some run the page's scripts. The « Prendre la place » button accepts the offer
 * (POST /api/public/waitlist/[token]/confirm).
 */
export default async function WaitlistConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { state, details } = await loadOffer(token)
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
        <WaitlistOfferConfirm token={token} state={state} details={details} />
      </div>
    </main>
  )
}
