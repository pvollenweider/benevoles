"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { announce } from "@/lib/announce"
import { UNDO_MS, useDelayedAction } from "@/lib/use-delayed-action"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { bulkCancelRecap, bulkLeaderRecap, bulkResendRecap, logLinkFor, type ActionRecap } from "@/lib/action-recap"
import { describeBulkFailure } from "@/lib/form-errors"
import { useState, useMemo, useRef, useId } from "react"
import ShiftSelect from "./registrations/ShiftSelect"
import MakeLeaderModal from "./registrations/MakeLeaderModal"
import ManualAddForm from "./registrations/ManualAddForm"
import RequestDecisionModal from "./registrations/RequestDecisionModal"
import BulkActionsBar from "./registrations/BulkActionsBar"
import UndoRemovalBar, { type HoldReason } from "./registrations/UndoRemovalBar"
import RegistrationRow from "./registrations/RegistrationRow"
import { EMPTY_ADD_FORM, personName, type AddFormValues, type Registration } from "./registrations/types"
import { workloadByVolunteer } from "@/lib/workload"
import {
  cancelAnnouncement,
  heldAnnouncement,
  undoneAnnouncement,
  filterRegistrations,
  leaderAnnouncement as leaderAddedAnnouncement,
  leaderRoleOptions,
  manualAddAnnouncement,
  resendAnnouncement,
  type ShiftRef,
} from "@/lib/registrations-list"

