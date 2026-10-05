"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { useRouter } from "next/navigation"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { deleteMemberRecap } from "@/lib/action-recap"
import type { MemberDeletionEligibility } from "@/lib/member-deletion"

type Props = {
  memberId: string
  memberName: string
  deletion: MemberDeletionEligibility
}

/**
 * The member page's own « Supprimer » action (#667): a button only when the record is eligible —
 * never a dead one — and a plain-words explanation otherwise. Deleting here leaves nothing to show
 * on this page any more, so a successful deletion navigates to the members list and lets it
 * announce the outcome (?deleted=, read by MembersManager).
 */
export default function MemberDeleteAction({ memberId, memberName, deletion }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!deletion.eligible) {
    return <p className="text-sm text-gray-700 mt-2">Cette fiche ne peut pas être supprimée : {deletion.reason}</p>
  }

  async function runDelete() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/members/${memberId}/delete`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data?.error === "string" ? data.error : "La suppression n'a pas abouti. Réessayez.")
        return
      }
      router.push(`/admin/members?deleted=${encodeURIComponent(memberName)}`)
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
        aria-label={`Supprimer ${memberName}`}
        className="text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        Supprimer
      </button>
      {confirming && (
        <ConfirmActionModal
          recap={deleteMemberRecap(memberName)}
          busy={busy}
          error={error}
          onConfirm={() => void runDelete()}
          onCancel={() => { if (!busy) { setConfirming(false); setError(null) } }}
        />
      )}
    </>
  )
}
