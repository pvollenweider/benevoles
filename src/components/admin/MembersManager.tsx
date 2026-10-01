"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { deactivateMemberRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { useRouter } from "next/navigation"
import { fmtHours } from "@/lib/gantt-utils"
import { filterMembers, nextSort, sortAnnouncement as announceSort, sortMembers, type Member, type SortCol, type SortDir } from "@/lib/members-list"
import { AddMemberModal, EditMemberModal } from "./members/MemberFormModals"
import ImportModal from "./members/ImportModal"
import SortTh from "./members/SortTh"
import { availabilityLabel, hasAvailability } from "@/lib/availability"

type Props = {
  initialMembers: Member[]
  allTags: string[]
  /** `?q=` from the global search (#377): pre-filled, inactive members included. */
  initialSearch?: string
}

export default function MembersManager({ initialMembers, allTags, initialSearch }: Props) {
  const router = useRouter()
  const members = initialMembers
  const [search, setSearch] = useState(initialSearch ?? "")
  const [tagFilter, setTagFilter] = useState<string>("")
  const [showInactive, setShowInactive] = useState(Boolean(initialSearch))
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [sortAnnouncement, setSortAnnouncement] = useState("")
  const [, startTransition] = useTransition()

  function toggleSort(col: SortCol) {
    const next = nextSort({ col: sortCol, dir: sortDir }, col)
    setSortCol(next.col)
    setSortDir(next.dir)
    setSortAnnouncement(announceSort(next))
  }

  const filtered = useMemo(
    () => sortMembers(
      filterMembers(members, { search, tag: tagFilter, showInactive }),
      { col: sortCol, dir: sortDir },
    ),
    [members, search, tagFilter, showInactive, sortCol, sortDir],
  )

  function refresh() {
    startTransition(() => router.refresh())
  }

  const [pendingDeactivate, setPendingDeactivate] = useState<{ id: string; name: string } | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const actionRef = useRef<HTMLParagraphElement>(null)

  // The row's « Désactiver » button is gone after a refresh: park the focus on the outcome line.
  useEffect(() => {
    if (!pendingDeactivate && actionMessage) actionRef.current?.focus()
  }, [pendingDeactivate, actionMessage])

  function deactivate(id: string, name: string) {
    setPendingDeactivate({ id, name })
  }

  async function runDeactivate(target: { id: string; name: string }) {
    setDeactivating(true)
    try {
      const res = await fetch(`/api/admin/members/${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionMessage({ kind: "error", text: typeof data?.error === "string" ? data.error : "La désactivation n'a pas abouti. Réessayez." })
        return
      }
      setActionMessage({ kind: "ok", text: `${target.name} désactivé·e.` })
      refresh()
    } catch {
      setActionMessage({ kind: "error", text: "Connexion impossible : rien n'a changé. Réessayez." })
    } finally {
      setDeactivating(false)
      setPendingDeactivate(null)
    }
  }

  return (
    <div className="space-y-5">
      {pendingDeactivate && (
        <ConfirmActionModal recap={deactivateMemberRecap(pendingDeactivate.name)} busy={deactivating} onConfirm={() => void runDeactivate(pendingDeactivate)} onCancel={() => setPendingDeactivate(null)} />
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
          <h1 className="text-xl font-bold text-gray-900">Membres</h1>
          <p className="text-sm text-gray-500">{members.length} membre{members.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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

      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (nom, email, téléphone)…"
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Tous les tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Inclure inactifs
        </label>
      </div>

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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table aria-label="Liste des membres" className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <SortTh col="firstName" label="Prénom" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortTh col="lastName"  label="Nom"    sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <th scope="col" className="text-left px-4 py-2 font-medium">Contact</th>
                <th scope="col" className="text-left px-4 py-2 font-medium">Tags</th>
                <SortTh col="hoursTotal" label="Heures planifiées" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
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
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="text-xs text-gray-700 hover:text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Activité{" "}<span className="sr-only">de {m.firstName} {m.lastName}</span>
                    </Link>
                    <button
                      onClick={() => setEditingMember(m)}
                      aria-label={`Éditer ${m.firstName} ${m.lastName}`}
                      className="text-xs text-gray-500 hover:text-blue-600"
                    >
                      Éditer
                    </button>
                    {m.active && (
                      <button
                        onClick={() => deactivate(m.id, `${m.firstName} ${m.lastName}`)}
                        aria-label={`Désactiver ${m.firstName} ${m.lastName}`}
                        className="text-xs text-gray-500 hover:text-red-600"
                      >
                        Désactiver
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
          onSaved={() => { setEditingMember(null); refresh() }}
        />
      )}
    </div>
  )
}