type Props = {
  eventId: string
  initialRegistrations: Registration[]
  shifts: ShiftRef[]
  initialShiftFilter?: string
  /** `?q=` from the global search (#377). */
  initialSearch?: string
  /** `?demandes=1`: open on the requests waiting for a decision (#484). */
  initialRequestsOnly?: boolean
  /** Organisation time zone, for the workload warnings (#465). */
  timeZone: string
  /** Answers to the event's custom questions (#483), by volunteer. */
  answersByVolunteer?: Record<string, { label: string; text: string }[]>
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RegistrationsManager({ eventId, initialRegistrations, shifts, initialShiftFilter, initialSearch, initialRequestsOnly = false, timeZone, answersByVolunteer = {} }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>(initialRegistrations)
  // Non-blocking workload warnings per volunteer (#465), from the active registrations shown here.
  const workload = useMemo(
    () => workloadByVolunteer(registrations.map((r) => ({ volunteerId: r.volunteer.id, status: r.status, shift: r.shift })), timeZone),
    [registrations, timeZone],
  )
  const [search, setSearch] = useState(initialSearch ?? "")
  const initialShift = initialShiftFilter ? shifts.find(s => s.id === initialShiftFilter) ?? null : null
  const [roleFilter, setRoleFilter] = useState(initialShift?.roleName ?? "")
  const [shiftFilter, setShiftFilter] = useState(initialShiftFilter ?? "")
  const [showAddForm, setShowAddForm] = useState(false)
  const [requestsOnly, setRequestsOnly] = useState(initialRequestsOnly)
  const requestsFilterRef = useRef<HTMLInputElement>(null)
  // Sign-up approval (#484): the request being accepted or refused (the dialog owns the message).
  const [decision, setDecision] = useState<{ reg: Registration; kind: "accept" | "refuse" } | null>(null)
  // Manual addition (#402, #465, #466): what has been typed so far, kept while the form is closed.
  const [addForm, setAddForm] = useState<AddFormValues>(EMPTY_ADD_FORM)
  // Each click on « + Ajouter manuellement » starts the form afresh (no error left from before).
  const [addFormOpenings, setAddFormOpenings] = useState(0)
  // The form unmounts on « Annuler » or after an add: the focus goes back to its open button.
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const shiftFilterLabelId = useId()
  const [leaderTarget, setLeaderTarget] = useState<{
    volunteerId: string; volunteerName: string; volunteerEmail: string | null; roleOptions: string[]; defaultRole: string
  } | null>(null)
  const [leaderAnnouncement, setLeaderAnnouncement] = useState("")
  const [bulkError, setBulkError] = useState<string | null>(null)
  // After a bulk action the toolbar unmounts with the selection: focus lands here instead of body.
  const afterBulkRef = useRef<HTMLParagraphElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // The last failed bulk action, so « Réessayer » repeats it on the selection that was kept (#375).
  const [retry, setRetry] = useState<(() => void) | null>(null)
  // A sensitive action waits for its confirmation (#379): the recap of what it does, then run.
  const [pending, setPending] = useState<{ recap: ActionRecap; run: () => Promise<void> } | null>(null)
  // Where the last action's entries are in the event log.
  const [lastLogLink, setLastLogLink] = useState<string | null>(null)
  // A bulk removal is committed after an undo window (#379): the rows leave the list at once,
  // the request is sent when the window closes, « Annuler » puts them back.
  const undo = useDelayedAction()
  const [held, setHeld] = useState<Registration[]>([])
  const undoRef = useRef<HTMLButtonElement>(null)
  const orderRef = useRef(new Map(initialRegistrations.map((r, i) => [r.id, i])))
  // The countdown waits while the focus or the pointer is on the bar (WCAG 2.2.1).
  const holdReasons = useRef(new Set<HoldReason>())
  function holdWindow(reason: HoldReason) { holdReasons.current.add(reason); undo.pause() }
  function releaseWindow(reason: HoldReason) { holdReasons.current.delete(reason); if (holdReasons.current.size === 0) undo.resume() }

  const uniqueRoles = [...new Set(shifts.map(s => s.roleName))]
  const visibleShifts = roleFilter ? shifts.filter(s => s.roleName === roleFilter) : shifts

  const filtered = filterRegistrations(registrations, { search, role: roleFilter, shiftId: shiftFilter, requestsOnly })
  const requestCount = registrations.filter((r) => r.status === "requested").length

  function openDecision(reg: Registration, kind: "accept" | "refuse") {
    setDecision({ reg, kind })
  }

  // The decision is recorded: the list follows, the outcome is announced, the focus moves on.
  function handleDecided(reg: Registration, kind: "accept" | "refuse", startedAt: Date) {
    setDecision(null)
    // A refused request leaves the list (it no longer holds a spot); an accepted one stays, confirmed.
    setRegistrations((prev) => kind === "accept" ? prev.map((r) => (r.id === reg.id ? { ...r, status: "active" } : r)) : prev.filter((r) => r.id !== reg.id))
    setLastLogLink(logLinkFor(eventId, startedAt))
    announce(setLeaderAnnouncement, kind === "accept"
      ? `Demande de ${personName(reg)} acceptée${reg.volunteer.email ? " : email de confirmation envoyé" : ""}.`
      : `Demande de ${personName(reg)} refusée${reg.volunteer.email ? " : email envoyé" : ""}.`)
    // The row's buttons are gone with the decision: on to the next request, else back to the filters.
    requestAnimationFrame(() => {
      const next = document.querySelector<HTMLButtonElement>("[data-decision-accept]")
      ;(next ?? requestsFilterRef.current ?? document.getElementById("reg-search"))?.focus()
    })
  }

  function openLeaderModal(reg: Registration) {
    const roleOptions = leaderRoleOptions(registrations, reg.volunteer.id)
    setLeaderTarget({
      volunteerId: reg.volunteer.id,
      volunteerName: `${reg.volunteer.firstName} ${reg.volunteer.lastName}`,
      volunteerEmail: reg.volunteer.email,
      roleOptions,
      defaultRole: reg.shift.roleName, // the row the admin clicked from — sensible default among several
    })
  }

  // ── Bulk actions on the current selection ───────────────────────────────────
  // Uses the full registrations list, not `filtered`: a row selected before a search/filter
  // change hides it must still be included in the bulk action, matching what the toolbar's own
  // "N sélectionnée(s)" count already promises.
  const selectedRegs = registrations.filter((r) => selectedIds.has(r.id))
  const selectedActiveRegs = selectedRegs.filter((r) => r.status === "active")

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const visibleIds = filtered.map((r) => r.id)
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(visibleIds)
    })
  }

  // One request for the whole selection (#292): ownership checked for every row up front on the
  // server, all or nothing. Returns null on a request-level failure.
  const BULK_LABELS = { cancel: "Retrait", make_leader: "Désignation des responsables", resend_link: "Renvoi des liens", check_in: "Présence", undo_check_in: "Présence" } as const

  /**
   * Runs a bulk action. On a whole-request failure (network, refused, server) it explains what
   * happened and whether anything may have been applied, keeps the selection and returns null;
   * the caller then leaves the rows as they are and « Réessayer » repeats the action (#375).
   */
  async function runBulk(action: keyof typeof BULK_LABELS, ids: string[], again: () => void) {
    setRetry(() => again)
    // The alert stays mounted while the retry runs, so a focused « Réessayer » isn't unmounted under the user.
    let res: Response
    try {
      res = await fetch(`/api/admin/events/${eventId}/registrations/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, registrationIds: ids }),
        // A removal committed while leaving the page must still reach the server.
        keepalive: true,
      })
    } catch {
      const f = describeBulkFailure({ network: true }, BULK_LABELS[action])
      setBulkError(`${f.title}. ${f.message} ${f.hint}`)
      return null
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const f = describeBulkFailure({ status: res.status, body }, BULK_LABELS[action])
      setBulkError(`${f.title}. ${f.message} ${f.hint}`)
      return null
    }
    setRetry(null)
    setBulkError(null)
    // The alert (and its button) goes away with the result: park the focus on the summary line.
    afterBulkRef.current?.focus()
    return res.json() as Promise<{ done: number; failed?: number; skipped?: number; alreadyLeader?: number; cancelledIds?: string[]; changedIds?: string[] }>
  }

  // Lightweight check-in (#399): mark the selected confirmed people present, or undo it.
  const selectedToCheckIn = selectedActiveRegs.filter((r) => !r.checkedInAt)
  const selectedToUndo = selectedActiveRegs.filter((r) => r.checkedInAt)
  const presentCount = registrations.filter((r) => r.status === "active" && r.checkedInAt).length
  const activeCount = registrations.filter((r) => r.status === "active").length

  async function handlePresence(present: boolean) {
    const targets = present ? selectedToCheckIn : selectedToUndo
    if (targets.length === 0) return
    setBulkBusy(true)
    const startedAt = new Date()
    const result = await runBulk(present ? "check_in" : "undo_check_in", targets.map((r) => r.id), () => handlePresence(present))
    setBulkBusy(false)
    if (!result) return
    setLastLogLink(logLinkFor(eventId, startedAt))
    const changed = new Set(result.changedIds ?? [])
    const at = new Date().toISOString()
    setRegistrations((prev) => prev.map((r) => (changed.has(r.id) ? { ...r, checkedInAt: present ? at : null } : r)))
    setSelectedIds(new Set())
    // Cleared first so the same sentence twice in a row is announced again.
    setLeaderAnnouncement("")
    requestAnimationFrame(() => {
      setLeaderAnnouncement(present
        ? `${changed.size} personne${changed.size > 1 ? "s" : ""} marquée${changed.size > 1 ? "s" : ""} présente${changed.size > 1 ? "s" : ""}.`
        : `Présence annulée pour ${changed.size} personne${changed.size > 1 ? "s" : ""}.`)
      afterBulkRef.current?.focus()
    })
  }

  function handleBulkCancel() {
    if (selectedActiveRegs.length === 0) return
    const shiftIds = new Set(selectedActiveRegs.map((r) => r.shift.id))
    const waitlisted = registrations.filter((r) => r.status !== "active" && shiftIds.has(r.shift.id)).length
    setPending({
      recap: bulkCancelRecap({ people: selectedActiveRegs.length, withEmail: selectedActiveRegs.filter((r) => r.volunteer.email).length, waitlisted: Math.min(waitlisted, selectedActiveRegs.length) }),
      run: holdBulkCancel,
    })
  }

  /** Puts rows back where they were in the list. */
  function restore(rows: Registration[]) {
    const order = orderRef.current
    setRegistrations((prev) => [...prev, ...rows].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity)))
  }

  // Step 1 of a removal: the rows leave the list, nothing is sent yet. A removal confirmed while
  // one is already waiting joins it: one window for all of them, restarted, so no batch is
  // committed behind the person's back.
  async function holdBulkCancel() {
    const rows = selectedActiveRegs
    const ids = new Set(rows.map((r) => r.id))
    const all = [...held, ...rows]
    setPending(null)
    setRegistrations((prev) => prev.filter((r) => !ids.has(r.id)))
    setSelectedIds(new Set())
    setHeld(all)
    setBulkError(null)
    holdReasons.current.clear()
    undo.start(() => void commitBulkCancel(all), { replace: true })
    announce(setLeaderAnnouncement, heldAnnouncement(all.length, UNDO_MS / 1000))
    // The toolbar is gone with the selection: the focus lands on « Annuler le retrait ».
    requestAnimationFrame(() => undoRef.current?.focus())
  }

  function undoBulkCancel() {
    if (!undo.cancel()) return
    const rows = held
    setHeld([])
    restore(rows)
    announce(setLeaderAnnouncement, undoneAnnouncement(rows.length))
    afterBulkRef.current?.focus()
  }

  // Step 2, once the window has closed: the request. A failure puts the rows back with « Réessayer ».
  async function commitBulkCancel(rows: Registration[]) {
    const startedAt = new Date()
    const ids = new Set(rows.map((r) => r.id))
    // The bar (and the focused button in it) goes away: park the focus first.
    afterBulkRef.current?.focus()
    setHeld((prev) => prev.filter((r) => !ids.has(r.id)))
    setBulkBusy(true)
    announce(setLeaderAnnouncement, "Retrait en cours…")
    const result = await runBulk("cancel", rows.map((r) => r.id), () => { setRegistrations((prev) => prev.filter((r) => !ids.has(r.id))); void commitBulkCancel(rows) })
    setBulkBusy(false)
    if (!result) { setLeaderAnnouncement(""); restore(rows); return }
    const cancelledIds = new Set(result.cancelledIds ?? [])
    const kept = rows.filter((r) => !cancelledIds.has(r.id))
    if (kept.length > 0) restore(kept)
    setLastLogLink(logLinkFor(eventId, startedAt))
    announce(setLeaderAnnouncement, cancelAnnouncement(cancelledIds.size, kept.length))
  }

  function handleBulkMakeLeader() {
    if (selectedRegs.length === 0) return
    const withEmail = selectedRegs.filter((r) => r.volunteer.email)
    if (withEmail.length === 0) return
    setPending({ recap: bulkLeaderRecap({ people: withEmail.length, withoutEmail: selectedRegs.length - withEmail.length }), run: runBulkMakeLeader })
  }

  async function runBulkMakeLeader() {
    const withEmail = selectedRegs.filter((r) => r.volunteer.email)
    const withoutEmail = selectedRegs.length - withEmail.length
    const startedAt = new Date()
    setBulkBusy(true)
    const result = await runBulk("make_leader", withEmail.map((r) => r.id), () => runBulkMakeLeader())
    setBulkBusy(false)
    if (!result) { setPending(null); return }
    // Already leader of that role counts as done from the admin's point of view.
    const succeeded = result.done + (result.alreadyLeader ?? 0)
    const failed = 0
    setSelectedIds(new Set())
    setPending(null)
    setLastLogLink(logLinkFor(eventId, startedAt))
    setLeaderAnnouncement(leaderAddedAnnouncement(succeeded, failed, withoutEmail))
  }

  // A single selected row opens the modal (lets the admin pick among several roles if the
  // volunteer has more than one registration, and edit name/email before sending) — the same
  // experience the old per-row button gave. Several rows fall back to the bulk flow below, which
  // auto-assigns each person to their own row's shift role with no per-person confirmation step.
  function handleMakeResponsibleClick() {
    if (selectedRegs.length === 1) { openLeaderModal(selectedRegs[0]); return }
    handleBulkMakeLeader()
  }

  function handleBulkResendLink() {
    const resendable = selectedRegs.filter((r) => r.status === "active" && r.volunteer.email)
    if (resendable.length === 0) return
    const people = new Set(resendable.map((r) => r.volunteer.email)).size
    setPending({ recap: bulkResendRecap({ people }), run: runBulkResendLink })
  }

  async function runBulkResendLink() {
    const resendable = selectedRegs.filter((r) => r.status === "active" && r.volunteer.email)
    const startedAt = new Date()
    setBulkBusy(true)
    const result = await runBulk("resend_link", resendable.map((r) => r.id), () => runBulkResendLink())
    setBulkBusy(false)
    if (!result) { setPending(null); return }
    // One email per volunteer, even with several of their rows selected.
    const succeeded = result.done
    const failed = result.failed ?? 0
    setSelectedIds(new Set())
    setPending(null)
    setLastLogLink(logLinkFor(eventId, startedAt))
    setLeaderAnnouncement(resendAnnouncement(succeeded, failed))
  }

  function handleAdded(newReg: Registration) {
    setRegistrations((prev) => [newReg, ...prev])
    setAddForm(EMPTY_ADD_FORM)
    setShowAddForm(false)
    addButtonRef.current?.focus()
    // No journal link: the one left from an earlier action would not be about this addition.
    setLastLogLink(null)
    announce(setLeaderAnnouncement, manualAddAnnouncement(personName(newReg), newReg.shift))
  }

  function handleAddCancel() {
    setShowAddForm(false)
    addButtonRef.current?.focus()
  }

  return (
    <div className="space-y-4">
      {pending && (
        <ConfirmActionModal recap={pending.recap} busy={bulkBusy} onConfirm={() => void pending.run()} onCancel={() => setPending(null)} />
      )}
      {decision && (
        <RequestDecisionModal
          key={`${decision.reg.id}-${decision.kind}`}
          reg={decision.reg}
          kind={decision.kind}
          waitlist={registrations.some((r) => r.shift.id === decision.reg.shift.id && r.status === "waiting")}
          onCancel={() => setDecision(null)}
          onDecided={(startedAt) => handleDecided(decision.reg, decision.kind, startedAt)}
        />
      )}
      {/* The one live region for outcomes: visible when there is something to say, empty otherwise. */}
      <p role="status" aria-live="polite" className={leaderAnnouncement ? "text-sm text-gray-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1" : "sr-only"}>
        {leaderAnnouncement && <span>{leaderAnnouncement}</span>}
        {leaderAnnouncement && lastLogLink && (
          <Link href={lastLogLink} className="font-medium text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Voir cette action dans le journal</Link>
        )}
      </p>
      {held.length > 0 && undo.secondsLeft !== null && (
        <UndoRemovalBar
          count={held.length}
          secondsLeft={undo.secondsLeft}
          undoButtonRef={undoRef}
          onUndo={undoBulkCancel}
          onRemoveNow={() => undo.flush()}
          onHold={holdWindow}
          onRelease={releaseWindow}
        />
      )}
      {bulkError && (
        <div role="alert" aria-busy={bulkBusy || undefined} className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{bulkError}</span>
          {retry && (
            <button type="button" onClick={() => { if (!bulkBusy) retry() }} aria-disabled={bulkBusy || undefined} className={`font-medium underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 ${bulkBusy ? "opacity-60" : ""}`}>
              {bulkBusy ? "Nouvel essai…" : "Réessayer"}
            </button>
          )}
        </div>
      )}
      <p ref={afterBulkRef} tabIndex={-1} className={`text-sm text-gray-700 focus:outline-none ${presentCount > 0 ? "" : "sr-only"}`}>
        {presentCount > 0
          ? <><span className="font-medium text-green-800">{presentCount} présent{presentCount > 1 ? "s" : ""}</span> sur {activeCount} inscrit{activeCount > 1 ? "s" : ""}.</>
          : `${activeCount} inscrit${activeCount > 1 ? "s" : ""}, personne encore marqué présent.`}
      </p>

      <div className="flex gap-3 flex-wrap">
        <label htmlFor="reg-search" className="sr-only">Rechercher un bénévole</label>
        <input
          id="reg-search"
          type="text"
          placeholder="Rechercher (nom, email…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="role-filter" className="sr-only">Filtrer par poste</label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value)
            if (shiftFilter) {
              const s = shifts.find(x => x.id === shiftFilter)
              if (s && e.target.value && s.roleName !== e.target.value) setShiftFilter("")
            }
          }}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les postes</option>
          {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {(requestCount > 0 || requestsOnly) && (
          <label className="flex items-center gap-2 border border-amber-300 bg-amber-50 text-amber-950 rounded-xl px-3 py-2 text-sm font-medium cursor-pointer">
            <input ref={requestsFilterRef} type="checkbox" checked={requestsOnly} onChange={(e) => setRequestsOnly(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            Demandes à traiter ({requestCount})
          </label>
        )}
        {/* The list changes under the filters without a page load: say how many rows are left. */}
        <p role="status" className="sr-only">{filtered.length} inscription{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}</p>
        <span id={shiftFilterLabelId} className="sr-only">Filtrer par créneau</span>
        <div className="min-w-64">
          <ShiftSelect
            labelledBy={shiftFilterLabelId}
            shifts={visibleShifts}
            value={shiftFilter}
            onChange={setShiftFilter}
            placeholder="Tous les créneaux"
            nullable
          />
        </div>
        <Link
          href={`/admin/events/${eventId}/message${shiftFilter ? `?shift=${encodeURIComponent(shiftFilter)}` : roleFilter ? `?role=${encodeURIComponent(roleFilter)}` : ""}`}
          className="border border-gray-300 text-gray-800 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {shiftFilter ? "Écrire à ce créneau" : roleFilter ? "Écrire à ce poste" : "Écrire aux bénévoles"}
        </Link>
        <button
          ref={addButtonRef}
          onClick={() => { setShowAddForm(true); if (!showAddForm) setAddFormOpenings((n) => n + 1); setAddForm((f) => ({ ...f, shiftId: shiftFilter || f.shiftId })) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Ajouter manuellement
        </button>
      </div>

      {showAddForm && (
        <ManualAddForm
          key={addFormOpenings}
          eventId={eventId}
          shifts={shifts}
          registrations={registrations}
          timeZone={timeZone}
          form={addForm}
          onFormChange={setAddForm}
          onAdded={handleAdded}
          onCancel={handleAddCancel}
        />
      )}

      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          toCheckInCount={selectedToCheckIn.length}
          toUndoCount={selectedToUndo.length}
          activeCount={selectedActiveRegs.length}
          noneWithEmail={selectedRegs.every((r) => !r.volunteer.email)}
          noActiveWithEmail={selectedActiveRegs.every((r) => !r.volunteer.email)}
          busy={bulkBusy}
          onPresence={handlePresence}
          onMakeResponsible={handleMakeResponsibleClick}
          onResendLink={handleBulkResendLink}
          onCancelRegistrations={handleBulkCancel}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>{registrations.length === 0 ? "Aucune inscription." : requestsOnly && requestCount === 0 ? "Aucune demande à traiter." : "Aucun résultat."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Inscriptions</caption>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-4 py-2.5 w-8">
                  <label className="sr-only" htmlFor="reg-select-all">Sélectionner toutes les inscriptions visibles</label>
                  <input
                    id="reg-select-all"
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.size > 0 && !filtered.every((r) => selectedIds.has(r.id))
                    }}
                    onChange={toggleSelectAllVisible}
                    className="rounded border-gray-300"
                  />
                </th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Bénévole</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Créneau</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Source</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((reg) => (
                <RegistrationRow
                  key={reg.id}
                  reg={reg}
                  selected={selectedIds.has(reg.id)}
                  onToggleSelected={() => toggleSelected(reg.id)}
                  onDecision={(kind) => openDecision(reg, kind)}
                  answers={answersByVolunteer[reg.volunteer.id] ?? []}
                  workload={workload.get(reg.volunteer.id) ?? []}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leaderTarget && (
        <MakeLeaderModal
          eventId={eventId}
          volunteerName={leaderTarget.volunteerName}
          volunteerEmail={leaderTarget.volunteerEmail}
          roleOptions={leaderTarget.roleOptions}
          defaultRole={leaderTarget.defaultRole}
          onClose={() => setLeaderTarget(null)}
          onDone={(roleName) => {
            setLeaderAnnouncement(`${leaderTarget.volunteerName} ajouté·e comme responsable de « ${roleName} », invitation envoyée par email.`)
            setLeaderTarget(null)
          }}
        />
      )}
    </div>
  )
}
