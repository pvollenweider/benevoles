"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import ModalShell from "./ModalShell"
import {
  candidateReasons, exclusionSentence, findCandidates, placesLeftLabel, shiftDay, shiftHours, shiftName,
  OPEN_SHIFTS_MAX_RECIPIENTS, OPEN_SHIFTS_NOTE_MAX,
  type EventShiftRef, type InviteRef, type LiveRegistration, type OpenShift, type PoolMember,
} from "@/lib/open-shifts"

type Props = {
  eventId: string
  /** Underfilled shifts, in time order. */
  shifts: OpenShift[]
  eventShifts: EventShiftRef[]
  members: PoolMember[]
  registrations: LiveRegistration[]
  invites: InviteRef[]
  tags: string[]
  initialShiftIds: string[]
}

type DryRun = { recipients: number; skipped: number; noLongerOpen: number; newInvitations: number; audience: string; previewName: string; preview: { subject: string; html: string } }
type Sent = { sent: number; skipped: number; noLongerOpen: number; newInvitations: number; audience: string }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const people = (n: number) => `${n} personne${n > 1 ? "s" : ""}`
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr")

/**
 * The shifts to propose, the members with the reasons they're listed, a manual selection, a
 * preview, then one email per person (#566). Nothing is ever ticked by the page itself.
 */
