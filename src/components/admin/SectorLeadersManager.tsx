"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useId, useRef, useEffect } from "react"
import { removeLeaderRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"
import { leaderDesignatedAnnouncement, leaderRemovedAnnouncement } from "@/lib/registrations-list"
import { outcomeClass } from "@/lib/status-message"
import { NO_SECTOR_LABEL } from "@/lib/sectors"
import { leaderSectorGroups } from "@/lib/leader-groups"

export type SectorLeaderRow = {
  id: string
  /** The poste; null for a sector leader (#1169), whose `sectorId` is then set. */
  roleName: string | null
  sectorId?: string | null
  name: string
  email: string
}

/** A sector of the event (#1169), with the postes it covers now. */
export type LeaderSectorOption = { id: string; name: string; archived: boolean; postes: string[] }

export type RegisteredVolunteer = {
  id: string
  name: string
  email: string
  roleNames: string[]
}

function InactiveBadge() {
  return (
    <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">
      <span className="sr-only">, </span>Créneaux tous annulés
    </span>
  )
}

function DeletedPosteHint({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs text-gray-600 -mt-1 mb-2">
      Ce poste a été supprimé, ou tous ses créneaux annulés. Ses responsables ne sont pas repris si vous dupliquez l&apos;événement ; un nouveau créneau de ce poste leur rend leur poste.
    </p>
  )
}

/** The group of a leader row: its kind and its poste or sector, never just the name. */
const groupKey = (l: SectorLeaderRow) => (l.sectorId ? `sector:${l.sectorId}` : `poste:${l.roleName ?? ""}`)

export default function SectorLeadersManager({
  eventId, initialLeaders, roleNames, deletedPostes = [], registeredVolunteers = [], sectors,
}: {
  eventId: string
  initialLeaders: SectorLeaderRow[]
  /** Postes with a live shift, suggested by the add form. */
  roleNames: string[]
  /** Postes whose every shift is cancelled (#1010): their leaders are marked. */
  deletedPostes?: string[]
  registeredVolunteers?: RegisteredVolunteer[]
  /**
   * Only for an event that adopted sectors (#1169): its sectors, and whether a sector leader can be
   * added (beta capability open). Absent: the screen of before #1169, word for word.
   */
  sectors?: { list: LeaderSectorOption[]; canAdd: boolean }
}) {
  const [leaders, setLeaders] = useState(initialLeaders)
  const [announcement, setAnnouncement] = useState("")
  const [showForm, setShowForm] = useState(false)

  const roleId = useId()
  const nameId = useId()
  const emailId = useId()
  const pickId = useId()
  const pickHintId = `${pickId}-hint`
  const [roleName, setRoleName] = useState("")
  // « Tout un secteur » or « Un poste précis » (#1169), the sector first when offered (owner
  // feedback: it must be obvious); each keeps its own value when switching.
  const [scopeKind, setScopeKind] = useState<"poste" | "sector">(() =>
    sectors?.canAdd && sectors.list.some((s) => !s.archived) ? "sector" : "poste")
  const [sectorId, setSectorId] = useState("")
  const scopeName = useId()
  const sectorFieldId = useId()
  const noScopeHintId = useId()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const { submit, busy: saving, error, fail, isInvalid, reset } = useSubmit()
  const [pendingRemove, setPendingRemove] = useState<SectorLeaderRow | null>(null)
  const [removing, setRemoving] = useState(false)
  // Outcome of a removal: shown in the status or alert region, and the focus parks on it.
  const [outcome, setOutcome] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const outcomeRef = useRef<HTMLParagraphElement>(null)
  const errorId = useId()
  const groupId = useId()

  const roleInputRef = useRef<HTMLInputElement>(null)
  const sectorSelectRef = useRef<HTMLSelectElement>(null)
  const scopeRadioRef = useRef<HTMLInputElement>(null)
  const activeSectors = (sectors?.list ?? []).filter((s) => !s.archived)
  // The choice is offered only when a sector leader can be added and the event has an active sector.
  const offerScope = !!sectors?.canAdd && activeSectors.length > 0
  const sectorMode = offerScope && scopeKind === "sector"
  const sectorById = new Map((sectors?.list ?? []).map((s) => [s.id, s]))
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)

  // Not a modal (ModalShell doesn't fit an inline form), so focus is managed by hand: move it
  // into the form when it appears, and back to the trigger button when it closes — same intent
  // as ModalShell's own focus trap/return, adapted to an inline reveal. The trigger button
  // unmounts while the form is open, so it can only be refocused after the close re-render
  // brings it back — hence the effect (a direct .focus() right after setShowForm(false) would
  // still see the old, about-to-unmount DOM).
  useEffect(() => {
    if (showForm) {
      // The scope choice comes first when offered: focus lands on it, not after it.
      ;(scopeRadioRef.current ?? roleInputRef.current)?.focus()
      wasOpenRef.current = true
    } else if (wasOpenRef.current) {
      addButtonRef.current?.focus()
      wasOpenRef.current = false
    }
  }, [showForm])

  function closeForm() {
    setShowForm(false)
    reset()
  }

  function pickRegisteredVolunteer(volunteerId: string) {
    const volunteer = registeredVolunteers.find((v) => v.id === volunteerId)
    if (!volunteer) return
    setName(volunteer.name)
    setEmail(volunteer.email)
    // Several roles for the same person: default to the first, still adjustable in the field
    // above (it's a free-text input with a datalist, not locked to this list). A sector is chosen by hand.
    if (!sectorMode) setRoleName(volunteer.roleNames[0] ?? "")
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (sectorMode && !sectorId) { fail("Choisissez le secteur.", "sector", sectorSelectRef.current); return }
    if (!sectorMode && !roleName.trim()) { fail("Indiquez le poste.", "role", roleInputRef.current); return }
    if (!name.trim()) { fail("Indiquez le nom.", "name", document.getElementById(nameId)); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { fail("Indiquez une adresse email complète.", "email", document.getElementById(emailId)); return }
    const outcome = await submit<SectorLeaderRow>(() => fetch(`/api/admin/events/${eventId}/sector-leaders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sectorMode
        ? { sectorId, name: name.trim(), email: email.trim() }
        : { roleName: roleName.trim(), name: name.trim(), email: email.trim() }),
    }), { silent: true })
    if (!outcome.ok) {
      // A refused sector (archived meanwhile, beta closed) points to the sector field.
      if (sectorMode && (outcome.status === 403 || outcome.status === 404 || (outcome.status === 409 && !outcome.error.startsWith("Cette personne")))) {
        fail(outcome.error, "sector", sectorSelectRef.current)
        return
      }
      const onEmail = outcome.status === 400 || outcome.status === 409
      fail(outcome.error, onEmail ? "email" : undefined, onEmail ? document.getElementById(emailId) : null)
      return
    }
    const leader = outcome.data
    setLeaders((prev) => [...prev, leader])
    setAnnouncement(leader.sectorId
      ? leaderDesignatedAnnouncement(leader.name, sectorById.get(leader.sectorId)?.name ?? "", "sector")
      : leaderDesignatedAnnouncement(leader.name, leader.roleName ?? ""))
    setRoleName("")
    setSectorId("")
    setName("")
    setEmail("")
    closeForm()
  }

  function handleRemove(leader: SectorLeaderRow) {
    setPendingRemove(leader)
  }

  async function runRemove(leader: SectorLeaderRow) {
    setRemoving(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/sector-leaders/${leader.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setOutcome({ kind: "error", text: typeof data?.error === "string" ? data.error : "Le retrait n'a pas abouti. Réessayez." })
        return
      }
      setLeaders((prev) => prev.filter((l) => l.id !== leader.id))
      setOutcome({ kind: "ok", text: leader.sectorId
        ? leaderRemovedAnnouncement(leader.name, sectorById.get(leader.sectorId)?.name ?? "", "sector")
        : leaderRemovedAnnouncement(leader.name, leader.roleName ?? "") })
    } catch {
      setOutcome({ kind: "error", text: "Connexion impossible : le retrait n'a pas été fait. Réessayez." })
    } finally {
      setRemoving(false)
      setPendingRemove(null)
    }
  }

  // The « Retirer » button that opened the modal is gone with its row: park the focus on the outcome.
  useEffect(() => {
    if (!pendingRemove && outcome) outcomeRef.current?.focus()
  }, [pendingRemove, outcome])

  // Groups keyed by kind and id (#1169): a poste « Parking » and a sector « Parking » never merge.
  const grouped = leaders.reduce<Record<string, SectorLeaderRow[]>>((acc, l) => {
    (acc[groupKey(l)] ??= []).push(l)
    return acc
  }, {})
  // A leader of a deleted poste stays until removed, and is shown as such (#1010).
  const ofDeletedPoste = leaders.filter((l) => l.roleName !== null && deletedPostes.includes(l.roleName)).length
  const ofArchivedSector = leaders.filter((l) => l.sectorId && sectorById.get(l.sectorId)?.archived).length
  const pendingSector = pendingRemove?.sectorId ? sectorById.get(pendingRemove.sectorId) : undefined

  // With sectors (#1169): each active sector (and an archived one that still has leaders), with the
  // poste leaders of its postes; then « Autres postes » for the postes of no active sector.
  const sectorGroups = sectors ? leaderSectorGroups(leaders, sectors.list) : []

  function leaderItem(leader: SectorLeaderRow, of: string, describedBy: string | undefined) {
    return (
      <li key={leader.id} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-800 truncate">{leader.name}</p>
          <p className="text-xs text-gray-500 truncate">{leader.email}</p>
        </div>
        <button
          onClick={() => handleRemove(leader)}
          aria-label={`Retirer ${leader.name} des responsables ${of}`}
          aria-describedby={describedBy}
          className="text-xs text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors flex-shrink-0"
        >
          Retirer
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      {pendingRemove && (
        <ConfirmActionModal recap={pendingRemove.sectorId ? removeLeaderRecap(pendingRemove.name, pendingSector?.name ?? "", "sector") : removeLeaderRecap(pendingRemove.name, pendingRemove.roleName ?? "")} busy={removing} onConfirm={() => void runRemove(pendingRemove)} onCancel={() => setPendingRemove(null)} />
      )}
      <p
        ref={outcomeRef}
        tabIndex={-1}
        role={outcome?.kind === "error" ? "alert" : "status"}
        className={`${outcomeClass(outcome)} focus:outline-none`}
      >
        {outcome?.text ?? ""}
      </p>

      <div className={`flex items-center justify-between${sectors ? " flex-wrap gap-2" : ""}`}>
        <p className="text-sm text-gray-500">
          {leaders.length === 0 ? "Aucun responsable pour l'instant." : `${leaders.length} responsable${leaders.length > 1 ? "s" : ""}${ofDeletedPoste > 0 ? `, dont ${ofDeletedPoste} sur un poste aux créneaux tous annulés` : ""}${ofArchivedSector > 0 ? `${ofDeletedPoste > 0 ? " et" : ", dont"} ${ofArchivedSector} sur un secteur archivé` : ""}`}
        </p>
        {!showForm && (
          <button
            ref={addButtonRef}
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Ajouter un responsable
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} noValidate className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          {offerScope && (
            <fieldset>
              <legend className="block text-sm text-gray-700 mb-1">Responsable de</legend>
              <div className="flex flex-wrap gap-x-4">
                {([["sector", "Tout un secteur"], ["poste", "Un poste précis"]] as const).map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-2 min-h-11 text-sm text-gray-800">
                    <input
                      ref={value === scopeKind ? scopeRadioRef : undefined}
                      type="radio"
                      name={scopeName}
                      value={value}
                      checked={scopeKind === value}
                      onChange={() => { setScopeKind(value); reset() }}
                      className="h-4 w-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {sectors && !offerScope && (
            <p id={noScopeHintId} className="text-xs text-gray-600">
              {sectors.canAdd
                ? "Pour confier tout un secteur à un responsable, créez d'abord un secteur dans « Gérer les postes »."
                : "Confier tout un secteur à un responsable fait partie des fonctions bêta, pas encore actives pour votre organisation (Paramètres)."}
            </p>
          )}
          {registeredVolunteers.length > 0 && (
            <div>
              <label htmlFor={pickId} className="block text-sm text-gray-700 mb-1">Depuis les inscrits (optionnel)</label>
              <select
                id={pickId}
                aria-describedby={pickHintId}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) pickRegisteredVolunteer(e.target.value)
                  e.target.value = ""
                }}
                className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm bg-white"
              >
                <option value="">Choisir parmi les bénévoles inscrits…</option>
                {registeredVolunteers.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.roleNames.join(", ")})</option>
                ))}
              </select>
              <p id={pickHintId} className="text-xs text-gray-600 mt-1">{sectorMode ? <>Remplit le nom et l&apos;email ci-dessous ; vous pouvez les modifier avant l&apos;ajout.</> : <>Remplit le nom, l&apos;email et le poste ci-dessous ; vous pouvez les modifier avant l&apos;ajout.</>}</p>
            </div>
          )}
          {sectorMode ? (
          <div>
            <label htmlFor={sectorFieldId} className="block text-sm text-gray-700 mb-1">Secteur <span aria-hidden="true">*</span></label>
            <select
              ref={sectorSelectRef}
              id={sectorFieldId}
              aria-invalid={isInvalid("sector")}
              aria-describedby={isInvalid("sector") ? errorId : undefined}
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
              required
              className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Choisir un secteur…</option>
              {activeSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          ) : (
          <div>
            <label htmlFor={roleId} className="block text-sm text-gray-700 mb-1">Poste <span aria-hidden="true">*</span></label>
            <input
              ref={roleInputRef}
              id={roleId}
              aria-invalid={isInvalid("role")}
              aria-describedby={[isInvalid("role") ? errorId : null, sectors && !offerScope ? noScopeHintId : null].filter(Boolean).join(" ") || undefined}
              type="text"
              list={`${roleId}-options`}
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              required
              maxLength={100}
              placeholder="ex. Bar"
              className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm"
            />
            <datalist id={`${roleId}-options`}>
              {roleNames.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
          )}
          <div>
            <label htmlFor={nameId} className="block text-sm text-gray-700 mb-1">Nom <span aria-hidden="true">*</span></label>
            <input
              id={nameId}
              aria-invalid={isInvalid("name")}
              aria-describedby={isInvalid("name") ? errorId : undefined}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor={emailId} className="block text-sm text-gray-700 mb-1">Email <span aria-hidden="true">*</span></label>
            <input
              id={emailId}
              aria-invalid={isInvalid("email")}
              aria-describedby={isInvalid("email") ? errorId : undefined}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <FormStatus error={error} errorId={errorId} />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={closeForm} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              aria-disabled={saving || undefined}
              className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-80 aria-disabled:cursor-wait transition-colors"
            >
              {saving ? "Envoi…" : "Ajouter et envoyer le lien"}
            </button>
          </div>
        </form>
      )}

      {!sectors && Object.keys(grouped).length > 0 && (
        <div className="space-y-3">
          {Object.entries(grouped).map(([key, roleLeaders], index) => {
            // Role names are free text: « Bar » and « bar » are two groups, so the ids come from
            // useId and the group's position, never from the name.
            const headingId = `${groupId}-poste-${index}`
            const hintId = `${groupId}-hint-${index}`
            const role = roleLeaders[0].roleName ?? ""
            const inactive = deletedPostes.includes(role)
            return (
            <section key={key} className="bg-white border border-gray-200 rounded-xl p-4" aria-labelledby={headingId}>
              <h2 id={headingId} className="text-sm font-medium text-gray-900 mb-2 flex flex-wrap items-center gap-2">
                {role}
                {inactive && <InactiveBadge />}
              </h2>
              {inactive && <DeletedPosteHint id={hintId} />}
              <ul className="space-y-2" role="list">
                {roleLeaders.map((leader) => leaderItem(leader, `de ${role}`, inactive ? hintId : undefined))}
              </ul>
            </section>
            )
          })}
        </div>
      )}

      {/* With sectors adopted (#1169): the leaders grouped by sector, each sector with the leaders of
          the whole sector, then those of its postes; the postes without sector last. */}
      {sectors && (
        <div className="space-y-3">
          {sectorGroups.map((group, i) => {
            const headingId = `${groupId}-s-${i}`
            const hintId = `${groupId}-s-${i}-hint`
            const sectorLeadersHere = group.sector ? leaders.filter((l) => l.sectorId === group.sector!.id) : []
            const archived = !!group.sector?.archived
            const groupName = group.sector ? group.sector.name : NO_SECTOR_LABEL
            return (
              <section key={group.sector?.id ?? "none"} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" aria-labelledby={headingId}>
                <div>
                  <h2 id={headingId} className="text-sm font-semibold text-gray-900 flex flex-wrap items-center gap-2 break-words">
                    {groupName}
                    {archived && (
                      <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">
                        <span className="sr-only">, </span>Secteur archivé
                      </span>
                    )}
                  </h2>
                  {group.sector && (archived ? (
                    <p id={hintId} className="text-xs text-gray-600 mt-0.5">
                      Ce secteur est archivé : ses responsables ne voient plus aucun poste et ne sont pas repris si vous dupliquez l&apos;événement. Rétablir le secteur puis y placer des postes leur rend leur accès.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-600 mt-0.5 break-words">
                      {group.sector.postes.length > 0 ? `Postes : ${group.sector.postes.join(", ")}` : "Aucun poste dans ce secteur pour l'instant."}
                    </p>
                  ))}
                </div>
                {group.sector && (
                  <div>
                    <h3 id={`${headingId}-all`} className="text-xs font-medium text-gray-700 mb-1">Responsable de secteur</h3>
                    {sectorLeadersHere.length > 0 ? (
                      <ul className="space-y-2" role="list" aria-labelledby={`${headingId}-all`}>
                        {sectorLeadersHere.map((leader) => leaderItem(leader, `du secteur ${groupName}`, archived ? hintId : undefined))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-600">Personne pour tout le secteur.</p>
                    )}
                  </div>
                )}
                {group.postes.map((poste, j) => {
                  const posteHeadingId = `${headingId}-p-${j}`
                  const posteHintId = `${posteHeadingId}-hint`
                  const inactive = deletedPostes.includes(poste.roleName)
                  return (
                    <div key={j}>
                      <h3 id={posteHeadingId} className="text-xs font-medium text-gray-700 mb-1 flex flex-wrap items-center gap-2 break-words">
                        <span>Responsable de poste<span aria-hidden="true"> · </span><span className="sr-only">, </span>{poste.roleName}</span>
                        {inactive && <InactiveBadge />}
                      </h3>
                      {inactive && <DeletedPosteHint id={posteHintId} />}
                      <ul className="space-y-2" role="list" aria-labelledby={posteHeadingId}>
                        {poste.leaders.map((leader) => leaderItem(leader, `du poste ${poste.roleName}`, inactive ? posteHintId : undefined))}
                      </ul>
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
