"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import ModalShell from "./ModalShell"
import { announce } from "@/lib/announce"
import { focusFirstAvailable, isFocusDropped, type FocusCandidate } from "@/lib/focus-return"
import { describeBulkFailure } from "@/lib/form-errors"

type MergeableField = "firstName" | "lastName" | "email" | "phone" | "birthDate" | "availabilityNote"

const FIELD_LABEL: Record<MergeableField, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  email: "Email",
  phone: "Téléphone",
  birthDate: "Date de naissance",
  availabilityNote: "Note de disponibilité",
}

type FieldDiff = { field: MergeableField; keepValue: string | number | null; absorbValue: string | number | null; differs: boolean }

type Conflict =
  | { kind: "same_shift"; shiftId: string; shiftLabel: string; blocking: boolean; resolvedBy: "rank" | "choice" | null }
  | { kind: "overlap"; shiftIds: [string, string]; labels: [string, string] }
  | { kind: "role_limit"; roleName: string; limit: number; count: number }
  | { kind: "min_age"; shiftId: string; shiftLabel: string; minAge: number; birthDate: string | null }
  | { kind: "reserved_role"; shiftId: string; shiftLabel: string; reservedTags: string[]; memberTags: string[] }
  | { kind: "same_question"; questionId: string; eventId: string; blocking: boolean }
  | { kind: "same_event_invite"; eventId: string; blocking: boolean; resolvedBy: "used_first" | "choice" | null }

/** Stable key for a conflict row: its kind plus whichever id it's about. */
function conflictKey(c: Conflict): string {
  if (c.kind === "same_shift" || c.kind === "min_age" || c.kind === "reserved_role") return `${c.kind}-${c.shiftId}`
  if (c.kind === "overlap") return `${c.kind}-${c.shiftIds[0]}-${c.shiftIds[1]}`
  if (c.kind === "role_limit") return `${c.kind}-${c.roleName}`
  if (c.kind === "same_question") return `${c.kind}-${c.questionId}`
  return `${c.kind}-${c.eventId}`
}

type Preview = {
  fieldDiffs: FieldDiff[]
  conflicts: Conflict[]
  blocking: Conflict[]
  counts: {
    registrationsByStatus: Record<string, number>
    invites: number
    answers: number
    pushSubscriptionsDropped: number
    deliveryOutcomesReassigned: number
    deliveryOutcomesLeft: number
    sectorLeadersToReview: number
  }
}

type MemberLite = { id: string; firstName: string; lastName: string; email: string | null }
type SearchRow = MemberLite & { active: boolean }

type Choices = {
  fields: Partial<Record<MergeableField, "keep" | "absorb">>
  notesMode?: "keep" | "absorb" | "concatenate"
  answerConflicts: Record<string, "keep" | "absorb">
  inviteConflicts: Record<string, "keep" | "absorb">
  sendLinksToKeptAddress: boolean
}

const emptyChoices = (): Choices => ({ fields: {}, answerConflicts: {}, inviteConflicts: {}, sendLinksToKeptAddress: false })

const fieldValueLabel = (v: string | number | null, field: MergeableField) => {
  if (v === null || v === "") return "(vide)"
  if (field === "birthDate" && typeof v === "number") return new Date(v).toLocaleDateString("fr-FR")
  return String(v)
}

const STATUS_LABEL: Record<string, string> = { active: "confirmée", waiting: "liste d'attente", offered: "proposition en attente", requested: "demande en attente", cancelled: "annulée", refused: "refusée", deleted: "supprimée" }

/** "1 résultat trouvé." / "3 résultats trouvés." / "Aucun autre membre trouvé." */
function resultsSentence(count: number): string {
  if (count === 0) return "Aucun autre membre trouvé."
  return `${count} résultat${count > 1 ? "s" : ""} trouvé${count > 1 ? "s" : ""}.`
}

const RADIO_ROW = "flex items-center gap-2 min-h-6 py-1 text-sm text-gray-800"

