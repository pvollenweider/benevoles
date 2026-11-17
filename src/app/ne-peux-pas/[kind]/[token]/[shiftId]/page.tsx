// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { cache } from "react"
import { contactEmail, siteName } from "@/lib/site"
import { isTokenShaped } from "@/lib/token-path"
import { loadShiftDeclineTarget, type ShiftDeclineLookup } from "@/lib/shift-decline-read"
import {
  shiftDeclineDay, shiftDeclineHours, shiftDeclineSecretFromSegment, shiftDeclineShiftName,
} from "@/lib/shift-declines"
import { guardTokenLookup, pageClient } from "@/lib/token-page-guard"
import { TOO_MANY_ATTEMPTS_TITLE } from "@/lib/too-many-attempts"
import ShiftDeclineConfirm from "@/components/public/ShiftDeclineConfirm"
import OrgUnavailableNotice from "@/components/public/OrgUnavailableNotice"
import TooManyAttemptsNotice from "@/components/public/TooManyAttemptsNotice"

export const dynamic = "force-dynamic"

type ParamsPromise = Promise<{ kind: string; token: string; shiftId: string }>

/**
 * One decision per request, shared by generateMetadata and the page. A connection that opened too
 * many unknown links is answered before the link's shape, its organisation or anything else is
 * checked; a malformed or unknown link counts one miss, once per view (src/lib/token-page-guard.ts).
 * Its POST routes have no failed-lookup counter of their own: the page counts in the "personal"
 * family, the closest one (both secrets are links sent by email to one person).
 */
const loadDecline = cache(async (segment: string, token: string, shiftId: string) => {
  const client = await pageClient()
  const secret = shiftDeclineSecretFromSegment(segment)
  const malformed = !secret || !isTokenShaped(token) || !isTokenShaped(shiftId)
  const guarded = await guardTokenLookup(
    client,
    async (): Promise<ShiftDeclineLookup> => malformed
      ? { kind: "invalid" }
      : loadShiftDeclineTarget({ secret, token, shiftId, orgSlug: client.headers.get("x-org-slug") }),
    (lookup) => lookup.kind === "invalid",
  )
  if (guarded.blocked) return { blocked: true as const }
  return { blocked: false as const, secret: malformed ? null : secret, lookup: guarded.value }
})

export async function generateMetadata({ params }: { params: ParamsPromise }): Promise<Metadata> {
  const { kind, token, shiftId } = await params
  const view = await loadDecline(kind, token, shiftId)
  const state = view.blocked ? TOO_MANY_ATTEMPTS_TITLE : "Je ne peux pas"
  return { title: `${state} — ${siteName()}`, robots: { index: false, follow: false } }
}

/**
 * The page a « Je ne peux pas » link of the open-shifts email opens (#1303): it names the shift
 * and asks for one confirmation. Reading it changes nothing (a mail scanner opening the link
 * answers for nobody); only the button's POST records the answer. The same page serves the two
 * existing secrets, the invitation and the personal link, and each refusal has its own clear
 * message: unknown link, closed organisation, deleted, cancelled, full, past shift, or a shift
 * the member already holds.
 */
export default async function ShiftDeclinePage({ params }: { params: ParamsPromise }) {
  const { kind: segment, token, shiftId } = await params
  const view = await loadDecline(segment, token, shiftId)
  if (view.blocked) {
    return (
      <Card>
        <TooManyAttemptsNotice />
      </Card>
    )
  }
  const { secret, lookup } = view
  if (!secret) {
    return (
      <Card>
        <ShiftDeclineConfirm secret="invitation" token={token} shiftId={shiftId} state="invalid" />
      </Card>
    )
  }

  if (lookup.kind === "org_unavailable") return <OrgUnavailableNotice audience="volunteer" contact={contactEmail()} />
  if (lookup.kind === "invalid") {
    return (
      <Card>
        <ShiftDeclineConfirm secret={secret} token={token} shiftId={shiftId} state="invalid" />
      </Card>
    )
  }

  const { target } = lookup
  const shift = target.shift
  const declinedOn = target.declinedAt?.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

  return (
    <Card>
      <ShiftDeclineConfirm
        secret={secret}
        token={token}
        shiftId={shiftId}
        state={target.state.kind}
        eventTitle={target.eventTitle}
        shiftName={shift ? shiftDeclineShiftName(shift) : undefined}
        shiftDay={shift ? shiftDeclineDay(shift.date) : undefined}
        shiftHours={shift ? shiftDeclineHours(shift) : undefined}
        declinedOn={declinedOn}
      />
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">{children}</div>
    </main>
  )
}
