// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { formatCount, type UsageRow } from "@/lib/usage-counters"
import { loadPlatformUsage, loadSignupFacts, loadSignupSources } from "@/lib/usage-stats"
import { signupSourceRows } from "@/lib/signup-source"
import { signupIndicatorRows } from "@/lib/signup-indicators"
import { observePastEvents } from "@/lib/past-event-retention-data"
import { pastEventRetentionMode } from "@/lib/past-event-retention"
import { loadOperatorActivity, type NextEventRow, type OperatorActivity } from "@/lib/operator-activity-data"
import { busiestHourSentence, eventDatesLabel } from "@/lib/operator-activity"
import OperatorActivitySection from "@/components/super-admin/OperatorActivitySection"
import PastEventRetentionTable from "@/components/super-admin/PastEventRetentionTable"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Statistiques" }

/**
 * Platform usage for the super admin (#805): « Depuis le début », counters that a deletion never
 * lowers (a deleted organisation's counts included), beside « En ce moment », what the database
 * holds now. Counts, plus organisation and event names in the two event lists; no volunteer data.
 * Each table is named by its caption only (the section carries no aria-labelledby: the name would
 * be announced twice).
 *
 * #1415 adds the operator's load view: events happening now or soon, the registration rhythm
 * against the previous period, the busiest hour, the outbox and the bubble chart of the events that
 * weigh on the platform. Computed on page load, no live refresh.
 */
export default async function StatsPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const [{ cumulative, current }, signupFacts, signupSources, pastEvents, operator] = await Promise.all([
    loadPlatformUsage(),
    loadSignupFacts(),
    loadSignupSources(),
    observePastEvents(),
    loadOperatorActivity(),
  ])
  const signup = signupIndicatorRows(signupFacts)

  return (
    <div className="space-y-8">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Statistiques</h1>
        <p className="text-sm text-gray-700 mt-1">
          L&apos;utilisation de la plateforme, toutes organisations confondues. Les chiffres « depuis le début » ne baissent jamais : une suppression, même d&apos;une organisation entière, ne les diminue pas. Ils ont été initialisés le jour de leur mise en place à partir de ce que contenait la base ; ce qui avait été supprimé avant n&apos;y figure pas.
        </p>
      </div>

      <UsageTable
        id="stats-events"
        title="Événements"
        intro="Événements publiés seulement : les brouillons et les archivés ne comptent pas, les événements non listés (publiés) comptent. Les jours suivent Europe/Zurich, le fuseau des événements."
        rows={[
          { key: "events_now", label: "En cours aujourd'hui", value: operator.counts.now },
          { key: "events_within7", label: "Qui commencent dans les 7 jours", value: operator.counts.startingWithin7 },
          { key: "events_within30", label: "Qui commencent dans les 30 jours (7 jours compris)", value: operator.counts.startingWithin30 },
          { key: "registrations_open", label: "Inscriptions ouvertes maintenant", value: operator.counts.registrationsOpenNow },
          { key: "openings_within7", label: "Ouvertures d'inscriptions prévues dans les 7 jours", value: operator.counts.registrationOpeningsNext7Days },
        ]}
      />

      <ActivityPanel activity={operator.activity} />

      <section className="space-y-2" aria-labelledby="stats-event-size">
        <h2 id="stats-event-size" className="text-lg font-semibold text-gray-900">Taille des événements</h2>
        <p id="stats-event-size-intro" className="text-sm text-gray-700">
          Les événements en cours ou qui commencent dans les 30 jours : une bulle par événement, selon sa date de début (horizontal), ses inscriptions (vertical) et ses créneaux (surface). Le tableau qui suit donne les mêmes valeurs, toujours accessibles.
        </p>
        <OperatorActivitySection data={operator.bubble} />
      </section>

      <NextEventsTable rows={operator.nextEvents} />

      <UsageTable id="stats-cumulative" title="Depuis le début" rows={cumulative} />
      <UsageTable id="stats-current" title="En ce moment" rows={current} />
      <UsageTable
        id="stats-signup"
        title="Inscription en libre-service"
        intro="Ce qui dit si la validation à la main reste nécessaire. Les décisions comptent sur 12 mois (le journal de l'opérateur les garde un an) ; un envoi reporté plusieurs fois compte à chaque fois."
        rows={signup}
      />
      <UsageTable
        id="stats-signup-source"
        title="Comment les espaces nous ont connus"
        intro="La réponse facultative à « Comment avez-vous connu le site ? » du formulaire de demande d'espace, pour les espaces créés par l'inscription en libre-service et encore présents. « Sans réponse » compte aussi les espaces créés avant que la question existe."
        rows={signupSourceRows(signupSources)}
      />
      <PastEventRetentionTable rows={pastEvents} mode={pastEventRetentionMode()} />
    </div>
  )
}

