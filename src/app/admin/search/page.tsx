// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { membersHref, registrationsHref, searchTerms, shiftHref, SEARCH_GROUP_LIMIT, SEARCH_MAX_LENGTH } from "@/lib/admin-search"
import { loadSearch } from "@/lib/admin-search-data"
import { formatShortDate } from "@/lib/utils"
import StatusBadge from "@/components/admin/StatusBadge"

export const dynamic = "force-dynamic"
type Search = { searchParams: Promise<{ q?: string | string[] }> }

const queryOf = (q: string | string[] | undefined) => (Array.isArray(q) ? q[0] : q ?? "").slice(0, SEARCH_MAX_LENGTH).trim()

// The query in the title: each results page is told apart in history and when announced.
export async function generateMetadata({ searchParams }: Search): Promise<Metadata> {
  const q = queryOf((await searchParams).q)
  return { title: q ? `Recherche « ${q.slice(0, 60)} »` : "Recherche" }
}

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

// Shift.date is stored as UTC midnight of the shift's day.
const shiftDay = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

function Group({ id, title, count, more, children }: { id: string; title: string; count: number; more: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold text-gray-900">
        {title} <span className="text-sm font-normal text-gray-600">({more ? `${count} premiers` : count})</span>
      </h2>
      {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets. */}
      <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {children}
      </ul>
      {more && (
        <p className="text-sm text-gray-600">
          Seuls les {SEARCH_GROUP_LIMIT} premiers résultats sont affichés : précisez la recherche pour les autres.
        </p>
      )}
    </section>
  )
}

/** Admin global search (#377): volunteers, registrations, events and shifts of the organization. */
export default async function SearchPage({ searchParams }: Search) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const q = queryOf((await searchParams).q)
  const terms = searchTerms(q)
  const results = terms.length > 0 ? await loadSearch(ctx.db, ctx.organizationId, terms) : null
  const total = results
    ? results.volunteers.items.length + results.registrations.items.length + results.events.items.length + results.shifts.items.length
    : 0

  return (
    <div className="space-y-6">
      <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">
        Recherche
      </h1>

      <form role="search" aria-label="Recherche dans l'organisation" action="/admin/search" className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-48">
          <label htmlFor="search-page-q" className="block text-sm font-medium text-gray-700 mb-1">
            Nom, email, téléphone, événement ou poste
          </label>
          <input
            id="search-page-q"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={SEARCH_MAX_LENGTH}
            className="w-full border border-gray-500 rounded-lg px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          />
        </div>
        <button
          type="submit"
          className="min-h-10 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Rechercher
        </button>
      </form>

      {!results ? (
        <p className="text-sm text-gray-600">
          Retrouvez un bénévole, ses inscriptions, un événement ou un poste. Astuce : depuis n&apos;importe quelle page de l&apos;admin, <kbd className="px-1 border border-gray-500 rounded text-xs">Ctrl</kbd> + <kbd className="px-1 border border-gray-500 rounded text-xs">K</kbd> (<kbd className="px-1 border border-gray-500 rounded text-xs">⌘</kbd> + <kbd className="px-1 border border-gray-500 rounded text-xs">K</kbd> sur Mac) place le curseur dans le champ de recherche.
        </p>
      ) : total === 0 ? (
        <p className="text-sm text-gray-700">
          Aucun résultat pour « {q} ». Vérifiez l&apos;orthographe, les accents compris (« Zoe » ne trouve pas « Zoé »), ou essayez un seul mot.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            {total} résultat{total > 1 ? "s" : ""} pour « {q} »
          </p>

          {results.volunteers.items.length > 0 && (
            <Group id="search-volunteers" title="Bénévoles" count={results.volunteers.items.length} more={results.volunteers.more}>
              {results.volunteers.items.map((v) => (
                <li key={v.id} className="px-4 py-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link href={membersHref(v)} className={linkClass}>
                    {v.firstName} {v.lastName}
                  </Link>
                  {v.email && <span className="text-gray-600 break-all">{v.email}</span>}
                  {v.phone && <span className="text-gray-600">{v.phone}</span>}
                  {!v.active && <span className="text-xs text-gray-600">(inactif)</span>}
                </li>
              ))}
            </Group>
          )}

          {results.registrations.items.length > 0 && (
            <Group id="search-registrations" title="Inscriptions" count={results.registrations.items.length} more={results.registrations.more}>
              {results.registrations.items.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link href={registrationsHref(r.event.id, r.volunteer)} className={linkClass}>
                      {r.volunteer.firstName} {r.volunteer.lastName}
                      <span className="sr-only"> : {r.event.title}</span>
                    </Link>
                    {r.status !== "active" && <StatusBadge status={r.status} />}
                  </div>
                  <p className="text-gray-600">
                    {r.event.title} · {r.shift.roleName} {r.shift.label} · {shiftDay(r.shift.date)}, {r.shift.startTime}–{r.shift.endTime}
                  </p>
                </li>
              ))}
            </Group>
          )}

          {results.events.items.length > 0 && (
            <Group id="search-events" title="Événements" count={results.events.items.length} more={results.events.more}>
              {results.events.items.map((e) => (
                <li key={e.id} className="px-4 py-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link href={`/admin/events/${e.id}`} className={linkClass}>
                    {e.title}
                  </Link>
                  <span className="text-gray-600">{formatShortDate(e.startDate)}</span>
                  <StatusBadge status={e.publicStatus} />
                </li>
              ))}
            </Group>
          )}

          {results.shifts.items.length > 0 && (
            <Group id="search-shifts" title="Créneaux" count={results.shifts.items.length} more={results.shifts.more}>
              {results.shifts.items.map((s) => (
                <li key={s.id} className="px-4 py-3 text-sm space-y-1">
                  <Link href={shiftHref(s.event.id, s.id)} className={linkClass}>
                    {s.roleName} {s.label}
                    <span className="sr-only"> : {s.event.title}, {shiftDay(s.date)}, {s.startTime}</span>
                  </Link>
                  <p className="text-gray-600">
                    {s.event.title} · {shiftDay(s.date)}, {s.startTime}–{s.endTime}
                  </p>
                </li>
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  )
}
