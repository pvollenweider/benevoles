"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import ShiftSelect from "./ShiftSelect"
import { blocksWorkload, newWorkloadNotices, type WorkloadMode } from "@/lib/workload-view"
import { availabilityLabel, hasAvailability } from "@/lib/availability"
import { addConflictMessage, chosenOverlapMessage, isAddFormPerson, MEMBER_CHOICES_SHOWN, memberChoiceLabel, memberResultsSentence, shiftsOfAddFormPerson, type MemberChoice, type ShiftRef } from "@/lib/registrations-list"
import type { AddFormValues, Registration } from "./types"
import { spokenShiftName } from "@/lib/spoken-time"
import { manualAddNotice, manualAddNoticeSentence } from "@/lib/manual-add-notice"
import { localDateTimeToUtc } from "@/lib/time-zone"

type Props = {
  eventId: string
  shifts: ShiftRef[]
  /** The registrations on the list, for the conflict, availability and workload hints. */
  registrations: Registration[]
  /** Organisation time zone, for the workload warnings (#465). */
  timeZone: string
  /** How the event judges workload (#465 warnings, or its #1171 protection); warnings by default. */
  workloadMode?: WorkloadMode
  /** The signed-in organizer's email: placing oneself sends no confirmation email (#916). */
  organizerEmail?: string | null
  /** The values typed so far: kept by the parent so they survive closing and reopening the form. */
  form: AddFormValues
  onFormChange: Dispatch<SetStateAction<AddFormValues>>
  /** The registrations the server created, one per shift chosen (#918). */
  onAdded: (regs: Registration[]) => void
  onCancel: () => void
}

