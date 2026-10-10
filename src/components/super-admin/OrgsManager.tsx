"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState, useTransition } from "react"
import { requestJson } from "@/lib/use-submit"
import { announce } from "@/lib/announce"
import { toggleOrgRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { useRouter } from "next/navigation"
import Link from "next/link"
import SortTh from "@/components/admin/members/SortTh"
import { ORG_SORT_LABELS, ORG_STATE_LABELS, orgSortKey, orgState, type OrgSortCol } from "@/lib/super-admin-tables"
import { nextSort, sortAnnouncement, sortRows, urlWithSort, type SortState } from "@/lib/table-sort"

type OrgCount = {
  events: number
  admins: number
  volunteers: number
}

type Org = {
  id: string
  name: string
  slug: string
  active: boolean
  suspendedAt: string | null
  publicationApprovedAt?: string | null
  outboundEmailApprovedAt?: string | null
  createdAt: string
  /** « 9 oct. 2026 », formatted by the page. */
  createdLabel: string
  _count: OrgCount
}

type Props = {
  initialOrgs: Org[]
  /** From `?tri=`: the sort chosen before a reload (#820). */
  initialSort?: SortState<OrgSortCol>
}

const STATE_TONE: Record<ReturnType<typeof orgState>, string> = {
  active: "text-gray-700",
  pending: "text-amber-800",
  deactivated: "text-red-700",
  suspended: "text-red-700",
}

export default function OrgsManager({ initialOrgs, initialSort = { col: null, dir: "asc" } }: Props) {
  const router = useRouter()
  const [sort, setSort] = useState(initialSort)
  const [sortStatus, setSortStatus] = useState("")
  const captionId = useId()
  const orgs = sortRows(initialOrgs, sort, orgSortKey)

  function toggleSort(col: OrgSortCol) {
    const next = nextSort(sort, col)
    setSort(next)
    // In the URL, so the order survives a reload; replaceState, not a new history entry per click.
    window.history.replaceState(null, "", urlWithSort(window.location.href, next))
    announce(setSortStatus, sortAnnouncement(next, ORG_SORT_LABELS))
  }
  const [, startTransition] = useTransition()

  function refresh() {
    startTransition(() => router.refresh())
  }

  // A toggle waits for its confirmation (#379); a failure stays in the dialog.
  const [pending, setPending] = useState<Org | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("")

  function toggleActive(org: Org) {
    setPendingError(null)
    setPending(org)
  }

  async function runToggle(org: Org) {
    setBusy(true)
    setPendingError(null)
    const result = await requestJson(() => fetch(`/api/super-admin/organizations/${org.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !org.active }),
    }), "La modification n'a pas été enregistrée.")
    setBusy(false)
    if (!result.ok) { setPendingError(result.error); return }
    setPending(null)
    announce(setOutcome, org.active ? `Organisation « ${org.name} » désactivée.` : `Organisation « ${org.name} » réactivée.`)
    refresh()
  }

  return (
    <div className="space-y-5">
      {pending && (
        <ConfirmActionModal recap={toggleOrgRecap(pending.name, pending.active)} busy={busy} error={pendingError} onConfirm={() => void runToggle(pending)} onCancel={() => setPending(null)} />
      )}
      <p role="status" className={outcome ? "text-sm text-gray-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2" : "sr-only"}>{outcome}</p>
      <p role="status" className="sr-only">{sortStatus}</p>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organisations</h1>
          <p className="text-sm text-gray-500">
            {orgs.length} organisation{orgs.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/super-admin/organizations/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          + Nouvelle organisation
        </Link>
      </div>

      {orgs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          Aucune organisation. Créez-en une pour commencer.
        </div>
      ) : (
        // Focusable region so a keyboard user can scroll the table sideways on a narrow screen.
        <div tabIndex={0} role="region" aria-labelledby={captionId} className="bg-white border border-gray-200 rounded-xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table className="w-full text-sm">
            <caption id={captionId} className="sr-only">Organisations, triables par colonne</caption>
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <SortTh col="nom" label="Nom" sortCol={sort.col} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh col="slug" label="Slug" sortCol={sort.col} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh col="etat" label="État" sortCol={sort.col} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh col="creation" label="Création" sortCol={sort.col} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh col="evenements" label="Événements" align="right" sortCol={sort.col} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh col="admins" label="Admins" align="right" sortCol={sort.col} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh col="membres" label="Membres" align="right" sortCol={sort.col} sortDir={sort.dir} onSort={toggleSort} />
                <th scope="col" className="text-right px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-gray-100" /* no opacity on an inactive row: it took the text under 4.5:1; the label says the state */>
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/organizations/${org.slug}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{org.slug}</td>
                  <td className={`px-4 py-3 text-xs ${STATE_TONE[orgState(org)]}`}>{ORG_STATE_LABELS[orgState(org)]}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{org.createdLabel}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{org._count.events}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{org._count.admins}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{org._count.volunteers}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/super-admin/organizations/${org.slug}`}
                        className="text-xs text-gray-500 hover:text-blue-600"
                      >
                        Détail
                      </Link>
                      {/* A suspended organisation (#810) is only handled from its detail page. */}
                      {!org.suspendedAt && (
                        <button
                          type="button"
                          onClick={() => toggleActive(org)}
                          aria-label={`${org.active ? "Désactiver" : "Réactiver"} l'organisation ${org.name}`}
                          className={`text-xs ${org.active ? "text-gray-600 hover:text-red-700" : "text-gray-600 hover:text-green-700"}`}
                        >
                          {org.active ? "Désactiver" : "Réactiver"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
