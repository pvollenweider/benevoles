"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { announce } from "@/lib/announce"
import { UNDO_MS, useDelayedAction } from "@/lib/use-delayed-action"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { acceptRequestRecap, bulkCancelRecap, bulkLeaderRecap, bulkResendRecap, logLinkFor, refuseRequestRecap, type ActionRecap } from "@/lib/action-recap"
import { describeBulkFailure } from "@/lib/form-errors"
import { useId, useState, useMemo, useRef } from "react"
import StatusBadge from "./StatusBadge"
import ShiftSelect from "./registrations/ShiftSelect"
import MakeLeaderModal from "./registrations/MakeLeaderModal"
import { contactPhone } from "@/lib/contact-phone"
import { workloadByVolunteer, workloadMessage, workloadWarnings } from "@/lib/workload"
import { availabilityLabel, hasAvailability } from "@/lib/availability"
import {
  addConflictMessage,
  cancelAnnouncement,
  heldAnnouncement,
  undoneAnnouncement,
  filterRegistrations,
  fmtHour,
  fmtShortDate,
  leaderAnnouncement as leaderAddedAnnouncement,
  leaderRoleOptions,
  resendAnnouncement,
  shiftsOfEmail,
  type ShiftRef,
} from "@/lib/registrations-list"

type Volunteer = {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null
  /** Optional general availability (#402), for manual placement. */
  availabilityPeriods?: string[]; availabilityNote?: string | null
}
type Registration = {
  id: string; status: string; source: string; comment: string | null
  // Phone given on the public form for this registration; shown before the profile's.
  phone?: string | null
  createdAt: string; waitingPosition: number | null; volunteer: Volunteer; shift: ShiftRef
  // True when this volunteer is already the (or a) sector leader of this shift's own role —
  // computed server-side from SectorLeader (role + email), see registrations/page.tsx.
  isLeader: boolean
  /** Lightweight check-in (#399): when the organizer marked this person present. */
  checkedInAt?: string | null
}

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

