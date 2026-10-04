"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { announce } from "@/lib/announce"

type SignalKind = "name" | "phone" | "email" | "address_to_verify" | "birth_date"
type MemberView = { id: string; firstName: string; lastName: string; active: boolean }
export type DuplicatePairView = {
  memberIdA: string
  memberIdB: string
  signals: SignalKind[]
  score: number
  reasons: string[]
  memberA: MemberView
  memberB: MemberView
}

type Props = {
  initialPairs: DuplicatePairView[]
  /** Only owners can follow the merge link (#600 stays owner-only); organizers see the pair and a
   * plain sentence instead of a dead link. */
  isOwner: boolean
  /** From the members list's « Doublon ? » action (#599): prefilters to this member's own pairs. */
  prefilterMemberId?: string
  /** That member's display name, server-validated (member-duplicates/page.tsx) — used only for the
   * empty-state message and the organizer's search link; never trusted beyond display/a query string. */
  prefilterMemberName?: string
}

/** 24px targets (#557 axe target-size) on every link/button here, including the empty-state ones. */
const LINK_CLASS = "inline-flex items-center min-h-6 px-1 -mx-1 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const pairKey = (p: { memberIdA: string; memberIdB: string }) => `${p.memberIdA}\u0000${p.memberIdB}`
const fullName = (m: MemberView) => `${m.firstName} ${m.lastName}${m.active ? "" : " (inactif)"}`

/** Focus moves to the next remaining pair after a dismissal (or the previous one if the dismissed
 * pair was last, or the empty-state message once none are left) — never dropped to <body>. */
const EMPTY_TARGET = "__empty__"

export default function MemberDuplicatesManager({ initialPairs, isOwner, prefilterMemberId, prefilterMemberName }: Props) {
  const [pairs, setPairs] = useState(initialPairs)
  const [onlyMemberId, setOnlyMemberId] = useState(prefilterMemberId)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [focusTick, setFocusTick] = useState(0)
  const focusTargetRef = useRef<string | null>(null)
  const emptyRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLLIElement | null>())

  const filtered = onlyMemberId
    ? pairs.filter((p) => p.memberA.id === onlyMemberId || p.memberB.id === onlyMemberId)
    : pairs

  // Moves focus once the dismissed row is actually gone from the DOM (not before).
  useLayoutEffect(() => {
    if (focusTick === 0) return
    const target = focusTargetRef.current
    focusTargetRef.current = null
    if (!target) return
    if (target === EMPTY_TARGET) emptyRef.current?.focus()
    else itemRefs.current.get(target)?.focus()
  }, [focusTick])

  async function dismiss(p: DuplicatePairView) {
    if (busyKey) return
    const key = pairKey(p)
    setBusyKey(key)
    setError(null)
    try {
      const res = await fetch("/api/admin/members/duplicates/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteerIdA: p.memberIdA, volunteerIdB: p.memberIdB, signals: p.signals }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Announced once, through the alert role only (not also the status live region).
        setError(typeof body?.error === "string" ? body.error : "L'action n'a pas abouti. Réessayez.")
        return
      }

      const idx = filtered.findIndex((x) => pairKey(x) === key)
      const nextPairs = pairs.filter((x) => pairKey(x) !== key)
      const nextFiltered = onlyMemberId
        ? nextPairs.filter((x) => x.memberA.id === onlyMemberId || x.memberB.id === onlyMemberId)
        : nextPairs
      const target = nextFiltered[idx] ?? nextFiltered[idx - 1] ?? null
      focusTargetRef.current = target ? pairKey(target) : EMPTY_TARGET
      setPairs(nextPairs)
      setFocusTick((t) => t + 1)
      announce(setAnnouncement, `Paire ignorée : ${fullName(p.memberA)} et ${fullName(p.memberB)}.`)
    } catch {
      // Same rule: one announcement, through the alert only.
      setError("Connexion interrompue. Réessayez.")
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="space-y-5">
      <div role="status" className="sr-only">{announcement}</div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-400 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</p>
      )}

      <div className="space-y-1">
        <Link href="/admin/members" className={LINK_CLASS}>
          <span aria-hidden="true">← </span>Retour aux membres
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Doublons possibles</h1>
        <p className="text-sm text-gray-700">
          Des fiches peut-être en double, repérées par un nom, un téléphone, une adresse email ou une date de naissance proches. Ce ne sont que des suggestions : rien n&apos;est fusionné ni modifié ici, et un nom identique n&apos;est pas forcément la même personne.
        </p>
      </div>

      {onlyMemberId && (
        <p className="text-sm text-gray-700">
          Seulement les paires de ce membre.{" "}
          <button type="button" onClick={() => setOnlyMemberId(undefined)} className={LINK_CLASS}>
            Voir toutes les paires
          </button>
        </p>
      )}

      {filtered.length === 0 ? (
        <div ref={emptyRef} tabIndex={-1} className="space-y-2 text-sm text-gray-700 focus:outline-none">
          <p>
            {onlyMemberId
              ? `Aucun doublon suggéré pour ${prefilterMemberName ?? "ce membre"}.`
              : "Aucune paire possible en double pour l'instant."}
          </p>
          {onlyMemberId && (
            isOwner ? (
              <Link href={`/admin/members/${onlyMemberId}/merge`} className={LINK_CLASS}>
                Chercher une autre fiche à fusionner
              </Link>
            ) : (
              <Link href={`/admin/members?q=${encodeURIComponent(prefilterMemberName ?? "")}`} className={LINK_CLASS}>
                Chercher {prefilterMemberName ?? "ce membre"} dans les membres
              </Link>
            )
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => {
            const key = pairKey(p)
            const nameA = fullName(p.memberA)
            const nameB = fullName(p.memberB)
            const busy = busyKey === key
            return (
              <li
                key={key}
                ref={(el) => { itemRefs.current.set(key, el) }}
                tabIndex={-1}
                className="rounded-xl border border-gray-300 bg-white p-4 space-y-2 focus:outline-none"
              >
                <p className="text-sm font-medium text-gray-900">{nameA} et {nameB}</p>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
                  {p.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => dismiss(p)}
                    aria-disabled={busy || undefined}
                    className="inline-flex items-center justify-center min-h-6 px-2 text-sm text-gray-700 hover:text-red-700 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
                  >
                    {busy ? "Ignorer…" : "Ignorer"}<span className="sr-only"> la paire {nameA} et {nameB}</span>
                  </button>
                  {isOwner ? (
                    <Link
                      href={`/admin/members/${p.memberIdA}/merge?with=${p.memberIdB}`}
                      className="inline-flex items-center justify-center min-h-6 px-2 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Comparer et fusionner<span className="sr-only"> {nameA} et {nameB}</span>
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-600">Seul·e un·e propriétaire de l&apos;organisation peut fusionner ces fiches.</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
