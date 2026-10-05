"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"
import { deactivateMemberRecap, deleteMemberRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { useRouter } from "next/navigation"
import { fmtHours } from "@/lib/gantt-utils"
import { addressesToVerifyCount, filterMembers, nextSort, sortAnnouncement as announceSort, sortMembers, type Member, type SortCol, type SortDir } from "@/lib/members-list"
import { addressStatusSentence } from "@/lib/address-status"
import { announce } from "@/lib/announce"
import { focusFirstAvailable } from "@/lib/focus-return"
import { AddMemberModal, EditMemberModal } from "./members/MemberFormModals"
import ImportModal from "./members/ImportModal"
import SortTh from "./members/SortTh"
import { availabilityLabel, hasAvailability } from "@/lib/availability"

type Props = {
  initialMembers: Member[]
  allTags: string[]
  /** `?q=` from the global search (#377): pre-filled, inactive members included. */
  initialSearch?: string
  /** `?verify=1` from the dashboard's attention item (#599): the filter starts on. */
  initialAddressToVerify?: boolean
  /** `?edit=<id>` from the member activity page's status action (#599): opens the edit form at once. */
  initialEditId?: string
  /** `?deleted=<name>` (#667): the member page just deleted this person and sent us here — nothing
   * left on that page to announce the outcome from. Announced once, on mount, then the URL is
   * cleaned up so a refresh doesn't repeat it. */
  initialDeletedName?: string
  /** Default "from"/"to" for the "Heures par bénévole" export form (#557), from volunteer-hours.ts's defaultPeriod. */
  defaultHoursPeriod: { from: string; to: string }
  /** Possible-duplicate pairs still suggested (#601), computed server-side (member-duplicates-data.ts). */
  duplicatesCount?: number
}

/** "2026-05-02" → "2 mai 2026", for the last-participation column (#557) and the address status date (#599). */
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

export default function MembersManager({ initialMembers, allTags, initialSearch, initialAddressToVerify, initialEditId, initialDeletedName, defaultHoursPeriod, duplicatesCount = 0 }: Props) {
  const router = useRouter()
  const members = initialMembers
  const [search, setSearch] = useState(initialSearch ?? "")
  const [tagFilter, setTagFilter] = useState<string>("")
  const [showInactive, setShowInactive] = useState(Boolean(initialSearch))
  const [addressToVerify, setAddressToVerify] = useState(Boolean(initialAddressToVerify))
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(
    initialEditId ? initialMembers.find((m) => m.id === initialEditId) ?? null : null,
  )
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [sortAnnouncement, setSortAnnouncement] = useState("")
  const [, startTransition] = useTransition()
  const [hoursFrom, setHoursFrom] = useState(defaultHoursPeriod.from)
  const [hoursTo, setHoursTo] = useState(defaultHoursPeriod.to)
  const hoursRangeValid = hoursFrom <= hoursTo
  const toVerifyCount = useMemo(() => addressesToVerifyCount(members), [members])

  function toggleSort(col: SortCol) {
    const next = nextSort({ col: sortCol, dir: sortDir }, col)
    setSortCol(next.col)
    setSortDir(next.dir)
    setSortAnnouncement(announceSort(next))
  }

  const filtered = useMemo(
    () => sortMembers(
      filterMembers(members, { search, tag: tagFilter, showInactive, addressToVerify }),
      { col: sortCol, dir: sortDir },
    ),
    [members, search, tagFilter, showInactive, addressToVerify, sortCol, sortDir],
  )

  const [resultAnnouncement, setResultAnnouncement] = useState("")
  // Skips the very first run (mount): nothing changed yet, nothing to announce.
  const filtersEverChangedRef = useRef(false)
  useEffect(() => {
    if (!filtersEverChangedRef.current) { filtersEverChangedRef.current = true; return }
    // Debounced (#599): `search` changes on every keystroke, and re-announcing the count on each
    // one would bury the person typing in noise. The other filters are discrete clicks, so the
    // same short delay just reads as a brief, acceptable pause before the result is announced.
    const t = setTimeout(() => {
      const n = filtered.length
      announce(setResultAnnouncement, n === 0 ? "Aucun membre ne correspond." : `${n} membre${n > 1 ? "s" : ""} affiché${n > 1 ? "s" : ""}.`)
    }, 400)
    return () => clearTimeout(t)
  }, [search, tagFilter, showInactive, addressToVerify, filtered.length])

  function refresh() {
    startTransition(() => router.refresh())
  }

  const [pendingDeactivate, setPendingDeactivate] = useState<{ id: string; name: string } | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Bumped whenever a confirm attempt (deactivate or delete) fails and the dialog stays open
  // (#667 accessibility review): a layout effect, same tick pattern as editSaveTick/
  // deleteConfirmTick below, refocuses the dialog's own submit button deterministically instead of
  // trusting that the click which triggered the request left it focused (not guaranteed, e.g.
  // Safari does not focus a clicked button) — no flash on the row's action, the dialog never closes.
  const [confirmErrorTick, setConfirmErrorTick] = useState(0)
  useLayoutEffect(() => {
    if (confirmErrorTick > 0) document.querySelector<HTMLElement>('[role="alertdialog"] button[type="submit"]')?.focus()
  }, [confirmErrorTick])
  const [actionMessage, setActionMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const actionRef = useRef<HTMLParagraphElement>(null)
  // The page heading, a fallback focus target (#599): see headingRef's use below.
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The ordered row ids at the moment « Supprimer » was confirmed (#667): read back once the
  // refreshed list no longer carries the deleted member, to find the next row's action (or the
  // previous one, or the heading) — see the layout effect below.
  const pendingDeleteFocusRef = useRef<{ id: string; orderedIds: string[] } | null>(null)
  // Set when an edit is saved (#599), read back once the refreshed list carries the edited member
  // — never before. A ref, not state: setting it must NOT by itself re-run the effect below (it
  // would, with `members` still the pre-save list — refresh() is async and lands later), only the
  // `members` prop actually changing through router.refresh() may.
  const pendingEditCheckRef = useRef<{ id: string; name: string; wasToVerify: boolean } | null>(null)
  // Bumped on every saved edit (#599): a trigger for the layout effect below, distinct from the
  // ref above so React actually schedules it.
  const [editSaveTick, setEditSaveTick] = useState(0)
  // Bumped on every successful deletion (#667): parks focus on the status line at once (same
  // "win the race against ModalShell's own opener-restore" reasoning as editSaveTick below), as a
  // stable first stop before the members-effect above moves it again, once refresh() lands, to
  // the real final target (the next row, or the heading) — the row that was the opener is gone.
  const [deleteConfirmTick, setDeleteConfirmTick] = useState(0)
  useLayoutEffect(() => {
    if (deleteConfirmTick > 0) actionRef.current?.focus()
  }, [deleteConfirmTick])

  /** Replaces the status line's text via announce() so identical consecutive messages (e.g.
   * désactiver the same way twice) still re-announce, same pattern as the sort announcement. */
  function announceAction(kind: "ok" | "error", text: string) {
    announce((t) => setActionMessage(t ? { kind, text: t } : null), text)
  }

  // The row's « Désactiver » button is gone after a refresh: park the focus on the outcome line.
  // Skipped while a successful deletion's focus hand-off is still pending (pendingDeleteFocusRef):
  // that one moves focus itself (the layout effect below), to the next row's action rather than
  // the status line, since the row itself is gone from the DOM — one hop, not two. Also skipped
  // once, consuming suppressStatusFocusRef, for the ?deleted= mount announcement (#667): that one
  // already placed focus on the heading itself and must not have it stolen back when the live
  // region's text actually lands a frame later (announce() clears, then sets, the message).
  const suppressStatusFocusRef = useRef(false)
  useEffect(() => {
    if (pendingDeactivate || pendingDelete || !actionMessage || pendingDeleteFocusRef.current) return
    if (suppressStatusFocusRef.current) { suppressStatusFocusRef.current = false; return }
    actionRef.current?.focus()
  }, [pendingDeactivate, pendingDelete, actionMessage])

  // Once the refreshed list no longer carries the deleted member (#667), move focus to the next
  // row's action, the previous row's if it was last, or the page heading if none remain — never
  // left on a removed row. A layout effect, synchronous before paint, same reasoning as the saved-
  // edit one above: it must win the race against anything else that could claim focus meanwhile.
  useLayoutEffect(() => {
    const pending = pendingDeleteFocusRef.current
    if (!pending) return
    if (members.some((m) => m.id === pending.id)) return // refresh() hasn't landed yet
    const idx = pending.orderedIds.indexOf(pending.id)
    const remaining = new Set(members.map((m) => m.id))
    const candidateIds = [...pending.orderedIds.slice(idx + 1), ...pending.orderedIds.slice(0, idx).reverse()].filter((id) => remaining.has(id))
    const candidates = candidateIds.map((id) => () => document.querySelector<HTMLElement>(`[data-edit-trigger="${id}"]`))
    focusFirstAvailable([...candidates, headingRef.current])
    pendingDeleteFocusRef.current = null
  }, [members])

  // Saving an edit (#599): focus the status line at once, synchronously (a layout effect, like
  // ModalShell's own documented "a parent that moves focus when the dialog closes wins" escape
  // hatch) — it would otherwise be a losing race against ModalShell's own "return focus to the
  // opener" (the row's « Éditer » button), landing focus there first and then, moments later once
  // router.refresh() resolves, somewhere else again: two hops to two different places. Parking on
  // the status line first, predictably, means only one hop whatever happens next: either nothing
  // (an unrelated action happens) or the live region's own text updates in place, read without
  // moving focus again — not the row, which the save can filter out of view by changing the
  // member's address status.
  useLayoutEffect(() => {
    if (editSaveTick > 0) actionRef.current?.focus()
  }, [editSaveTick])

  // Once the refreshed list carries the edited member, decide whether to mention the address flag
  // (#599): one announcement, not two — this replaces any announcement the save itself would make.
  useEffect(() => {
    const pending = pendingEditCheckRef.current
    if (!pending) return
    const m = members.find((x) => x.id === pending.id)
    if (!m) return
    const cleared = pending.wasToVerify && m.addressStatus.kind !== "to_verify"
    announceAction(
      "ok",
      cleared
        ? `Fiche de ${pending.name} enregistrée. Statut « Adresse à vérifier » levé.`
        : `Fiche de ${pending.name} enregistrée.`,
    )
    pendingEditCheckRef.current = null
  }, [members])

  // The member page just deleted someone and sent us here (#667): announce it once, on mount, and
  // clean the query string so a refresh doesn't repeat it.
  const announcedDeletionRef = useRef(false)
  useEffect(() => {
    if (!initialDeletedName || announcedDeletionRef.current) return
    announcedDeletionRef.current = true
    suppressStatusFocusRef.current = true
    announceAction("ok", `${initialDeletedName} supprimé·e.`)
    headingRef.current?.focus()
    router.replace("/admin/members")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function deactivate(id: string, name: string) {
    setDeactivateError(null)
    setPendingDeactivate({ id, name })
  }

  function askDelete(id: string, name: string) {
    setDeleteError(null)
    pendingDeleteFocusRef.current = { id, orderedIds: filtered.map((m) => m.id) }
    setPendingDelete({ id, name })
  }

  // « Doublon ? » (#599): opens the « Doublons possibles » view (#601) prefiltered to this
  // member's own pairs, rather than the plain name search it used to fall back to before #601.
  function searchForDuplicate(memberId: string) {
    router.push(`/admin/members/duplicates?member=${memberId}`)
  }

  function startEditing(m: Member) {
    setEditingMember(m)
  }

  function handleEditSaved(target: Member) {
    pendingEditCheckRef.current = { id: target.id, name: `${target.firstName} ${target.lastName}`, wasToVerify: target.addressStatus.kind === "to_verify" }
    // Cleared now, not left stale: the status line is about to take focus (see the layout effect
    // above) before router.refresh() has anything new to say.
    setActionMessage(null)
    setEditingMember(null)
    setEditSaveTick((n) => n + 1)
    refresh()
  }

  // On failure the dialog stays open (#667 accessibility review): ConfirmActionModal shows the
  // error itself (role="alert", offers « Réessayer »), same as MemberDeleteAction.tsx. It only
  // closes on success — no outer announcement either on failure, to avoid saying the same thing
  // twice (once in the dialog, once on the status line).
  async function runDeactivate(target: { id: string; name: string }) {
    setDeactivating(true)
    setDeactivateError(null)
    try {
      const res = await fetch(`/api/admin/members/${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeactivateError(typeof data?.error === "string" ? data.error : "La désactivation n'a pas abouti. Réessayez.")
        setConfirmErrorTick((n) => n + 1)
        return
      }
      announceAction("ok", `${target.name} désactivé·e.`)
      setPendingDeactivate(null)
      refresh()
    } catch {
      setDeactivateError("Connexion impossible : rien n'a changé. Réessayez.")
      setConfirmErrorTick((n) => n + 1)
    } finally {
      setDeactivating(false)
    }
  }

  async function runDelete(target: { id: string; name: string }) {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/members/${target.id}/delete`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(typeof data?.error === "string" ? data.error : "La suppression n'a pas abouti. Réessayez.")
        setConfirmErrorTick((n) => n + 1)
        return
      }
      announceAction("ok", `${target.name} supprimé·e.`)
      setDeleteConfirmTick((n) => n + 1)
      setPendingDelete(null)
      refresh()
    } catch {
      setDeleteError("Connexion impossible : rien n'a changé. Réessayez.")
      setConfirmErrorTick((n) => n + 1)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      {pendingDeactivate && (
        <ConfirmActionModal
          recap={deactivateMemberRecap(pendingDeactivate.name)}
          busy={deactivating}
          error={deactivateError}
          onConfirm={() => void runDeactivate(pendingDeactivate)}
          onCancel={() => { setDeactivateError(null); setPendingDeactivate(null) }}
        />
      )}
      {pendingDelete && (
        <ConfirmActionModal
          recap={deleteMemberRecap(pendingDelete.name)}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void runDelete(pendingDelete)}
          onCancel={() => { pendingDeleteFocusRef.current = null; setDeleteError(null); setPendingDelete(null) }}
        />
      )}
      <p
        ref={actionRef}
        tabIndex={-1}
        role={actionMessage?.kind === "error" ? "alert" : "status"}
        className={actionMessage ? `text-sm rounded-xl px-3 py-2 border focus:outline-none ${actionMessage.kind === "error" ? "text-red-800 bg-red-50 border-red-200" : "text-gray-800 bg-green-50 border-green-200"}` : "sr-only"}
      >
        {actionMessage?.text ?? ""}
      </p>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Membres</h1>
          <p className="text-sm text-gray-500">{members.length} membre{members.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {duplicatesCount > 0 && (
            <Link
              href="/admin/members/duplicates"
              className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Doublons possibles ({duplicatesCount})
            </Link>
          )}
          <a
            href="/api/admin/members/export"
            download
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Exporter les membres (CSV)<span className="sr-only"> (télécharge un fichier)</span>
          </a>
          <button
            onClick={() => setShowImport(true)}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Importer CSV/Excel
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            + Nouveau membre
          </button>
        </div>
      </div>

      <details className="bg-white border border-gray-200 rounded-xl p-3">
        <summary className="text-sm font-medium text-gray-800 cursor-pointer select-none">Heures par bénévole, pour une période (CSV)</summary>
        {/* A GET form: the period and the option travel in the link, the browser downloads the file
            (#557, same pattern as the badges form on Rapports). `min` on "Au" and the submit guard
            below catch an invalid range (end before start) before the request leaves — the route
            itself also refuses one (400), this is just the earlier, friendlier error. */}
        <form
          action="/api/admin/members/export-hours"
          method="get"
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            if (!hoursRangeValid) e.preventDefault()
          }}
        >
          <div>
            <label htmlFor="hours-from" className="block text-xs font-medium text-gray-700 mb-1">Du</label>
            <input
              id="hours-from"
              name="from"
              type="date"
              value={hoursFrom}
              onChange={(e) => setHoursFrom(e.target.value)}
              aria-invalid={!hoursRangeValid}
              aria-describedby={!hoursRangeValid ? "hours-period-error" : undefined}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
          </div>
          <div>
            <label htmlFor="hours-to" className="block text-xs font-medium text-gray-700 mb-1">Au</label>
            <input
              id="hours-to"
              name="to"
              type="date"
              min={hoursFrom}
              value={hoursTo}
              onChange={(e) => setHoursTo(e.target.value)}
              aria-invalid={!hoursRangeValid}
              aria-describedby={!hoursRangeValid ? "hours-period-error" : undefined}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
          </div>
          <label className="text-sm text-gray-700 flex items-center gap-1.5 pb-1.5">
            <input type="checkbox" name="includeAll" value="1" className="h-4 w-4 rounded border-gray-300" />
            Inclure les membres sans créneau confirmé sur la période
          </label>
          <button type="submit" className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Télécharger (CSV)<span className="sr-only"> (télécharge un fichier)</span>
          </button>
          {!hoursRangeValid && (
            <p id="hours-period-error" role="alert" className="text-sm text-red-700 basis-full">
              La date de fin précède la date de début : corrigez la période avant de télécharger.
            </p>
          )}
        </form>
      </details>

      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (nom, email, téléphone)…"
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <label htmlFor="members-tag-filter" className="text-sm text-gray-600">
          Étiquette
          <select
            id="members-tag-filter"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="ml-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">Tous les tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Inclure inactifs
        </label>
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={addressToVerify} onChange={(e) => setAddressToVerify(e.target.checked)} />
          Adresses à vérifier{toVerifyCount > 0 ? ` (${toVerifyCount})` : ""}
        </label>
      </div>

      {/* One result-count announcement for every filter (search, tag, inactif, adresses à
          vérifier), debounced above; always rendered, not only with the table (#599), since it
          must announce the zero-results case too. */}
      <div role="status" aria-live="polite" className="sr-only">{resultAnnouncement}</div>

      {filtered.length === 0 ? (
        members.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-5">
              <svg aria-hidden="true" className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Aucun membre dans le pool</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
              Ajoutez des bénévoles à votre pool pour les inviter à vos événements.
              Vous pouvez aussi importer un fichier CSV ou Excel.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                Ajouter un membre
              </button>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                Importer un fichier
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 text-sm">
            Aucun membre ne correspond aux filtres.
          </div>
        )
      ) : (
        <>
        <div role="status" aria-live="polite" className="sr-only">{sortAnnouncement}</div>
        {/* overflow-x-auto, not overflow-hidden (#557): two more columns made the table wider than
            some viewports; scrolling keeps every control on one line instead of squeezing them
            into wrapped, overlapping hit areas. tabIndex/role/aria-label: the scroll region itself
            is reachable and named for keyboard and screen-reader users (same pattern as the
            outbox table, settings/notifications). */}
        <div role="region" aria-label="Liste des membres" tabIndex={0} className="bg-white border border-gray-200 rounded-xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table aria-label="Liste des membres" className="w-full text-sm min-w-[64rem]">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <SortTh col="firstName" label="Prénom" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortTh col="lastName"  label="Nom"    sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <th scope="col" className="text-left px-4 py-2 font-medium">Contact</th>
                <th scope="col" className="text-left px-4 py-2 font-medium">Tags</th>
                <SortTh col="hoursTotal" label="Heures planifiées" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortTh col="hoursAttested" label="Heures attestées" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortTh col="lastShiftDate" label="Dernière participation" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <th scope="col" className="text-right px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className={`border-t border-gray-100 ${!m.active ? "bg-gray-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.firstName}</div>
                    {!m.active && <div className="text-xs text-gray-600">inactif</div>}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.lastName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.email && <div className="text-xs">{m.email}</div>}
                    {m.phone && <div className="text-xs text-gray-500">{m.phone}</div>}
                    {!m.email && !m.phone && <span className="text-xs text-gray-500">—</span>}
                    {hasAvailability(m) && <div className="text-xs text-gray-700 mt-0.5"><span className="sr-only">Disponible : </span><span aria-hidden="true">🕒 </span>{availabilityLabel(m)}</div>}
                    {m.addressStatus.kind !== "ok" && (
                      <div
                        className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium border forced-colors:border-[CanvasText] ${
                          m.addressStatus.kind === "to_verify"
                            ? "bg-amber-50 text-amber-900 border-amber-600"
                            : "bg-gray-100 text-gray-800 border-gray-500"
                        }`}
                      >
                        <span aria-hidden="true">⚠</span>
                        {addressStatusSentence(m.addressStatus, fmtDate)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.hoursTotal > 0 ? fmtHours(m.hoursTotal) : <span className="text-gray-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.hoursAttested > 0 ? fmtHours(m.hoursAttested) : <span className="text-gray-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.lastShiftDate ? (
                      <>
                        <div>{fmtDay(m.lastShiftDate)}</div>
                        <div className="text-xs text-gray-500">
                          {m.lastPresenceDate ? `Présence le ${fmtDay(m.lastPresenceDate)}` : "Aucune présence saisie"}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                    {/* min-h-6 (24px, #557 axe target-size): the hit area meets the minimum regardless of the small label text. whitespace-nowrap on the cell (the table now scrolls, see above) keeps the three controls on one line instead of wrapping into overlapping hit areas. */}
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="inline-flex items-center justify-center min-h-6 px-1.5 text-xs text-gray-700 hover:text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Activité{" "}<span className="sr-only">de {m.firstName} {m.lastName}</span>
                    </Link>
                    <button
                      data-edit-trigger={m.id}
                      onClick={() => startEditing(m)}
                      aria-label={`Éditer ${m.firstName} ${m.lastName}`}
                      className="inline-flex items-center justify-center min-h-6 px-1.5 text-xs text-gray-500 hover:text-blue-600"
                    >
                      Éditer
                    </button>
                    {m.addressStatus.kind === "to_verify" && (
                      <button
                        onClick={() => searchForDuplicate(m.id)}
                        aria-label={`Doublon ? Voir les doublons possibles de ${m.firstName} ${m.lastName}`}
                        className="inline-flex items-center justify-center min-h-6 px-1.5 text-xs text-gray-500 hover:text-blue-600"
                      >
                        Doublon ?
                      </button>
                    )}
                    {m.active && (
                      <button
                        onClick={() => deactivate(m.id, `${m.firstName} ${m.lastName}`)}
                        aria-label={`Désactiver ${m.firstName} ${m.lastName}`}
                        className="inline-flex items-center justify-center min-h-6 px-1.5 text-xs text-gray-500 hover:text-red-600"
                      >
                        Désactiver
                      </button>
                    )}
                    {/* Only for an eligible record (#667): inactive, no registration at all, not a
                        merged tombstone — never a dead button for the others. */}
                    {m.deletion.eligible && (
                      <button
                        onClick={() => askDelete(m.id, `${m.firstName} ${m.lastName}`)}
                        aria-label={`Supprimer ${m.firstName} ${m.lastName}`}
                        // DESIGN.md « Texte (danger) » (#b91c1c, pas de fond, pas de bord) : cette
                        // action est permanente, à la différence de « Désactiver » juste au-dessus.
                        className="inline-flex items-center justify-center min-h-6 px-1.5 text-xs font-medium text-red-700 hover:text-red-900"
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={refresh} />}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => handleEditSaved(editingMember)}
          // Deep-linked (?edit=id, #599): nothing was clicked to open it, so ModalShell has no
          // opener to restore focus to on cancel/Escape. Its row's « Éditer » button if the row is
          // still there (it normally is: cancelling changes nothing), else the page heading.
          fallbackFocusOnClose={() => document.querySelector<HTMLElement>(`[data-edit-trigger="${editingMember.id}"]`) ?? headingRef.current}
        />
      )}
    </div>
  )
}