const sourceLabels: Record<string, string> = {
  public_form: "Formulaire",
  admin_manual: "Manuel",
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
  // Sign-up approval (#484): the request being accepted or refused, with the optional message.
  const [decision, setDecision] = useState<{ reg: Registration; kind: "accept" | "refuse" } | null>(null)
  const [decisionNote, setDecisionNote] = useState("")
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  // The request the role-limit warning is about: the override only applies to that exact form.
  const [overLimitFor, setOverLimitFor] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" })
  // Manual addition: what this shift would add to the workload of a volunteer already registered.
  const addWarnings = useMemo(() => {
    const email = addForm.email.trim().toLowerCase()
    const shift = shifts.find((s) => s.id === addForm.shiftId)
    if (!email || !shift) return []
    const held = registrations.filter((r) => r.status === "active" && r.volunteer.email?.toLowerCase() === email && r.shift.id !== shift.id)
    if (held.length === 0) return []
    const before = new Set(workloadWarnings(held.map((r) => r.shift), timeZone).map(workloadMessage))
    return workloadWarnings([...held.map((r) => r.shift), shift], timeZone).map(workloadMessage).filter((m) => !before.has(m))
  }, [addForm.email, addForm.shiftId, shifts, registrations, timeZone])
  const overLimit = overLimitFor === JSON.stringify(addForm)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
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
  const undoBarRef = useRef<HTMLDivElement>(null)
  const undoTextId = useId()
  const orderRef = useRef(new Map(initialRegistrations.map((r, i) => [r.id, i])))
  // The countdown waits while the focus or the pointer is on the bar (WCAG 2.2.1).
  const holdReasons = useRef(new Set<"focus" | "pointer">())
  function holdWindow(reason: "focus" | "pointer") { holdReasons.current.add(reason); undo.pause() }
  function releaseWindow(reason: "focus" | "pointer") { holdReasons.current.delete(reason); if (holdReasons.current.size === 0) undo.resume() }

  const uniqueRoles = [...new Set(shifts.map(s => s.roleName))]
  const visibleShifts = roleFilter ? shifts.filter(s => s.roleName === roleFilter) : shifts

  // Shifts already held by the volunteer identified by the email in the add form
  const volunteerShifts = useMemo<ShiftRef[] | undefined>(
    () => shiftsOfEmail(registrations, addForm.email),
    [addForm.email, registrations]
  )

  // Availability of the person being added by hand, when their email matches someone already on
  // the event (#402): the organizer sees it before picking the shift.
  const knownVolunteer = useMemo(() => {
    const email = addForm.email.trim().toLowerCase()
    return email ? registrations.find((r) => r.volunteer.email?.toLowerCase() === email)?.volunteer : undefined
  }, [addForm.email, registrations])

  const selectedShiftObj = useMemo(
    () => (addForm.shiftId ? shifts.find(s => s.id === addForm.shiftId) ?? null : null),
    [addForm.shiftId, shifts]
  )

  const conflictMessage = useMemo(
    () => addConflictMessage(selectedShiftObj, volunteerShifts),
    [selectedShiftObj, volunteerShifts]
  )

  const filtered = filterRegistrations(registrations, { search, role: roleFilter, shiftId: shiftFilter, requestsOnly })
  const requestCount = registrations.filter((r) => r.status === "requested").length

  const shiftName = (r: Registration) => (r.shift.label !== r.shift.roleName ? `${r.shift.roleName} · ${r.shift.label}` : r.shift.label)
  const personName = (r: Registration) => `${r.volunteer.firstName} ${r.volunteer.lastName}`

  function openDecision(reg: Registration, kind: "accept" | "refuse") {
    setDecisionNote("")
    setDecisionError(null)
    setDecision({ reg, kind })
  }

  async function runDecision() {
    if (!decision || decisionBusy) return
    const { reg, kind } = decision
    const startedAt = new Date()
    setDecisionBusy(true)
    setDecisionError(null)
    let res: Response
    try {
      res = await fetch(`/api/admin/registrations/${reg.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "refuse" && decisionNote.trim() ? { decision: kind, note: decisionNote } : { decision: kind }),
      })
    } catch {
      setDecisionBusy(false)
      setDecisionError("La connexion a échoué : rien n'a été fait. Réessayez.")
      return
    }
    const data = await res.json().catch(() => null)
    setDecisionBusy(false)
    if (!res.ok) { setDecisionError(data?.error ?? "La décision n'a pas pu être enregistrée."); return }
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

  async function handleAdd(e: React.FormEvent | null, allowOverLimit = false) {
    e?.preventDefault()
    if (adding) return
    if (!addForm.shiftId) { setAddError("Sélectionnez un créneau."); return }
    setAdding(true)
    // Forcing past the role limit: the alert and its button stay until the answer, so focus stays put.
    if (!allowOverLimit) { setAddError(null); setOverLimitFor(null) }

    const res = await fetch("/api/admin/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, ...addForm, ...(allowOverLimit ? { allowOverLimit: true } : {}) }),
    })

    const data = await res.json()
    setAdding(false)

    // The role's limit per person (#466): the organiser may go over it, after reading why.
    if (res.status === 409 && data.code === "role_limit") { setAddError(data.error); setOverLimitFor(JSON.stringify(addForm)); return }
    setOverLimitFor(null)
    if (!res.ok) { setAddError(data.error ?? "Erreur."); return }
    setAddError(null)

    const shiftRef = shifts.find(s => s.id === addForm.shiftId)
    const newReg: Registration = {
      id: data.id,
      status: data.status,
      source: data.source,
      comment: data.comment,
      createdAt: data.createdAt,
      waitingPosition: data.waitingPosition ?? null,
      volunteer: data.volunteer,
      // A registration just created client-side can't already be flagged as a sector leader —
      // that comes from a server-side join against SectorLeader the manual-add response doesn't
      // carry, and "just registered" is never simultaneously "registered a while ago and later
      // made a leader" (see registrations/page.tsx's initial computation of this field).
      isLeader: false,
      shift: {
        id: data.shift.id,
        roleName: data.shift.roleName,
        label: data.shift.label,
        date: data.shift.date.split("T")[0],
        startTime: data.shift.startTime,
        endTime: data.shift.endTime,
        capacity: shiftRef?.capacity ?? data.shift.capacity ?? 0,
        registrationCount: (shiftRef?.registrationCount ?? 0) + 1,
      },
    }
    setRegistrations((prev) => [newReg, ...prev])
    setAddForm({ firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" })
    setShowAddForm(false)
  }

  return (
    <div className="space-y-4">
      {pending && (
        <ConfirmActionModal recap={pending.recap} busy={bulkBusy} onConfirm={() => void pending.run()} onCancel={() => setPending(null)} />
      )}
      {decision && (
        <ConfirmActionModal
          recap={decision.kind === "accept"
            ? acceptRequestRecap({ name: personName(decision.reg), shift: shiftName(decision.reg), hasEmail: !!decision.reg.volunteer.email })
            : refuseRequestRecap({
              name: personName(decision.reg),
              shift: shiftName(decision.reg),
              hasEmail: !!decision.reg.volunteer.email,
              waitlist: registrations.some((r) => r.shift.id === decision.reg.shift.id && r.status === "waiting"),
            })}
          busy={decisionBusy}
          error={decisionError}
          onConfirm={() => void runDecision()}
          onCancel={() => setDecision(null)}
        >
          {decision.kind === "refuse" && decision.reg.volunteer.email && (
            <div className="mt-4">
              <label htmlFor="refusal-note" className="block text-sm text-gray-800 mb-1">Message à la personne (facultatif)</label>
              <textarea
                id="refusal-note"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                maxLength={1000}
                rows={3}
                aria-describedby="refusal-note-hint"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              />
              <p id="refusal-note-hint" className="text-xs text-gray-600 mt-1">Ajouté tel quel à l&apos;email. Sans message, l&apos;email ne donne aucune raison.</p>
            </div>
          )}
        </ConfirmActionModal>
      )}
      {/* The one live region for outcomes: visible when there is something to say, empty otherwise. */}
      <p role="status" aria-live="polite" className={leaderAnnouncement ? "text-sm text-gray-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1" : "sr-only"}>
        {leaderAnnouncement && <span>{leaderAnnouncement}</span>}
        {leaderAnnouncement && lastLogLink && (
          <Link href={lastLogLink} className="font-medium text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Voir cette action dans le journal</Link>
        )}
      </p>
      {held.length > 0 && undo.secondsLeft !== null && (
        <div
          ref={undoBarRef}
          onFocus={() => holdWindow("focus")}
          onBlur={(e) => { if (!undoBarRef.current?.contains(e.relatedTarget as Node | null)) releaseWindow("focus") }}
          onPointerEnter={() => holdWindow("pointer")}
          onPointerLeave={() => releaseWindow("pointer")}
          className="text-sm text-gray-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <span id={undoTextId}>
            {held.length} {held.length > 1 ? "bénévoles seront retirés" : "bénévole sera retiré"} de {held.length > 1 ? "leur" : "son"} créneau
            {" "}<span role="timer">dans {undo.secondsLeft} s</span>. Le compte à rebours attend tant que vous êtes sur cette barre.
          </span>
          <button
            ref={undoRef}
            type="button"
            onClick={undoBulkCancel}
            aria-describedby={undoTextId}
            className="font-medium text-blue-800 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Annuler le retrait
          </button>
          <button
            type="button"
            onClick={() => undo.flush()}
            aria-describedby={undoTextId}
            className="text-gray-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Retirer maintenant
          </button>
        </div>
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
          className="flex-1 min-w-48 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <div className="min-w-64">
          <ShiftSelect
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
          onClick={() => { setShowAddForm(true); setAddError(null); setAddForm((f) => ({ ...f, shiftId: shiftFilter || f.shiftId })) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Ajouter manuellement
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Inscription manuelle</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-firstname" className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
              <input id="add-firstname" type="text" required value={addForm.firstName} onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))} className="input" />
            </div>
            <div>
              <label htmlFor="add-lastname" className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
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
          <div>
            <p id="add-shift-label" className="block text-xs font-medium text-gray-600 mb-1">Créneau *</p>
            <ShiftSelect
              labelledBy="add-shift-label"
              shifts={shifts}
              value={addForm.shiftId}
              onChange={(id) => setAddForm((f) => ({ ...f, shiftId: id }))}
              placeholder="Sélectionner un créneau…"
              existingShifts={volunteerShifts}
            />
            {conflictMessage && (
              <p className="text-xs text-orange-800 mt-1 ml-0.5">{conflictMessage}</p>
            )}
          </div>
          <div>
            <label htmlFor="add-comment" className="block text-xs font-medium text-gray-600 mb-1">Note</label>
            <input id="add-comment" type="text" value={addForm.comment} onChange={(e) => setAddForm((f) => ({ ...f, comment: e.target.value }))} className="input" placeholder="ex. Inscrit par téléphone" />
          </div>

          {/* Always mounted, so the warning is announced when the email and shift make it appear. */}
          <div id="add-workload" role="status" className={addWarnings.length > 0 ? "" : "sr-only"}>
            {addWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-950">
                <p className="font-medium">Si vous ajoutez ce créneau, cette personne aura :</p>
                <ul role="list" className="mt-1 space-y-0.5">{addWarnings.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="mt-1">L&apos;ajout reste possible.</p>
              </div>
            )}
          </div>
          {addError && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              <p id="add-error">{addError}</p>
              {overLimitFor !== null && !overLimit && <p className="mt-1">Le formulaire a changé : validez à nouveau.</p>}
              {overLimit && (
                <button type="button" onClick={() => { if (!adding) handleAdd(null, true) }} aria-disabled={adding || undefined} aria-describedby="add-error" className={`mt-2 text-sm font-medium text-red-800 underline underline-offset-2 hover:text-red-950 ${adding ? "opacity-60 cursor-wait" : ""}`}>
                  {adding ? "Ajout en cours…" : "Ajouter quand même"}
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button type="submit" aria-disabled={adding || undefined} aria-describedby={addWarnings.length > 0 ? "add-workload" : undefined} className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 ${adding ? "opacity-60 cursor-wait" : ""}`}>
              {adding ? "…" : "Ajouter"}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">Annuler</button>
          </div>
        </form>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex-wrap">
          <span className="text-sm text-blue-900 font-medium">
            {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => { if (!bulkBusy && selectedToCheckIn.length > 0) handlePresence(true) }}
            aria-disabled={bulkBusy || selectedToCheckIn.length === 0}
            className={`text-xs text-green-800 border border-green-300 bg-white px-3 py-1.5 rounded-full hover:bg-green-50 transition-colors ${bulkBusy || selectedToCheckIn.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {`Marquer présent${selectedToCheckIn.length > 1 ? "s" : ""} (${selectedToCheckIn.length})`}
          </button>
          {selectedToUndo.length > 0 && (
            <button
              type="button"
              onClick={() => handlePresence(false)}
              disabled={bulkBusy}
              className="text-xs text-gray-700 border border-gray-300 bg-white px-3 py-1.5 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {`Annuler la présence (${selectedToUndo.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={handleMakeResponsibleClick}
            disabled={bulkBusy || selectedRegs.every((r) => !r.volunteer.email)}
            className="text-xs text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-full hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            Rendre responsable
          </button>
          <button
            type="button"
            onClick={handleBulkResendLink}
            disabled={bulkBusy || selectedActiveRegs.every((r) => !r.volunteer.email)}
            className="text-xs text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-full hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {bulkBusy ? "…" : "Renvoyer le lien"}
          </button>
          <button
            type="button"
            onClick={handleBulkCancel}
            disabled={bulkBusy || selectedActiveRegs.length === 0}
            className="text-xs text-red-600 border border-red-300 bg-white px-3 py-1.5 rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {bulkBusy ? "…" : `Retirer de leur créneau (${selectedActiveRegs.length})`}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-blue-600 hover:text-blue-800 ml-auto"
          >
            Désélectionner
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>{registrations.length === 0 ? "Aucune inscription." : requestsOnly && requestCount === 0 ? "Aucune demande à traiter." : "Aucun résultat."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
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
                <tr key={reg.id} className={`hover:bg-gray-50 ${selectedIds.has(reg.id) ? "bg-blue-50/60" : ""}`}>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`reg-select-${reg.id}`}>
                      Sélectionner l&apos;inscription de {reg.volunteer.firstName} {reg.volunteer.lastName}
                    </label>
                    <input
                      id={`reg-select-${reg.id}`}
                      type="checkbox"
                      checked={selectedIds.has(reg.id)}
                      onChange={() => toggleSelected(reg.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                      {reg.volunteer.firstName} {reg.volunteer.lastName}
                      {reg.isLeader && (
                        <span
                          className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                          title={`Responsable de ${reg.shift.roleName}`}
                        >
                          Responsable
                        </span>
                      )}
                      {reg.checkedInAt && reg.status === "active" && (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                          <span aria-hidden="true">✓ </span>Présent<span className="sr-only"> depuis {new Date(reg.checkedInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{reg.volunteer.email}</p>
                    {reg.status === "requested" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Demande à traiter</span>
                        <button
                          type="button"
                          data-decision-accept=""
                          onClick={() => openDecision(reg, "accept")}
                          className="text-xs font-medium text-white bg-green-700 hover:bg-green-800 rounded-full px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                        >
                          Accepter{" "}<span className="sr-only">la demande de {personName(reg)} pour {shiftName(reg)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDecision(reg, "refuse")}
                          className="text-xs font-medium text-red-800 border border-red-300 bg-white hover:bg-red-50 rounded-full px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                        >
                          Refuser{" "}<span className="sr-only">la demande de {personName(reg)} pour {shiftName(reg)}</span>
                        </button>
                      </div>
                    )}
                    {(answersByVolunteer[reg.volunteer.id] ?? []).length > 0 && (
                      <ul role="list" className="text-xs text-gray-700 mt-0.5">
                        {answersByVolunteer[reg.volunteer.id].map((a) => <li key={a.label}><span className="text-gray-600">{a.label} :</span> {a.text}</li>)}
                      </ul>
                    )}
                    {reg.status === "active" && (workload.get(reg.volunteer.id) ?? []).filter((w) => w.shiftIds.includes(reg.shift.id)).map((w) => (
                      <p key={`${w.kind}-${w.day}`} className="text-xs text-amber-900 mt-0.5"><span className="font-semibold">Charge élevée :</span> {workloadMessage(w)}</p>
                    ))}
                    {contactPhone(reg) && <p className="text-xs text-gray-500">{contactPhone(reg)}</p>}
                    {hasAvailability(reg.volunteer) && <p className="text-xs text-gray-700"><span className="sr-only">Disponible : </span><span aria-hidden="true">🕒 </span>{availabilityLabel(reg.volunteer)}</p>}
                    {reg.comment && <p className="text-xs text-gray-500 italic mt-0.5">"{reg.comment}"</p>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <p className="text-gray-700">
                      {reg.shift.label !== reg.shift.roleName
                        ? <>{reg.shift.roleName} <span className="text-gray-500 font-normal">·</span> {reg.shift.label}</>
                        : reg.shift.label}
                    </p>
                    <p className="text-xs text-gray-500">{fmtShortDate(reg.shift.date)} · {fmtHour(reg.shift.startTime)}–{fmtHour(reg.shift.endTime)}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-gray-500">{sourceLabels[reg.source] ?? reg.source}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {reg.status === "requested"
                      ? <span className="text-xs text-amber-900">Demande à traiter</span>
                      : reg.status !== "active" && <StatusBadge status={reg.status} />}
                    {reg.status === "waiting" && reg.waitingPosition != null && (
                      <span className="ml-1 text-xs text-gray-500">#{reg.waitingPosition}</span>
                    )}
                  </td>
                </tr>
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