// ── Manual registration by the organizer ─────────────────────────────────────
export default function ManualAddForm({ eventId, shifts, registrations, timeZone, workloadMode, organizerEmail = null, form: addForm, onFormChange: setAddForm, onAdded, onCancel }: Props) {
  // The request the role-limit warning is about: the override only applies to that exact form.
  const [overLimitFor, setOverLimitFor] = useState<string | null>(null)
  // Manual addition: what this shift would add to the workload of a volunteer already registered.
  const person = useMemo(() => ({ volunteerId: addForm.volunteerId, email: addForm.email }), [addForm.volunteerId, addForm.email])
  // Every shift chosen in the form (#918): the first one, then the « Créneau 2, 3… » lines; an
  // empty line is simply left out.
  const chosenIds = useMemo(() => [...new Set([addForm.shiftId, ...addForm.extraShiftIds].filter(Boolean))], [addForm.shiftId, addForm.extraShiftIds])
  const chosenShifts = useMemo(() => chosenIds.flatMap((id) => shifts.filter((s) => s.id === id)), [chosenIds, shifts])
  // On a protected event (#1171) the same check as the server's: what the addition creates or worsens,
  // on the confirmed places and pending requests; otherwise the non-blocking #465 warnings.
  const mode: WorkloadMode = useMemo(() => workloadMode ?? { kind: "warnings", timeZone }, [workloadMode, timeZone])
  const blocks = blocksWorkload(mode)
  const addWarnings = useMemo(() => {
    if (chosenShifts.length === 0) return []
    const counted = blocks ? ["active", "requested"] : ["active"]
    const held = registrations.filter((r) => counted.includes(r.status) && isAddFormPerson(r.volunteer, person) && !chosenIds.includes(r.shift.id))
    if (!blocks && held.length === 0 && chosenShifts.length === 1) return []
    return newWorkloadNotices(held.map((r) => r.shift), [...held.map((r) => r.shift), ...chosenShifts], mode).map((n) => n.text)
  }, [person, chosenIds, chosenShifts, registrations, mode, blocks])
  const overLimit = overLimitFor === JSON.stringify(addForm)
  // What the volunteer will receive (#916), said before submitting, once a shift is chosen. The
  // server decides the same way; « now » is the moment the form opened.
  const [openedAt] = useState(() => new Date())
  const notice = useMemo(() => {
    if (chosenShifts.length === 0) return null
    // Several shifts: an email leaves as soon as one of them is still to come.
    const shiftStart = new Date(Math.max(...chosenShifts.map((s) => localDateTimeToUtc(new Date(`${s.date}T00:00:00.000Z`), s.startTime, timeZone).getTime())))
    return manualAddNotice({ email: addForm.email, organizerEmail, shiftStart, now: openedAt })
  }, [chosenShifts, addForm.email, organizerEmail, timeZone, openedAt])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  // The form an error is about: once the organizer changes it (another shift, another person),
  // the error no longer applies and is hidden, instead of claiming a duplicate that is gone.
  const [errorFor, setErrorFor] = useState<string | null>(null)
  const showError = addError !== null && (overLimitFor !== null || errorFor === JSON.stringify(addForm))

  // « Membre existant » (#914): a person already in the member list is placed without retyping.
  const [query, setQuery] = useState("")
  const [choices, setChoices] = useState<MemberChoice[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  async function searchMembers() {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setSearchError(null)
    // Cleared first, so a second search with the same count is announced again.
    setAnnouncement("")
    try {
      const res = await fetch(`/api/admin/members?q=${encodeURIComponent(q)}`)
      if (!res.ok) { setChoices(null); setSearchError("La recherche a échoué. Réessayez."); return }
      const rows = (await res.json()) as MemberChoice[]
      setChoices(rows)
      requestAnimationFrame(() => setAnnouncement(memberResultsSentence(rows.length)))
    } catch {
      setChoices(null)
      setSearchError("Connexion interrompue : la recherche n'a pas abouti. Réessayez.")
    } finally {
      setSearching(false)
    }
  }

  function chooseMember(m: MemberChoice) {
    setAddForm((f) => ({ ...f, volunteerId: m.id, firstName: m.firstName, lastName: m.lastName, email: m.email ?? "", phone: m.phone ?? "" }))
    setChoices(null)
    setQuery("")
    setAnnouncement(`${m.firstName} ${m.lastName} choisi pour cette inscription. Choisissez le créneau.`)
    // Next step: the shift. The chosen person is summed up above it.
    requestAnimationFrame(() => document.getElementById("add-shift")?.focus())
  }

  function changeMember() {
    setAddForm((f) => ({ ...f, volunteerId: "", firstName: "", lastName: "", email: "", phone: "" }))
    setAnnouncement("Personne retirée. Cherchez un membre ou remplissez les champs.")
    requestAnimationFrame(() => searchRef.current?.focus())
  }
  // A submit was tried without a shift: the field is invalid until one is chosen (derived, so
  // choosing a shift clears it at once).
  const [shiftTried, setShiftTried] = useState(false)
  const shiftInvalid = shiftTried && !addForm.shiftId

  // Shifts already held by the volunteer identified by the email in the add form
  const volunteerShifts = useMemo<ShiftRef[] | undefined>(
    () => shiftsOfAddFormPerson(registrations, person),
    [person, registrations]
  )

  // Availability of the person being added by hand, when their email matches someone already on
  // the event (#402): the organizer sees it before picking the shift.
  const knownVolunteer = useMemo(
    () => registrations.find((r) => isAddFormPerson(r.volunteer, person))?.volunteer,
    [person, registrations]
  )

  const selectedShiftObj = useMemo(
    () => (addForm.shiftId ? shifts.find(s => s.id === addForm.shiftId) ?? null : null),
    [addForm.shiftId, shifts]
  )

  // A chosen shift that the person already holds or that overlaps one of theirs, else one that
  // overlaps another shift chosen in this form. A warning: the add stays possible.
  function conflictOf(shiftId: string): string | null {
    const selected = shifts.find((s) => s.id === shiftId) ?? null
    return addConflictMessage(selected, volunteerShifts) ?? chosenOverlapMessage(selected, chosenShifts)
  }
  const conflictMessage = selectedShiftObj ? conflictOf(selectedShiftObj.id) : null
  // The shifts a line offers: not those already chosen on another line.
  const offeredFor = (shiftId: string) => shifts.filter((s) => s.id === shiftId || !chosenIds.includes(s.id))

  const addAnotherRef = useRef<HTMLButtonElement>(null)
  function addShiftLine() {
    const n = addForm.extraShiftIds.length + 2
    setAddForm((f) => ({ ...f, extraShiftIds: [...f.extraShiftIds, ""] }))
    requestAnimationFrame(() => document.getElementById(`add-shift-${n}`)?.focus())
  }
  // Said once, through the form's status: cleared first so the same sentence twice is still read.
  function say(sentence: string) {
    setAnnouncement("")
    requestAnimationFrame(() => setAnnouncement(sentence))
  }
  // A shift just chosen that overlaps: its warning describes the field, but a description that
  // appears on the focused field is not read again, so it is also said once.
  function chooseShift(apply: (f: AddFormValues) => AddFormValues, id: string) {
    setAddForm(apply)
    const warning = id ? conflictOf(id) : null
    if (warning) say(warning)
  }
  function setShiftLine(index: number, id: string) {
    chooseShift((f) => ({ ...f, extraShiftIds: f.extraShiftIds.map((v, i) => (i === index ? id : v)) }), id)
  }
  function removeShiftLine(index: number) {
    const removed = shifts.find((s) => s.id === addForm.extraShiftIds[index])
    const renumbered = index < addForm.extraShiftIds.length - 1
    setAddForm((f) => ({ ...f, extraShiftIds: f.extraShiftIds.filter((_, i) => i !== index) }))
    say(`Créneau ${index + 2}${removed ? ` (${spokenShiftName(removed)})` : ""} retiré.${renumbered ? " Les créneaux suivants sont renumérotés." : ""}`)
    requestAnimationFrame(() => addAnotherRef.current?.focus())
  }

  async function handleAdd(e: React.FormEvent | null, allowOverLimit = false) {
    e?.preventDefault()
    if (adding) return
    if (!addForm.shiftId) {
      // The message is tied to the field, not an alert: focus moves there once the field says it
      // is invalid, so the message is read once, with the field.
      setShiftTried(true)
      setAddError(null)
      setErrorFor(null)
      setOverLimitFor(null)
      requestAnimationFrame(() => document.getElementById("add-shift")?.focus())
      return
    }
    setAdding(true)
    // Forcing past the role limit: the alert and its button stay until the answer, so focus stays put.
    if (!allowOverLimit) { setAddError(null); setErrorFor(null); setOverLimitFor(null) }

    const res = await fetch("/api/admin/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        volunteerId: addForm.volunteerId,
        firstName: addForm.firstName,
        lastName: addForm.lastName,
        email: addForm.email,
        phone: addForm.phone,
        comment: addForm.comment,
        shiftIds: chosenIds,
        ...(allowOverLimit ? { allowOverLimit: true } : {}),
      }),
    })

    const data = await res.json()
    setAdding(false)

    // The role's limit per person (#466): the organiser may go over it, after reading why.
    if (res.status === 409 && data.code === "role_limit") { setAddError(data.error); setOverLimitFor(JSON.stringify(addForm)); return }
    setOverLimitFor(null)
    if (!res.ok) { setAddError(data.error ?? "Erreur."); setErrorFor(JSON.stringify(addForm)); return }
    setAddError(null)
    setErrorFor(null)

    const created = data.registrations as {
      id: string; status: string; source: string; comment: string | null; createdAt: string; waitingPosition?: number | null
      volunteer: Registration["volunteer"]
      shift: { id: string; roleName: string; label: string; date: string; startTime: string; endTime: string; capacity?: number }
    }[]
    onAdded(created.map((reg) => {
      const shiftRef = shifts.find((s) => s.id === reg.shift.id)
      return {
        id: reg.id,
        status: reg.status,
        source: reg.source,
        comment: reg.comment,
        createdAt: reg.createdAt,
        waitingPosition: reg.waitingPosition ?? null,
        volunteer: reg.volunteer,
        // A registration just created client-side can't already be flagged as a sector leader —
        // that comes from a server-side join against SectorLeader the manual-add response doesn't
        // carry, and "just registered" is never simultaneously "registered a while ago and later
        // made a leader" (see registrations/page.tsx's initial computation of this field).
        isLeader: false,
        shift: {
          id: reg.shift.id,
          roleName: reg.shift.roleName,
          label: reg.shift.label,
          date: reg.shift.date.split("T")[0],
          startTime: reg.shift.startTime,
          endTime: reg.shift.endTime,
          capacity: shiftRef?.capacity ?? reg.shift.capacity ?? 0,
          registrationCount: (shiftRef?.registrationCount ?? 0) + 1,
        },
      }
    }))
  }

  return (
    <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-800">Inscription manuelle</h3>
      {/* Always mounted, so the search results and the choice are announced. */}
      <p role="status" className="sr-only">{announcement}</p>
      {addForm.volunteerId ? (
        <div role="group" aria-labelledby="add-member-chosen-label" className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3">
          <p id="add-member-chosen-label" className="text-xs font-medium text-gray-600">Membre choisi</p>
          <p className="text-sm text-gray-900 mt-0.5">
            <span className="font-medium">{addForm.firstName} {addForm.lastName}</span>
            {addForm.email && <span>, {addForm.email}</span>}
            {addForm.phone && <span>, {addForm.phone}</span>}
          </p>
          {knownVolunteer && hasAvailability(knownVolunteer) && (
            <p className="text-xs text-gray-700 mt-1">Disponible en général : {availabilityLabel(knownVolunteer)}</p>
          )}
          <button type="button" onClick={changeMember} className="mt-2 min-h-11 sm:min-h-6 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Changer de personne
          </button>
        </div>
      ) : (
      <>
      <div>
        <label htmlFor="add-member-search" className="block text-xs font-medium text-gray-600 mb-1">Membre existant</label>
        <p id="add-member-hint" className="text-xs text-gray-700 mb-1">Cherchez par nom ou email une personne de la liste des membres, ou remplissez les champs ci-dessous pour une nouvelle personne.</p>
        <div className="flex gap-2">
          <input
            ref={searchRef}
            id="add-member-search"
            type="search"
            value={query}
            aria-describedby="add-member-hint"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            // Inside the add form: Enter searches instead of submitting the registration.
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchMembers() } }}
            placeholder="Nom ou email"
            className="input flex-1"
          />
          <button type="button" onClick={searchMembers} aria-disabled={searching || undefined} className={`min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${searching ? "opacity-60 cursor-wait" : ""}`}>
            {searching ? "Recherche…" : "Chercher"}
          </button>
        </div>
        {searchError && <p role="alert" className="text-xs text-red-700 mt-1">{searchError}</p>}
        {choices && choices.length > 0 && (
          <ul role="list" aria-label="Membres trouvés" className="mt-2 space-y-1">
            {choices.slice(0, MEMBER_CHOICES_SHOWN).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-1.5">
                <span className="text-sm text-gray-900 min-w-0 break-words">{memberChoiceLabel(m)}</span>
                <button type="button" onClick={() => chooseMember(m)} className="shrink-0 min-h-11 sm:min-h-6 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  Choisir<span className="sr-only"> {m.firstName} {m.lastName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {choices && choices.length > MEMBER_CHOICES_SHOWN && (
          <p className="text-xs text-gray-700 mt-1">{choices.length} membres trouvés, les {MEMBER_CHOICES_SHOWN} premiers affichés : précisez la recherche.</p>
        )}
        {choices && choices.length === 0 && <p className="text-xs text-gray-700 mt-1">Aucun membre trouvé.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="add-firstname" className="block text-xs font-medium text-gray-600 mb-1">Prénom <span aria-hidden="true">*</span></label>
          <input id="add-firstname" type="text" required value={addForm.firstName} onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))} className="input" />
        </div>
        <div>
          <label htmlFor="add-lastname" className="block text-xs font-medium text-gray-600 mb-1">Nom <span aria-hidden="true">*</span></label>
          <input id="add-lastname" type="text" required value={addForm.lastName} onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))} className="input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="add-email" className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input id="add-email" type="email" value={addForm.email} aria-describedby={knownVolunteer && hasAvailability(knownVolunteer) ? "add-email-availability" : undefined} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className="input" />
          {/* Always mounted, so the polite region announces the text when it appears. */}
          <p id="add-email-availability" aria-live="polite" className={knownVolunteer && hasAvailability(knownVolunteer) ? "text-xs text-gray-700 mt-1" : "sr-only"}>
            {knownVolunteer && hasAvailability(knownVolunteer) ? `Disponible en général : ${availabilityLabel(knownVolunteer)}` : ""}
          </p>
        </div>
        <div>
          <label htmlFor="add-phone" className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
          <input id="add-phone" type="tel" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} className="input" />
        </div>
      </div>
      </>
      )}
      <div>
        <p id="add-shift-label" className="block text-xs font-medium text-gray-600 mb-1">Créneau <span aria-hidden="true">*</span></p>
        <ShiftSelect
          id="add-shift"
          labelledBy="add-shift-label"
          required
          invalid={shiftInvalid}
          // The conflict is a warning, not an error: it describes the field without making it invalid.
          describedBy={[shiftInvalid && "add-shift-error", conflictMessage && "add-shift-conflict"].filter(Boolean).join(" ") || undefined}
          shifts={offeredFor(addForm.shiftId)}
          value={addForm.shiftId}
          onChange={(id) => chooseShift((f) => ({ ...f, shiftId: id }), id)}
          placeholder="Sélectionner un créneau…"
          existingShifts={volunteerShifts}
        />
        {shiftInvalid && <p id="add-shift-error" className="text-xs text-red-700 mt-1">Sélectionnez un créneau.</p>}
        {conflictMessage && (
          <p id="add-shift-conflict" className="text-xs text-orange-800 mt-1 ml-0.5">{conflictMessage}</p>
        )}
      </div>
      {/* More shifts for the same person (#918): one line each, all added together. */}
      {addForm.extraShiftIds.map((id, index) => {
        const n = index + 2
        const lineConflict = id ? conflictOf(id) : null
        return (
          <div key={index}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <p id={`add-shift-${n}-label`} className="block text-xs font-medium text-gray-600">Créneau {n} (facultatif)</p>
              <button type="button" onClick={() => removeShiftLine(index)} className="min-h-11 sm:min-h-6 text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                Retirer<span className="sr-only"> le créneau {n}</span>
              </button>
            </div>
            <ShiftSelect
              id={`add-shift-${n}`}
              labelledBy={`add-shift-${n}-label`}
              describedBy={lineConflict ? `add-shift-${n}-conflict` : undefined}
              shifts={offeredFor(id)}
              value={id}
              onChange={(value) => setShiftLine(index, value)}
              placeholder="Sélectionner un créneau…"
              existingShifts={volunteerShifts}
            />
            {lineConflict && <p id={`add-shift-${n}-conflict`} className="text-xs text-orange-800 mt-1 ml-0.5">{lineConflict}</p>}
          </div>
        )
      })}
      {addForm.extraShiftIds.length < 29 && (
        <button ref={addAnotherRef} type="button" onClick={addShiftLine} className="min-h-11 sm:min-h-6 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          + Ajouter un autre créneau
        </button>
      )}
      <div>
        <label htmlFor="add-comment" className="block text-xs font-medium text-gray-600 mb-1">Note</label>
        <input id="add-comment" type="text" value={addForm.comment} onChange={(e) => setAddForm((f) => ({ ...f, comment: e.target.value }))} className="input" placeholder="ex. Inscrit par téléphone" />
      </div>

      {/* Always mounted, so the warning is announced when the email and shift make it appear. */}
      <div id="add-workload" role="status" className={addWarnings.length > 0 ? "" : "sr-only"}>
        {addWarnings.length > 0 && (blocks ? (
          <div className="bg-red-50 border border-red-300 rounded-xl p-3 text-sm text-red-800">
            <p className="font-semibold">L&apos;ajout sera refusé : {chosenShifts.length > 1 ? "avec ces créneaux" : "avec ce créneau"}, le programme de cette personne ne respecterait plus les limites de pauses et de charge de l&apos;événement.</p>
            <ul role="list" className="mt-1 space-y-0.5">{addWarnings.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="mt-1">Choisissez un autre créneau ou une autre personne.</p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-950">
            <p className="font-medium">{chosenShifts.length > 1 ? "Si vous ajoutez ces créneaux" : "Si vous ajoutez ce créneau"}, cette personne aura :</p>
            <ul role="list" className="mt-1 space-y-0.5">{addWarnings.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="mt-1">L&apos;ajout reste possible.</p>
          </div>
        ))}
      </div>
      {showError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <p id="add-error">{addError}</p>
          {overLimitFor !== null && !overLimit && <p className="mt-1">Le formulaire a changé : validez à nouveau.</p>}
          {overLimit && (
            <button type="button" onClick={() => { if (!adding) handleAdd(null, true) }} aria-disabled={adding || undefined} aria-describedby="add-error" className={`mt-2 min-h-11 sm:min-h-6 text-sm font-medium text-red-800 underline underline-offset-2 hover:text-red-950 ${adding ? "opacity-60 cursor-wait" : ""}`}>
              {adding ? "Ajout en cours…" : "Ajouter quand même"}
            </button>
          )}
        </div>
      )}

      {notice && <p id="add-notice" className="text-sm text-gray-700">{manualAddNoticeSentence(notice)}</p>}
      <div className="flex gap-3">
        <button type="submit" aria-disabled={adding || undefined} aria-describedby={[addWarnings.length > 0 && "add-workload", notice && "add-notice"].filter(Boolean).join(" ") || undefined} className={`min-h-11 sm:min-h-6 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 ${adding ? "opacity-60 cursor-wait" : ""}`}>
          {adding ? "Ajout en cours…" : "Ajouter"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 sm:min-h-6 text-gray-500 px-3 py-2 text-sm hover:text-gray-800">Annuler</button>
      </div>
    </form>
  )
}
