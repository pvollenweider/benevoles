// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { headers } from "next/headers"
import { contactEmail } from "@/lib/site"
import { isTokenShaped } from "@/lib/token-path"
import { loadShiftDeclineTarget } from "@/lib/shift-decline-read"
import {
  shiftDeclineDay, shiftDeclineHours, shiftDeclineSecretFromSegment, shiftDeclineShiftName,
} from "@/lib/shift-declines"
import ShiftDeclineConfirm from "@/components/public/ShiftDeclineConfirm"
import OrgUnavailableNotice from "@/components/public/OrgUnavailableNotice"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Je ne peux pas — Bénévoles",
  robots: { index: false, follow: false },
}

/**
 * The page a « Je ne peux pas » link of the open-shifts email opens (#1303): it names the shift
 * and asks for one confirmation. Reading it changes nothing (a mail scanner opening the link
 * answers for nobody); only the button's POST records the answer. The same page serves the two
 * existing secrets, the invitation and the personal link, and each refusal has its own clear
 * message: unknown link, closed organisation, deleted, cancelled, full, past shift, or a shift
 * the member already holds.
 */
export default async function ShiftDeclinePage({ params }: { params: Promise<{ kind: string; token: string; shiftId: string }> }) {
  const { kind: segment, token, shiftId } = await params
  const secret = shiftDeclineSecretFromSegment(segment)
  if (!secret || !isTokenShaped(token) || !isTokenShaped(shiftId)) {
    return (
      <Card>
        <ShiftDeclineConfirm secret="invitation" token={token} shiftId={shiftId} state="invalid" />
      </Card>
    )
  }

  const orgSlug = (await headers()).get("x-org-slug")
  const lookup = await loadShiftDeclineTarget({ secret, token, shiftId, orgSlug })
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
