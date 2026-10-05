"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { eraseMemberRecap, ERASURE_CHALLENGE, type ErasureCounts } from "@/lib/member-erasure"

export type MemberErasureState =
  | { kind: "eligible"; counts: ErasureCounts }
  | { kind: "erased"; erasedAt: string }
  | { kind: "refused"; reason: string }

type Props = {
  memberId: string
  memberName: string
  erasure: MemberErasureState
  /** The organisation's time zone, for the erasure date (the same text before and after the refresh). */
  timeZone: string
}

const formatDay = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long", year: "numeric" })

/** « C'est … » read after a colon: lower-case first letter. */
const afterColon = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const ERASED_TEXT = "Les données personnelles de cette fiche ont été effacées. Ses inscriptions restent dans l'historique des événements, sans identité."

/**
 * The member page's « Effacer les données personnelles » action (#516): a confirmation listing what
 * is removed and what is kept, with the word to type, then the record is anonymised in place. The
 * page stays (the record and its history do), so the outcome is said here: focus moves to the
 * notice that replaces the button, which is read on focus, and the page refreshes around it.
 */
export default function MemberEraseAction({ memberId, memberName, erasure, timeZone }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The erasure date returned by the API once it's done here (null until then).
  const [doneAt, setDoneAt] = useState<string | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)

  // Same element whether the erasure just happened here or the page was loaded afterwards, so the
  // focus put on it survives the refresh.
  const erasedAt = erasure.kind === "erased" ? erasure.erasedAt : doneAt
  if (erasedAt) {
    const on = ` Effacement du ${formatDay(erasedAt, timeZone)}.`
    return (
      <p ref={noticeRef} tabIndex={-1} className="text-sm text-gray-800 bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 forced-colors:border-[CanvasText] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        {ERASED_TEXT}{on}
      </p>
    )
  }

  if (erasure.kind === "refused") {
    return <p className="text-sm text-gray-700">Les données personnelles de cette fiche ne peuvent pas être effacées : {afterColon(erasure.reason)}</p>
  }

  async function runErase() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/members/${memberId}/erase`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data?.error === "string" ? data.error : "L'effacement n'a pas abouti : rien n'a changé. Réessayez.")
        return
      }
      const data = await res.json().catch(() => ({}))
      const at = typeof data?.erasedAt === "string" ? data.erasedAt : new Date().toISOString()
      // Committed before the focus moves: the dialog is gone and the notice is in place (DESIGN.md,
      // a parent that places focus itself on close wins over the return to the opener).
      flushSync(() => {
        setBusy(false)
        setConfirming(false)
        setDoneAt(at)
      })
      noticeRef.current?.focus()
      router.refresh()
    } catch {
      setError("Connexion impossible : rien n'a changé. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setConfirming(true) }}
        aria-label={`Effacer les données personnelles de ${memberName}`}
        className="text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        Effacer les données personnelles
      </button>
      {confirming && erasure.kind === "eligible" && (
        <ConfirmActionModal
          recap={eraseMemberRecap(memberName, erasure.counts)}
          busy={busy}
          error={error}
          challenge={{ label: `Pour confirmer, saisissez « ${ERASURE_CHALLENGE} »`, expected: ERASURE_CHALLENGE }}
          onConfirm={() => void runErase()}
          onCancel={() => { if (!busy) { setConfirming(false); setError(null) } }}
        />
      )}
    </>
  )
}