function ActivityPanel({ activity }: { activity: OperatorActivity["activity"] }) {
  return (
    <section className="space-y-2" aria-labelledby="stats-activity">
      <h2 id="stats-activity" className="text-lg font-semibold text-gray-900">Activité des inscriptions</h2>
      <p id="stats-activity-intro" className="text-sm text-gray-700">
        Chaque période est comparée à la précédente, de même durée. Toutes les inscriptions enregistrées comptent, quel que soit leur statut actuel. L&apos;heure la plus chargée est lue à l&apos;heure de Zurich.
      </p>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm" aria-describedby="stats-activity-intro">
          <caption className="sr-only">Activité des inscriptions et comparaison avec la période précédente</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Période</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Inscriptions</th>
              <th scope="col" className="px-4 py-2 font-medium">Comparaison</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activity.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900">{row.label}</th>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{formatCount(row.current)}</td>
                <td className="px-4 py-2 text-gray-700">{row.comparison.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <dt className="font-normal text-gray-900">Heure la plus chargée des 7 derniers jours</dt>
        <dd className="tabular-nums text-gray-700">{busiestHourSentence(activity.busiestHour)}</dd>
        <dt className="font-normal text-gray-900">Emails en attente dans la file d&apos;envoi</dt>
        <dd className="tabular-nums text-gray-700">{formatCount(activity.outboxWaiting)}</dd>
      </dl>
    </section>
  )
}

function NextEventsTable({ rows }: { rows: NextEventRow[] }) {
  return (
    <section className="space-y-2">
      <h2 id="stats-next-events" className="text-lg font-semibold text-gray-900">Les 10 prochains événements</h2>
      <p id="stats-next-events-intro" className="text-sm text-gray-700">
        Événements publiés dont le dernier jour est aujourd&apos;hui ou plus tard, par date de début. Le remplissage est le rapport entre les inscriptions confirmées et les places des créneaux non annulés. Aucune donnée sur les bénévoles.
      </p>
      <div
        role="region"
        aria-labelledby="stats-next-events"
        tabIndex={0}
        className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <table className="w-full text-sm" aria-describedby="stats-next-events-intro">
          <caption className="sr-only">Les 10 prochains événements, avec leurs dates, postes, créneaux, inscriptions et taux de remplissage</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Organisation</th>
              <th scope="col" className="px-4 py-2 font-medium">Événement</th>
              <th scope="col" className="px-4 py-2 font-medium">Dates</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Postes</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Créneaux</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Inscriptions</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Remplissage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-2 text-gray-700">Aucun événement publié à venir.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 break-words text-gray-700">{row.organizationName}</td>
                  <th scope="row" className="px-4 py-2 text-left font-medium break-words text-gray-900">{row.title}</th>
                  <td className="px-4 py-2 text-gray-700">{eventDatesLabel(row.startDate, row.endDate)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{row.roles}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{row.shifts}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{row.registrations}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">
                    {row.fillPercent === null ? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">non calculable, aucune place</span>
                      </>
                    ) : `${row.fillPercent} %`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function UsageTable({ id, title, intro, rows }: { id: string; title: string; intro?: string; rows: (UsageRow | { key: string; label: string; value: string | number })[] }) {
  return (
    <section className="space-y-2">
      <h2 id={id} className="text-lg font-semibold text-gray-900">{title}</h2>
      {intro && <p id={`${id}-intro`} className="text-sm text-gray-700">{intro}</p>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm" aria-describedby={intro ? `${id}-intro` : undefined}>
          <caption className="sr-only">{title}</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Indicateur</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Valeur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900 break-words">{r.label}</th>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 break-words">{typeof r.value === "number" ? formatCount(r.value) : r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
