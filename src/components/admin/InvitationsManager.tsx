"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { inviteResultText, remindResultText } from "@/lib/invitation-summary"
import { useId, useMemo, useRef, useState, useTransition } from "react"
import { flushSync } from "react-dom"
import { requestJson } from "@/lib/use-submit"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { remindInvitedRecap } from "@/lib/action-recap"
import { useRouter } from "next/navigation"
import ModalShell from "./ModalShell"
import Link from "next/link"

type Member = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  tags: string[]
}

type Invite = {
  id: string
  sentAt: string
  usedAt: string | null
  volunteerId: string
  firstName: string
  lastName: string
  email: string | null
  tags: string[]
  registered: boolean
}

type Props = {
  eventId: string
  members: Member[]
  allTags: string[]
  invites: Invite[]
}

export default function InvitationsManager({ eventId, members, allTags, invites }: Props) {
  const router = useRouter()
  const [showInvite, setShowInvite] = useState(false)
  const [, startTransition] = useTransition()
  const [reminding, setReminding] = useState(false)
  const [remindResult, setRemindResult] = useState<string | null>(null)
  const [confirmingRemind, setConfirmingRemind] = useState(false)
  const [remindError, setRemindError] = useState<string | null>(null)
  // The address itself is wrong (field error) or the sending failed (send error): not the same thing for the field.
  const [testFieldError, setTestFieldError] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState("")
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [showTest, setShowTest] = useState(false)
  const testId = useId()

  const total = invites.length
  const registered = invites.filter((i) => i.registered).length
  const noAnswer = total - registered

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function sendTestEmail() {
    if (testState === "sending") return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
      // Committed before the focus moves, so the field already carries its description.
      flushSync(() => { setTestFieldError("Indiquez une adresse email complète."); setTestError(null); setTestState("error") })
      document.getElementById(`${testId}-email`)?.focus()
      return
    }
    setTestState("sending")
    setTestError(null)
    setTestFieldError(null)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/invitations/test-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail.trim() }),
    }), "L'email de test n'a pas pu être envoyé.")
    if (!outcome.ok) setTestError(outcome.error)
    setTestState(outcome.ok ? "sent" : "error")
  }

  function remindNonRegistered() {
    if (noAnswer === 0) return
    setConfirmingRemind(true)
  }

  async function runRemind() {
    setReminding(true)
    setRemindResult(null)
    setRemindError(null)
    const outcome = await requestJson<{ sent: number; failed?: number }>(() => fetch(`/api/admin/events/${eventId}/invitations/remind`, { method: "POST" }), "Les relances n'ont pas pu être envoyées.")
    setReminding(false)
    // A failure stays in the dialog, where « Réessayer » is at hand.
    if (!outcome.ok) { setRemindError(outcome.error); return }
    const data = outcome.data
    setConfirmingRemind(false)
    setRemindResult(remindResultText(data))
    refresh()
  }

  return (
    <div className="space-y-5">
      {confirmingRemind && (
        <ConfirmActionModal recap={remindInvitedRecap({ people: noAnswer })} busy={reminding} error={remindError} onConfirm={() => void runRemind()} onCancel={() => setConfirmingRemind(false)} />
      )}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Invités" value={total} />
        <StatCard label="Inscrits" value={registered} positive={registered > 0} />
        <StatCard label="Sans créneau confirmé" value={noAnswer} warning={noAnswer > 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setShowInvite(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          + Inviter des membres
        </button>
        {noAnswer > 0 && (
          <button
            type="button"
            onClick={remindNonRegistered}
            className="text-sm border border-gray-300 px-3 py-2 rounded-xl hover:bg-gray-50"
          >
            {noAnswer === 1 ? "Relancer la personne sans créneau" : `Relancer les ${noAnswer} sans créneau`}
          </button>
        )}
        {noAnswer > 0 && (
          // A free text to the same group (#481), through « Écrire aux bénévoles ».
          <Link
            href={`/admin/events/${eventId}/message?audience=invited`}
            className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 self-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {noAnswer === 1 ? "Écrire un message à la personne sans créneau" : `Écrire un message aux ${noAnswer} sans créneau`}
          </Link>
        )}
        <span role="status" className="text-sm self-center text-gray-600">{remindResult ?? ""}</span>
        <button
          onClick={() => setShowTest((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-700 ml-auto self-center"
        >
          Tester l&apos;envoi d&apos;email
        </button>
      </div>

      {showTest && (
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); void sendTestEmail() }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end"
        >
          <div className="flex-1">
            <label htmlFor={`${testId}-email`} className="block text-xs font-medium text-amber-900 mb-1">
              Envoyer un exemple d&apos;email d&apos;invitation à :
            </label>
            <input
              id={`${testId}-email`}
              type="email"
              value={testEmail}
              aria-invalid={testFieldError ? true : undefined}
              aria-describedby={testFieldError ? `${testId}-error` : undefined}
              onChange={(e) => { setTestEmail(e.target.value); setTestState("idle"); setTestFieldError(null) }}
              placeholder="votre@email.com"
              className="w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <button
            type="submit"
            aria-disabled={testState === "sending" || undefined}
            className="text-sm bg-amber-700 text-white px-4 py-1.5 rounded-lg hover:bg-amber-800 aria-disabled:cursor-wait shrink-0"
          >
            {testState === "sending" ? "Envoi…" : "Envoyer le test"}
          </button>
          <span role="status" className={`text-sm text-green-800 self-center ${testState === "sent" ? "" : "sr-only"}`}>
            {testState === "sent" ? "Envoyé." : testState === "sending" ? "Envoi en cours…" : ""}
          </span>
          <span id={`${testId}-error`} role="alert" className={`text-sm text-red-700 self-center ${testState === "error" ? "" : "sr-only"}`}>{testState === "error" ? (testFieldError ?? testError ?? "Échec de l'envoi.") : ""}</span>
        </form>
      )}

      {invites.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
          Aucune invitation envoyée pour cet événement.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Membre</th>
                <th className="text-left px-4 py-2 font-medium">Tags</th>
                <th className="text-left px-4 py-2 font-medium">Invité le</th>
                <th className="text-left px-4 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => {
                const date = new Date(i.sentAt).toLocaleDateString("fr-FR")
                return (
                  <tr key={i.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{i.firstName} {i.lastName}</div>
                      {i.email ? (
                        <div className="text-xs text-gray-500">{i.email}</div>
                      ) : (
                        <div className="text-xs text-orange-500">⚠ pas d&apos;email</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {i.tags.map((t) => (
                          <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{date}</td>
                    <td className="px-4 py-3">
                      {i.registered ? (
                        <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                          ✓ Participation confirmée
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full">
                          Sans créneau confirmé
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteModal
          eventId={eventId}
          members={members}
          allTags={allTags}
          alreadyInvitedIds={new Set(invites.map((i) => i.volunteerId))}
          onClose={() => setShowInvite(false)}
          onDone={() => {
            setShowInvite(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function InviteModal({
  eventId,
  members,
  allTags,
  alreadyInvitedIds,
  onClose,
  onDone,
}: {
  eventId: string
  members: Member[]
  allTags: string[]
  alreadyInvitedIds: Set<string>
  onClose: () => void
  onDone: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [hideInvited, setHideInvited] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => {
      if (hideInvited && alreadyInvitedIds.has(m.id)) return false
      if (tagFilter && !m.tags.includes(tagFilter)) return false
      if (!q) return true
      return (
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q)
      )
    })
  }, [members, search, tagFilter, hideInvited, alreadyInvitedIds])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const m of filtered) next.add(m.id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function submit() {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    setResult(null)
    const outcome = await requestJson<{ invitedNew?: number; skippedExisting?: number; emailsSent?: number; emailsFailed?: number; membersWithoutEmail?: number }>(() => fetch(`/api/admin/events/${eventId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        volunteerIds: Array.from(selected),
        message: message.trim() || undefined,
      }),
    }), "Les invitations n'ont pas pu être envoyées.")
    setSubmitting(false)
    if (!outcome.ok) {
      // The selection stays: « Envoyer » again retries with the same people.
      setResult({ kind: "error", text: `${outcome.error} Votre sélection est conservée.` })
      return
    }
    const data = outcome.data
    setResult({ kind: "ok", text: inviteResultText(data) })
    setTimeout(onDone, 1500)
  }

  return (
    <ModalShell
      title="Inviter des membres"
      onClose={onClose}
      panelClassName="max-w-2xl flex flex-col"
      initialFocusRef={searchRef}
      closeOnBackdrop={false}
    >

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            ref={searchRef}
            type="search"
            aria-label="Rechercher un membre"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm placeholder:text-gray-500"
          />
          <select
            aria-label="Filtrer par tag"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">Tous les tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="text-xs text-gray-600 flex items-center gap-1">
            <input type="checkbox" checked={hideInvited} onChange={(e) => setHideInvited(e.target.checked)} />
            Cacher déjà invités
          </label>
        </div>

        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>{filtered.length} membres affichés · {selected.size} sélectionnés</span>
          <div className="flex gap-2">
            <button onClick={selectAllVisible} className="text-blue-600 hover:underline">Tout sélectionner</button>
            <button onClick={clearSelection} className="text-gray-500 hover:underline">Effacer</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-xl">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Aucun membre à inviter</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    aria-label={`Inviter ${m.firstName} ${m.lastName}`}
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{m.firstName} {m.lastName}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {m.email ?? <span className="text-orange-500">pas d&apos;email</span>}
                      {m.tags.length > 0 && <> · {m.tags.join(", ")}</>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="invite-message" className="block text-sm text-gray-700 mb-1">Message (optionnel)</label>
            <textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Un mot d'accompagnement court qui sera inclus dans l'email"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm placeholder:text-gray-500"
            />
          </div>

          <div role="status" className={result?.kind === "ok" ? "text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg" : "sr-only"}>{result?.kind === "ok" ? result.text : ""}</div>
          <div role="alert" className={result?.kind === "error" ? "text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-lg" : "sr-only"}>{result?.kind === "error" ? result.text : ""}</div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={selected.size === 0}
              aria-disabled={submitting || undefined}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 aria-disabled:cursor-wait"
            >
              {submitting ? "Envoi…" : `Envoyer ${selected.size} invitation${selected.size > 1 ? "s" : ""}`}
            </button>
            <span role="status" className="sr-only">{submitting ? "Envoi en cours…" : ""}</span>
          </div>
        </div>
    </ModalShell>
  )
}

function StatCard({ label, value, positive, warning }: { label: string; value: number; positive?: boolean; warning?: boolean }) {
  const color = positive
    ? "bg-green-50 border-green-200 text-green-700"
    : warning
      ? "bg-orange-50 border-orange-200 text-orange-700"
      : "bg-white border-gray-200 text-gray-900"
  return (
    <div className={`rounded-xl border p-4 text-center ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-70">{label}</p>
    </div>
  )
}
