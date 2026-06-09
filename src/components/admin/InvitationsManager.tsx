"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

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
  const [testEmail, setTestEmail] = useState("")
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [showTest, setShowTest] = useState(false)

  const total = invites.length
  const registered = invites.filter((i) => i.registered).length
  const noAnswer = total - registered

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function remindNonRegistered() {
    if (!confirm(`Envoyer une relance aux ${noAnswer} membres invités sans réponse ?`)) return
    setReminding(true)
    setRemindResult(null)
    const res = await fetch(`/api/admin/events/${eventId}/invitations/remind`, { method: "POST" })
    setReminding(false)
    if (!res.ok) {
      setRemindResult("Erreur lors de l'envoi des relances")
      return
    }
    const data = await res.json()
    setRemindResult(`${data.sent} relance${data.sent > 1 ? "s" : ""} envoyée${data.sent > 1 ? "s" : ""}`)
    refresh()
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Invités" value={total} />
        <StatCard label="Inscrits" value={registered} positive={registered > 0} />
        <StatCard label="Sans réponse" value={noAnswer} warning={noAnswer > 0} />
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
            onClick={remindNonRegistered}
            disabled={reminding}
            className="text-sm border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            {reminding ? "Envoi…" : `Relancer les ${noAnswer} sans réponse`}
          </button>
        )}
        {remindResult && <span className="text-sm text-gray-600 self-center">{remindResult}</span>}
        <button
          onClick={() => setShowTest((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-600 ml-auto self-center"
        >
          Tester l&apos;envoi d&apos;email
        </button>
      </div>

      {showTest && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-amber-900 mb-1">
              Envoyer un exemple d&apos;email d&apos;invitation à :
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => { setTestEmail(e.target.value); setTestState("idle") }}
              placeholder="votre@email.com"
              className="w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <button
            disabled={!testEmail || testState === "sending"}
            onClick={async () => {
              setTestState("sending")
              const res = await fetch(`/api/admin/events/${eventId}/invitations/test-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: testEmail }),
              })
              setTestState(res.ok ? "sent" : "error")
            }}
            className="text-sm bg-amber-600 text-white px-4 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50 shrink-0"
          >
            {testState === "sending" ? "Envoi…" : "Envoyer le test"}
          </button>
          {testState === "sent" && <span className="text-sm text-green-700 self-center">✓ Envoyé !</span>}
          {testState === "error" && <span className="text-sm text-red-600 self-center">Échec de l&apos;envoi.</span>}
        </div>
      )}

      {invites.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400">
          Aucune invitation envoyée pour cet événement.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
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
                          Sans réponse
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
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [hideInvited, setHideInvited] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

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
    if (selected.size === 0) return
    setSubmitting(true)
    setResult(null)
    const res = await fetch(`/api/admin/events/${eventId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        volunteerIds: Array.from(selected),
        message: message.trim() || undefined,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setResult(typeof data?.error === "string" ? data.error : "Erreur lors de l'envoi")
      return
    }
    const data = await res.json()
    const parts: string[] = []
    if (data.invitedNew) parts.push(`${data.invitedNew} invités`)
    if (data.skippedExisting) parts.push(`${data.skippedExisting} déjà invités`)
    if (data.emailsSent) parts.push(`${data.emailsSent} emails envoyés`)
    if (data.membersWithoutEmail) parts.push(`${data.membersWithoutEmail} sans email`)
    setResult(parts.join(" · "))
    setTimeout(onDone, 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-5 max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Inviter des membres</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
          <select
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

        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Aucun membre à inviter</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
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
            <label className="block text-sm text-gray-700 mb-1">Message (optionnel)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Un mot d'accompagnement court qui sera inclus dans l'email"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>

          {result && <div className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">{result}</div>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={selected.size === 0 || submitting}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Envoi…" : `Envoyer ${selected.size} invitation${selected.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
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