export default function OpenShiftsFinder({ eventId, shifts, eventShifts, members, registrations, invites, tags, initialShiftIds }: Props) {
  const router = useRouter()
  const id = useId()
  const [shiftIds, setShiftIds] = useState<Set<string>>(() => new Set(initialShiftIds))
  const [tag, setTag] = useState("")
  const [search, setSearch] = useState("")
  const [includeDeclined, setIncludeDeclined] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState("")
  const [dry, setDry] = useState<DryRun | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const resultRef = useRef<HTMLHeadingElement>(null)
  const shiftsHeadingRef = useRef<HTMLHeadingElement>(null)
  const [restarts, setRestarts] = useState(0)

  const chosenShifts = useMemo(() => shifts.filter((s) => shiftIds.has(s.id)), [shifts, shiftIds])
  const anyDeclined = invites.some((i) => i.declined)
  // Every member that could be written to for these shifts, whatever the tag shown: a person ticked
  // under one tag stays ticked when the filter changes.
  const all = useMemo(
    () => findCandidates({ shifts: chosenShifts, eventShifts, members, registrations, invites, includeDeclined }),
    [chosenShifts, eventShifts, members, registrations, invites, includeDeclined],
  )
  const view = useMemo(
    () => (tag ? findCandidates({ shifts: chosenShifts, eventShifts, members, registrations, invites, includeDeclined, tag }) : all),
    [all, tag, chosenShifts, eventShifts, members, registrations, invites, includeDeclined],
  )
  const q = fold(search.trim())
  const listed = q ? view.candidates.filter((c) => fold(`${c.member.firstName} ${c.member.lastName}`).includes(q)) : view.candidates
  const chosen = all.candidates.filter((c) => c.selectable && selected.has(c.member.id))
  const excludedText = exclusionSentence(view.excluded)
  const tooMany = chosen.length > OPEN_SHIFTS_MAX_RECIPIENTS
  const canPreview = chosenShifts.length > 0 && chosen.length > 0 && !tooMany
  const countText = chosenShifts.length === 0
    ? ""
    : listed.length === 0 ? "Aucun membre à proposer avec ces critères." : `${listed.length} membre${listed.length > 1 ? "s" : ""} listé${listed.length > 1 ? "s" : ""}.`
  // The live count is voiced once the filters settle (500 ms after the last change), not at
  // every keystroke; ticking a box changes nothing in it.
  const [announcedCount, setAnnouncedCount] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setAnnouncedCount(countText), 500)
    return () => clearTimeout(t)
  }, [countText])

  // Layout effects: they run before ModalShell gives the focus back to a trigger that is gone.
  useLayoutEffect(() => { if (sent) resultRef.current?.focus() }, [sent])
  // « Chercher pour d'autres créneaux » unmounts itself: land on the shifts.
  useLayoutEffect(() => { if (restarts > 0) shiftsHeadingRef.current?.focus() }, [restarts])

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  const body = (dryRun: boolean) => JSON.stringify({
    shiftIds: chosenShifts.map((s) => s.id),
    volunteerIds: chosen.map((c) => c.member.id),
    note: note.trim() || undefined,
    includeDeclined,
    dryRun,
  })

  async function preview() {
    if (!canPreview || loadingPreview) return
    setLoadingPreview(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/open-shifts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body(true) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(typeof d?.error === "string" ? d.error : "L'aperçu n'a pas pu être préparé."); return }
      setDry(d)
    } catch {
      setError("L'aperçu n'a pas pu être préparé. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoadingPreview(false)
    }
  }

  async function send() {
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/open-shifts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body(false) })
      const d = await res.json().catch(() => ({}))
      setDry(null)
      if (!res.ok) { setError(`${typeof d?.error === "string" ? d.error : "L'envoi a échoué."} Votre sélection est conservée.`); return }
      setSent(d)
      setSelected(new Set())
      setNote("")
      router.refresh()
    } catch {
      setDry(null)
      setError("L'envoi a échoué. Vérifiez votre connexion ; votre sélection est conservée.")
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <section aria-labelledby={`${id}-done`} className="bg-white rounded-2xl border border-green-200 p-5 space-y-3">
        <h2 id={`${id}-done`} ref={resultRef} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">
          Email envoyé à {people(sent.sent)}
        </h2>
        <p className="text-sm text-gray-700">
          Destinataires : {sent.audience}. L&apos;envoi se fait dans la minute ; un email qui échoue est renvoyé automatiquement.
          {sent.newInvitations > 0 && ` ${sent.newInvitations} invitation${sent.newInvitations > 1 ? "s ont été créées" : " a été créée"} pour les membres qui n'étaient pas encore invités.`}
          {sent.skipped > 0 && ` ${people(sent.skipped)} cochée${sent.skipped > 1 ? "s n'ont" : " n'a"} rien reçu : plus rien à leur proposer.`}
          {sent.noLongerOpen > 0 && ` ${sent.noLongerOpen} créneau${sent.noLongerOpen > 1 ? "x complets entre-temps n'ont pas été proposés" : " complet entre-temps n'a pas été proposé"}.`}
        </p>
        <p className="text-sm flex flex-wrap gap-x-4 gap-y-2">
          <Link href={`/admin/events/${eventId}/message`} className={linkClass}>Voir les messages envoyés</Link>
          <Link href={`/admin/events/${eventId}/staffing`} className={linkClass}>Retour à Où manque-t-il du monde ?</Link>
          <button type="button" onClick={() => { setSent(null); setRestarts((n) => n + 1) }} className={linkClass}>Chercher pour d&apos;autres créneaux</button>
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${id}-shifts`} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 id={`${id}-shifts`} ref={shiftsHeadingRef} tabIndex={-1} className="text-base font-semibold text-gray-900 focus:outline-none">Créneaux à proposer</h2>
        <p id={`${id}-shifts-hint`} className="text-sm text-gray-600">Les créneaux qui manquent de monde, par date. Chaque personne ne reçoit que ceux qu&apos;elle peut prendre.</p>
        <div role="group" aria-labelledby={`${id}-shifts`} aria-describedby={`${id}-shifts-hint`}>
        <ul role="list" className="space-y-1">
          {shifts.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-1">
              <input
                id={`${id}-shift-${s.id}`}
                type="checkbox"
                checked={shiftIds.has(s.id)}
                onChange={() => setShiftIds((prev) => toggle(prev, s.id))}
                aria-describedby={`${id}-shift-${s.id}-detail`}
                className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <div className="min-w-0 text-sm">
                <label htmlFor={`${id}-shift-${s.id}`} className="font-medium text-gray-900">{shiftName(s)}, {shiftDay(s.date, "short")}, {shiftHours(s)}</label>
                <p id={`${id}-shift-${s.id}-detail`} className="text-gray-700">
                  {placesLeftLabel(s.placesLeft)}
                  {(s.reservedTags ?? []).length > 0 && `, poste réservé aux tags ${s.reservedTags!.join(", ")}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
        </div>
      </section>

      <section aria-labelledby={`${id}-members`} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 id={`${id}-members`} className="text-base font-semibold text-gray-900">Membres</h2>
        {/* Always mounted, so the first announcement isn't lost. */}
        <p role="status" aria-atomic="true" className="sr-only">{announcedCount}</p>
        {chosenShifts.length === 0 ? (
          <p className="text-sm text-gray-700">Cochez au moins un créneau pour voir les membres à qui le proposer.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={`${id}-tag`} className="block text-sm font-medium text-gray-700 mb-1">Tag</label>
                <select id={`${id}-tag`} value={tag} onChange={(e) => setTag(e.target.value)} className="input min-w-40">
                  <option value="">Tous les membres</option>
                  {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-48">
                <label htmlFor={`${id}-search`} className="block text-sm font-medium text-gray-700 mb-1">Rechercher un nom</label>
                <input id={`${id}-search`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="input w-full" />
              </div>
            </div>
            {anyDeclined && (
              <div className="flex items-start gap-2">
                <input id={`${id}-declined`} type="checkbox" checked={includeDeclined} onChange={(e) => setIncludeDeclined(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
                <label htmlFor={`${id}-declined`} className="text-sm text-gray-800">Afficher aussi les membres qui ont répondu « pas disponible »</label>
              </div>
            )}

            <div className="text-sm text-gray-700 space-y-1">
              <p>
                {listed.length === 0 ? "Aucun membre à proposer avec ces critères." : `${listed.length} membre${listed.length > 1 ? "s" : ""} listé${listed.length > 1 ? "s" : ""}, par nom.`}
                {" "}{chosen.length === 0 ? "Personne n'est coché." : `${people(chosen.length)} cochée${chosen.length > 1 ? "s" : ""}.`}
              </p>
              {excludedText && <p>{excludedText}</p>}
            </div>
            <p className="text-xs text-gray-600">La disponibilité générale est indicative : elle a été donnée par le membre une fois pour toutes, elle ne confirme rien pour ces créneaux.</p>

            {listed.length > 0 && (
              <div role="group" aria-label="Membres à qui proposer ces créneaux">
              <ul role="list" className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                {listed.map((c) => {
                  const cb = `${id}-m-${c.member.id}`
                  const overlap = c.fits.some((f) => f.status === "overlap")
                  const reasons = candidateReasons(c, chosenShifts)
                  return (
                    <li key={c.member.id} className={`flex items-start gap-3 px-4 py-3 ${c.selectable ? "" : "bg-gray-50"}`}>
                      <input
                        id={cb}
                        type="checkbox"
                        checked={c.selectable && selected.has(c.member.id)}
                        // aria-disabled, not disabled: the box stays reachable with Tab, its reasons with it.
                        aria-disabled={!c.selectable || undefined}
                        onChange={() => { if (c.selectable) setSelected((prev) => toggle(prev, c.member.id)) }}
                        aria-describedby={`${cb}-reasons`}
                        className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0 text-sm">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <label htmlFor={cb} className="font-medium text-gray-900">{c.member.firstName} {c.member.lastName}</label>
                          {overlap && (
                            <span className="rounded-full bg-amber-50 border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-900">Chevauchement</span>
                          )}
                        </div>
                        <ul role="list" id={`${cb}-reasons`} className="mt-1 space-y-0.5 text-gray-700">
                          {!c.selectable && <li className="font-medium text-gray-900">Rien à lui proposer parmi ces créneaux.</li>}
                          {reasons.map((r) => <li key={r}>{r}</li>)}
                        </ul>
                      </div>
                    </li>
                  )
                })}
              </ul>
              </div>
            )}
            {/* Always there, so the focus never falls to the page when it empties the selection. */}
            <button type="button" aria-disabled={chosen.length === 0 || undefined} onClick={() => setSelected(new Set())} className={`text-sm ${linkClass} ${chosen.length === 0 ? "opacity-60 cursor-not-allowed" : ""}`}>Tout décocher</button>
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-send`} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 id={`${id}-send`} className="text-base font-semibold text-gray-900">Email</h2>
        <div>
          <label htmlFor={`${id}-note`} className="block text-sm font-medium text-gray-700 mb-1">Un mot pour accompagner (facultatif)</label>
          <textarea id={`${id}-note`} rows={3} value={note} maxLength={OPEN_SHIFTS_NOTE_MAX} onChange={(e) => setNote(e.target.value)} aria-describedby={`${id}-note-hint`} className="input w-full" />
          <p id={`${id}-note-hint`} className="text-xs text-gray-600 mt-1">Ajouté en tête de l&apos;email, avant la liste des créneaux. {note.length}/{OPEN_SHIFTS_NOTE_MAX} caractères.</p>
        </div>
        {tooMany && <p id={`${id}-too-many`} className="text-sm text-red-700">{OPEN_SHIFTS_MAX_RECIPIENTS} personnes au plus par envoi : décochez-en {chosen.length - OPEN_SHIFTS_MAX_RECIPIENTS}.</p>}
        {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={preview}
            aria-disabled={!canPreview || loadingPreview || undefined}
            aria-describedby={tooMany ? `${id}-send-hint ${id}-too-many` : `${id}-send-hint`}
            className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${canPreview && !loadingPreview ? "" : "opacity-50 cursor-not-allowed"}`}
          >
            {loadingPreview ? "Préparation de l'aperçu…" : "Voir l'aperçu et envoyer"}
          </button>
          <span role="status" className="sr-only">{loadingPreview ? "Préparation de l'aperçu…" : ""}</span>
          <p id={`${id}-send-hint`} className="text-sm text-gray-700">
            {chosenShifts.length === 0 ? "Cochez au moins un créneau." : chosen.length === 0 ? "Cochez au moins une personne." : `${people(chosen.length)}, ${chosenShifts.length} créneau${chosenShifts.length > 1 ? "x" : ""}.`}
          </p>
        </div>
      </section>

      {dry && (
        <ModalShell
          title="Aperçu de l'email"
          onClose={() => { if (!sending) setDry(null) }}
          panelClassName="max-w-2xl"
          closeOnBackdrop={false}
          initialFocusRef={cancelRef}
          describedBy={`${id}-confirm-text`}
          busy={sending}
        >
          <div className="space-y-3" aria-busy={sending}>
            <p className="text-sm text-gray-700">Tel que le recevra {dry.previewName} ; chaque personne voit seulement les créneaux qu&apos;elle peut prendre, avec son propre lien.</p>
            <p className="text-sm"><span className="font-medium">Objet :</span> {dry.preview.subject}</p>
            <iframe title="Contenu de l'email" sandbox="" srcDoc={dry.preview.html} className="w-full h-[50vh] max-h-[28rem] border border-gray-200 rounded-lg bg-white" />
            <p id={`${id}-confirm-text`} className="text-sm text-gray-800">
              L&apos;email part à <strong>{people(dry.recipients)}</strong> ({dry.audience}).
              {dry.newInvitations > 0 && ` ${dry.newInvitations} invitation${dry.newInvitations > 1 ? "s seront créées" : " sera créée"} pour les membres pas encore invités.`}
              {dry.skipped > 0 && ` ${people(dry.skipped)} cochée${dry.skipped > 1 ? "s ne recevront" : " ne recevra"} rien : plus rien à leur proposer.`}
              {dry.noLongerOpen > 0 && ` ${dry.noLongerOpen} créneau${dry.noLongerOpen > 1 ? "x sont complets" : " est complet"} depuis l'ouverture de la page et ne sera pas proposé.`}
              {" "}Cet envoi ne peut pas être annulé.
            </p>
            <div className="flex flex-wrap gap-3 justify-end">
              <button ref={cancelRef} type="button" aria-disabled={sending || undefined} onClick={() => { if (!sending) setDry(null) }} className="text-sm text-gray-700 px-3 py-2 rounded hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                Retour à la sélection
              </button>
              <button type="button" aria-disabled={sending || undefined} onClick={send} className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${sending ? "opacity-50" : ""}`}>
                {sending ? "Envoi…" : `Envoyer à ${people(dry.recipients)}`}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