export default function MemberMergeFlow({ member, initialOther }: { member: MemberLite; initialOther?: MemberLite }) {
  const [step, setStep] = useState<"pick" | "preview" | "result">("pick")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchRow[] | null>(null)
  const [other, setOther] = useState<MemberLite | null>(null)
  const [choices, setChoices] = useState<Choices>(emptyChoices())
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ counts: Record<string, number>; resend: { sent: number; failed: number } | null } | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const previewHeadingRef = useRef<HTMLHeadingElement>(null)
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)

  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    if (isFocusDropped(active) || document.getElementById("member-merge-panel")?.contains(active)) {
      focusFirstAvailable(focusRequest.candidates)
    }
  }, [focusRequest])

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch(`/api/admin/members?q=${encodeURIComponent(query)}`)
      if (!res.ok) {
        setError("La recherche a échoué. Réessayez.")
        return
      }
      const rows = (await res.json()) as SearchRow[]
      const filtered = rows.filter((r) => r.id !== member.id)
      setResults(filtered)
      announce(setAnnouncement, resultsSentence(filtered.length))
    } catch {
      setError("Connexion interrompue : la recherche n'a pas abouti. Réessayez.")
    }
  }

  async function pick(candidate: MemberLite) {
    setOther(candidate)
    setChoices(emptyChoices())
    await loadPreview(candidate, emptyChoices(), { initial: true })
  }

  // `?with=<otherId>` (#601, from a « Doublons possibles » pair): the server page already
  // validated the candidate (same organization, not a tombstone, not `member` itself) before
  // passing it in, so this starts the flow exactly where picking it by hand would have — same
  // preview-heading focus and single announcement, see `pick`/`loadPreview` above. Runs once.
  const initialOtherHandledRef = useRef(false)
  useEffect(() => {
    if (initialOther && !initialOtherHandledRef.current) {
      initialOtherHandledRef.current = true
      void pick(initialOther)
    }
    // Runs once on mount (guarded by the ref above) for the `initialOther` this render started
    // with; `pick` itself is intentionally not a dependency, it would re-run the effect every
    // render otherwise since it's redefined each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOther?.id])

  async function loadPreview(otherMember: MemberLite, c: Choices, opts: { initial?: boolean } = {}) {
    setLoading(true)
    setError(null)
    announce(setAnnouncement, "Mise à jour de l'aperçu…")
    try {
      const res = await fetch(`/api/admin/members/${member.id}/merge-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherId: otherMember.id, choices: c }),
      })
      const body = await res.json()
      if (!res.ok) {
        const message = body.error ?? "Aperçu impossible."
        setError(message)
        setPreview(null)
        announce(setAnnouncement, message)
        return
      }
      setPreview(body.preview)
      setStep("preview")
      if (opts.initial) {
        announce(setAnnouncement, `Aperçu de la fusion avec ${otherMember.firstName} ${otherMember.lastName}.`)
        setFocusRequest({ candidates: [() => previewHeadingRef.current] })
      } else {
        announce(setAnnouncement, "Aperçu mis à jour.")
      }
    } catch {
      setError("Connexion interrompue. Réessayez.")
      announce(setAnnouncement, "Connexion interrompue. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  function updateChoices(next: Choices) {
    setChoices(next)
    if (other) loadPreview(other, next)
  }

  async function confirmMerge() {
    if (!other || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/members/${member.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherId: other.id, choices }),
      })
      const body = await res.json()
      if (!res.ok) {
        const f = describeBulkFailure({ status: res.status, body }, "Fusion")
        setError(f.message)
        setConfirmOpen(false)
        return
      }
      setResult({ counts: body.counts, resend: body.resend })
      setConfirmOpen(false)
      setStep("result")
      announce(setAnnouncement, `Fusion effectuée : la fiche de ${other.firstName} ${other.lastName} a été absorbée dans celle de ${member.firstName} ${member.lastName}.`)
      setFocusRequest({ candidates: [() => resultHeadingRef.current] })
    } catch {
      setError("Connexion interrompue : la fusion n'a peut-être pas été reçue. Rechargez la fiche pour vérifier avant de réessayer.")
      setConfirmOpen(false)
    } finally {
      setBusy(false)
    }
  }

  function closeConfirm() {
    if (busy) return
    setConfirmOpen(false)
  }

  function openConfirm() {
    if (blockingUnresolved > 0) return
    setConfirmOpen(true)
  }

  const blockingUnresolved = preview?.blocking.length ?? 0

  return (
    <div id="member-merge-panel" className="space-y-6 max-w-2xl">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      {step === "pick" && (
        <section aria-labelledby="pick-heading" className="space-y-4">
          <h2 id="pick-heading" className="text-lg font-semibold text-gray-900">Choisir la fiche à absorber</h2>
          <p className="text-sm text-gray-700">
            Vous allez fusionner la fiche de <strong>{member.firstName} {member.lastName}</strong> avec une autre, confirmée comme la même personne. La fiche choisie ci-dessous sera absorbée et désactivée ; vous gardez {member.firstName} {member.lastName}.
          </p>
          {error && (
            <p role="alert" className="rounded-lg border border-red-400 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</p>
          )}
          <form onSubmit={runSearch} className="flex gap-2">
            <label htmlFor="merge-search" className="sr-only">Rechercher un membre par nom ou email</label>
            <input
              id="merge-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom ou email"
              className="flex-1 rounded-lg border border-gray-400 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              Chercher
            </button>
          </form>
          {results && (
            <ul className="space-y-2">
              {results.length === 0 && <li className="text-sm text-gray-700">Aucun autre membre trouvé.</li>}
              {results.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-gray-300 px-4 py-2">
                  <span className="text-sm text-gray-900">{r.firstName} {r.lastName}{r.email ? `, ${r.email}` : ""}{r.active ? "" : " (inactive)"}</span>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Fusionner avec cette fiche<span className="sr-only"> ({r.firstName} {r.lastName})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === "preview" && other && preview && (
        <section aria-labelledby="preview-heading" className="space-y-6">
          <h2 id="preview-heading" tabIndex={-1} ref={previewHeadingRef} className="text-lg font-semibold text-gray-900 focus:outline-none">
            Aperçu de la fusion avec {other.firstName} {other.lastName}
          </h2>
          {error && (
            <p role="alert" className="rounded-lg border border-red-400 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</p>
          )}
          {loading && <p className="text-sm text-gray-700">Mise à jour de l&apos;aperçu…</p>}

          <fieldset className="space-y-3 rounded-xl border border-gray-300 p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900">Champs du profil à conserver</legend>
            {preview.fieldDiffs.filter((d) => d.differs).length === 0 && (
              <p className="text-sm text-gray-700">Les deux fiches ont les mêmes valeurs pour ces champs.</p>
            )}
            {preview.fieldDiffs.filter((d) => d.differs).map((d) => (
              <fieldset key={d.field} className="space-y-1">
                <legend className="text-sm font-medium text-gray-900">{FIELD_LABEL[d.field]}</legend>
                {(["keep", "absorb"] as const).map((choice) => (
                  <label key={choice} className={RADIO_ROW}>
                    <input
                      type="radio"
                      name={`field-${d.field}`}
                      checked={(choices.fields[d.field] ?? "keep") === choice}
                      onChange={() => updateChoices({ ...choices, fields: { ...choices.fields, [d.field]: choice } })}
                      className="h-4 w-4"
                    />
                    {choice === "keep"
                      ? `Garder « ${fieldValueLabel(d.keepValue, d.field)} » (${member.firstName} ${member.lastName})`
                      : `Prendre « ${fieldValueLabel(d.absorbValue, d.field)} » (${other.firstName} ${other.lastName})`}
                  </label>
                ))}
              </fieldset>
            ))}
          </fieldset>

          <fieldset className="space-y-1 rounded-xl border border-gray-300 p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900">Notes internes</legend>
            {(["keep", "absorb", "concatenate"] as const).map((mode) => (
              <label key={mode} className={RADIO_ROW}>
                <input
                  type="radio"
                  name="notes-mode"
                  checked={(choices.notesMode ?? "keep") === mode}
                  onChange={() => updateChoices({ ...choices, notesMode: mode })}
                  className="h-4 w-4"
                />
                {mode === "keep" && `Garder les notes de ${member.firstName} ${member.lastName}`}
                {mode === "absorb" && `Prendre les notes de ${other.firstName} ${other.lastName}`}
                {mode === "concatenate" && "Mettre les deux notes à la suite"}
              </label>
            ))}
          </fieldset>

          <div className="rounded-xl border border-gray-300 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Ce qui sera déplacé</h3>
            <table className="mt-2 w-full text-sm text-gray-800">
              <caption className="sr-only">Nombre de lignes concernées par la fusion, par type</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="font-medium">Donnée</th>
                  <th scope="col" className="font-medium">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.counts.registrationsByStatus).map(([status, count]) => (
                  <tr key={status}>
                    <td>Inscriptions {STATUS_LABEL[status] ?? status}</td>
                    <td>{count}</td>
                  </tr>
                ))}
                <tr><td>Invitations</td><td>{preview.counts.invites}</td></tr>
                <tr><td>Réponses aux questions</td><td>{preview.counts.answers}</td></tr>
                <tr><td>Abonnements aux notifications du navigateur (supprimés, jamais déplacés)</td><td>{preview.counts.pushSubscriptionsDropped}</td></tr>
                <tr><td>Résultats d&apos;envoi repris sur l&apos;adresse conservée</td><td>{preview.counts.deliveryOutcomesReassigned}</td></tr>
                {preview.counts.sectorLeadersToReview > 0 && (
                  <tr><td>Responsables de secteur à vérifier à la main (email non repris automatiquement)</td><td>{preview.counts.sectorLeadersToReview}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {preview.conflicts.length > 0 && (
            <div className="rounded-xl border border-amber-400 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Points à vérifier</h3>
              <ul className="mt-2 space-y-3 text-sm text-gray-900">
                {preview.conflicts.map((c) => <ConflictItem key={conflictKey(c)} conflict={c} choices={choices} onChange={updateChoices} />)}
              </ul>
            </div>
          )}

          <div>
            <label className={RADIO_ROW}>
              <input
                type="checkbox"
                checked={choices.sendLinksToKeptAddress}
                onChange={(e) => updateChoices({ ...choices, sendLinksToKeptAddress: e.target.checked })}
                className="h-4 w-4"
                aria-describedby="send-links-hint"
              />
              Envoyer les nouveaux liens personnels à l&apos;adresse conservée
            </label>
            <p id="send-links-hint" className="ml-6 text-xs text-gray-600">
              Un email est envoyé à l&apos;adresse de {member.firstName} {member.lastName} avec les liens des inscriptions et invitations déplacées.
            </p>
          </div>

          <div className="rounded-xl border border-gray-400 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Résumé avant confirmation</h3>
            <p className="mt-1 text-sm text-gray-800">
              La fiche de {other.firstName} {other.lastName} sera désactivée et vidée de ses informations personnelles. Cette action est irréversible. Les liens personnels déplacés seront régénérés : les anciens liens ne fonctionneront plus.
            </p>
            <button
              type="button"
              onClick={openConfirm}
              aria-disabled={blockingUnresolved > 0 || undefined}
              aria-describedby={blockingUnresolved > 0 ? "merge-remaining-conflicts" : undefined}
              className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
            >
              Fusionner les deux fiches
            </button>
            {blockingUnresolved > 0 && (
              <p id="merge-remaining-conflicts" className="mt-2 text-sm text-red-800">
                {blockingUnresolved} choix restant{blockingUnresolved > 1 ? "s" : ""} avant de confirmer.
              </p>
            )}
          </div>

          {confirmOpen && (
            <ModalShell title="Confirmer la fusion" onClose={closeConfirm} role="alertdialog" busy={busy} describedBy="merge-confirm-desc">
              <p id="merge-confirm-desc" className="text-sm text-gray-800">
                Fusionner {other.firstName} {other.lastName} dans {member.firstName} {member.lastName} ? Cette action est irréversible : la fiche absorbée sera désactivée et vidée, et les liens personnels déplacés seront régénérés.
              </p>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeConfirm}
                  aria-disabled={busy || undefined}
                  className="rounded-lg border border-gray-400 px-4 py-2 text-sm font-medium text-gray-800 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmMerge}
                  aria-disabled={busy || undefined}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
                >
                  {busy ? "Fusion en cours…" : "Confirmer la fusion"}
                </button>
              </div>
            </ModalShell>
          )}
        </section>
      )}

      {step === "result" && result && (
        <section aria-labelledby="result-heading" className="space-y-4">
          <h2 id="result-heading" tabIndex={-1} ref={resultHeadingRef} className="text-lg font-semibold text-gray-900 focus:outline-none">
            Fusion effectuée
          </h2>
          <p className="text-sm text-gray-800">
            {result.counts.registrationsMoved} inscription{result.counts.registrationsMoved > 1 ? "s" : ""} déplacée{result.counts.registrationsMoved > 1 ? "s" : ""}, {result.counts.invitesMoved} invitation{result.counts.invitesMoved > 1 ? "s" : ""} déplacée{result.counts.invitesMoved > 1 ? "s" : ""}.
          </p>
          {result.resend && (
            <p className="text-sm text-gray-800">
              Liens envoyés à l&apos;adresse conservée : {result.resend.sent} réussi{result.resend.sent > 1 ? "s" : ""}, {result.resend.failed} en échec.
            </p>
          )}
          <Link href={`/admin/members/${member.id}`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Retour à la fiche de {member.firstName} {member.lastName}
          </Link>
        </section>
      )}
    </div>
  )
}

function ConflictItem({ conflict: c, choices, onChange }: { conflict: Conflict; choices: Choices; onChange: (c: Choices) => void }) {
  if (c.kind === "same_shift") {
    return <li>Les deux fiches étaient inscrites au créneau « {c.shiftLabel} » : {c.resolvedBy === "rank" ? "l'inscription la plus avancée est conservée, l'autre est annulée." : "une des deux inscriptions a été conservée (statuts équivalents), l'autre est annulée."}</li>
  }
  if (c.kind === "overlap") {
    return <li>Les créneaux « {c.labels[0]} » et « {c.labels[1]} » se chevauchent désormais pour cette personne. À vérifier après la fusion.</li>
  }
  if (c.kind === "role_limit") {
    return <li>Le poste « {c.roleName} » dépasse sa limite ({c.count} créneaux pour une limite de {c.limit}). À vérifier après la fusion.</li>
  }
  if (c.kind === "min_age") {
    return <li>Le créneau « {c.shiftLabel} » demande un âge minimum de {c.minAge} ans. À vérifier après la fusion.</li>
  }
  if (c.kind === "reserved_role") {
    return <li>Le créneau « {c.shiftLabel} » est réservé aux membres ayant une étiquette particulière, que cette fiche n&apos;a pas après fusion. À vérifier après la fusion.</li>
  }
  if (c.kind === "same_question") {
    return (
      <li>
        <fieldset>
          <legend>Les deux fiches ont répondu différemment à une même question. Quelle réponse garder ?{c.blocking ? " (obligatoire)" : ""}</legend>
          {(["keep", "absorb"] as const).map((choice) => (
            <label key={choice} className={`mr-4 inline-flex ${RADIO_ROW}`}>
              <input
                type="radio"
                name={`answer-${c.questionId}`}
                checked={choices.answerConflicts[c.questionId] === choice}
                onChange={() => onChange({ ...choices, answerConflicts: { ...choices.answerConflicts, [c.questionId]: choice } })}
              />
              {choice === "keep" ? "Garder la réponse actuelle" : "Prendre la réponse de la fiche absorbée"}
            </label>
          ))}
        </fieldset>
      </li>
    )
  }
  // same_event_invite
  return (
    <li>
      <fieldset>
        <legend>
          Les deux fiches ont été invitées au même événement{c.resolvedBy === "used_first" ? " (l'invitation déjà utilisée est conservée)" : ", laquelle garder ?"}
          {c.resolvedBy !== "used_first" && c.blocking ? " (obligatoire)" : ""}
        </legend>
        {c.resolvedBy !== "used_first" && (["keep", "absorb"] as const).map((choice) => (
          <label key={choice} className={`mr-4 inline-flex ${RADIO_ROW}`}>
            <input
              type="radio"
              name={`invite-${c.eventId}`}
              checked={choices.inviteConflicts[c.eventId] === choice}
              onChange={() => onChange({ ...choices, inviteConflicts: { ...choices.inviteConflicts, [c.eventId]: choice } })}
            />
            {choice === "keep" ? "Garder l'invitation actuelle" : "Prendre l'invitation de la fiche absorbée"}
          </label>
        ))}
      </fieldset>
    </li>
  )
}
