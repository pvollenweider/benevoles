// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { formatCount, type UsageRow } from "@/lib/usage-counters"
import { loadPlatformUsage, loadSignupFacts, loadSignupSources } from "@/lib/usage-stats"
import { signupSourceRows } from "@/lib/signup-source"
import { signupIndicatorRows } from "@/lib/signup-indicators"
import { observePastEvents } from "@/lib/past-event-retention-data"
import { PAST_EVENT_RETENTION_YEARS, pastEventRetentionMode } from "@/lib/past-event-retention"
import { loadOperatorActivity, type NextEventRow, type OperatorActivity } from "@/lib/operator-activity-data"
import { loadOperatorLoad } from "@/lib/operator-load-data"
import { busiestHourSentence, eventDatesLabel, UPCOMING_SITUATION_LABELS } from "@/lib/operator-activity"
import OperatorLoadChart from "@/components/super-admin/OperatorLoadChart"
import PastEventRetentionTable from "@/components/super-admin/PastEventRetentionTable"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Statistiques" }

/** Anchor links of the in-page summary, in reading order. Each target is the section's heading id. */
const SECTIONS = [
  { id: "stats-events", label: "Événements" },
  { id: "stats-activity", label: "Activité des inscriptions" },
  { id: "stats-event-load", label: "Charge par jour" },
  { id: "stats-next-events", label: "Les 10 prochains événements" },
  { id: "stats-cumulative", label: "Depuis le début" },
  { id: "stats-current", label: "En ce moment" },
  { id: "stats-signup", label: "Inscription en libre-service" },
  { id: "stats-signup-source", label: "Comment les espaces nous ont connus" },
  { id: "stats-past-events", label: `Événements terminés depuis plus de ${PAST_EVENT_RETENTION_YEARS} ans` },
] as const

/**
 * Platform usage for the super admin (#805): « Charge actuelle » (what weighs on the platform now)
 * then « Croissance et inscription » (what the counters say over time). Each section keeps one
 * short sentence; the secondary caveats live in a native « Comment ces chiffres sont calculés »
 * disclosure, so the page reads without nine intros of equal weight.
 *
 * #1415 adds the operator's load view: events happening now or soon, the registration rhythm
 * against the previous period, the busiest hour, the outbox and « Charge par jour », the stacked
 * shift bars and event line over a range centred on today. Computed on page load, no live refresh.
 * The chart carries its own period/event detail, then a single merged list of the 10 next events.
 */
export default async function StatsPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const [{ cumulative, current }, signupFacts, signupSources, pastEvents, operator, operatorLoad] = await Promise.all([
    loadPlatformUsage(),
    loadSignupFacts(),
    loadSignupSources(),
    observePastEvents(),
    loadOperatorActivity(),
    loadOperatorLoad(),
  ])
  const signup = signupIndicatorRows(signupFacts)

  return (
    <div className="space-y-8">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Statistiques</h1>
        <p className="text-sm text-gray-700 mt-1">
          L&apos;utilisation de la plateforme, toutes organisations confondues.
        </p>
      </div>

      <nav aria-label="Sections de la page" className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-xs font-medium text-gray-700">Sur cette page</p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-6 items-center rounded text-sm text-blue-700 underline underline-offset-2 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="stats-load">
        <h2 id="stats-load" className="text-lg font-semibold text-gray-900">Charge actuelle</h2>
        <div className="mt-3 space-y-8">
          <EventCounts counts={operator.counts} />

          <ActivityPanel activity={operator.activity} />

          <section className="space-y-2" aria-labelledby="stats-event-load">
            <h3 id="stats-event-load" className="text-sm font-semibold text-gray-900">Charge par jour</h3>
            <p id="stats-event-load-intro" className="text-sm text-gray-700">
              Les barres donnent les créneaux (axe de gauche, les cinq plus gros événements de la période en couleur), la courbe le nombre d&apos;événements avec au moins un créneau (axe de droite), et le passé grisé compte aussi les événements archivés.
            </p>
            <CalculationDetails topic="Charge par jour">
              Événements publiés et archivés (les brouillons sont exclus, les événements non listés publiés comptent), créneaux non annulés, inscriptions actives sur ces créneaux, jours lus à l&apos;heure de Zurich. Un événement compte sur une période dès qu&apos;il y a au moins un créneau ; les cinq plus gros de la période affichée sont en couleur, les autres en gris. Une semaine et un mois sont découpés par jour, 6 mois et un an par semaine, avec une semaine qui commence aujourd&apos;hui.
            </CalculationDetails>
            <OperatorLoadChart data={operatorLoad} />
          </section>

          <NextEventsTable rows={operator.nextEvents} />
        </div>
      </section>

      <section aria-labelledby="stats-growth">
        <h2 id="stats-growth" className="text-lg font-semibold text-gray-900">Croissance et inscription</h2>
        <div className="mt-3 space-y-8">
          <UsageTable
            id="stats-cumulative"
            title="Depuis le début"
            intro="Ce qui a été créé depuis le début, y compris ce qui a été supprimé depuis."
            details="Ces chiffres ne baissent jamais : une suppression, même d'une organisation entière, ne les diminue pas. Ils ont été initialisés le jour de leur mise en place à partir de ce que contenait la base ; ce qui avait été supprimé avant n'y figure pas."
            rows={cumulative}
          />
          <UsageTable
            id="stats-current"
            title="En ce moment"
            intro="Ce que la base contient maintenant."
            rows={current}
          />
          <UsageTable
            id="stats-signup"
            title="Inscription en libre-service"
            intro="Ce qui dit si la validation à la main reste nécessaire."
            details="Les décisions comptent sur 12 mois (le journal de l'opérateur les garde un an) ; un envoi reporté plusieurs fois compte à chaque fois."
            rows={signup}
          />
          <UsageTable
            id="stats-signup-source"
            title="Comment les espaces nous ont connus"
            intro="La réponse facultative à « Comment avez-vous connu le site ? » du formulaire de demande d'espace."
            details="Pour les espaces créés par l'inscription en libre-service et encore présents. « Sans réponse » compte aussi les espaces créés avant que la question existe."
            rows={signupSourceRows(signupSources)}
          />
          <PastEventRetentionTable rows={pastEvents} mode={pastEventRetentionMode()} />
        </div>
      </section>
    </div>
  )
}

/** Native disclosure for the calculation detail: closed by default, all text still in the DOM. */
function CalculationDetails({ topic, children }: { topic: string; children: ReactNode }) {
  return (
    <details className="text-sm text-gray-700">
      <summary className="w-fit cursor-pointer rounded font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Comment ces chiffres sont calculés<span className="sr-only"> : {topic}</span>
      </summary>
      <p className="mt-1 max-w-prose">{children}</p>
    </details>
  )
}

/** The five event counts, as a compact label/figure grid rather than a two-column table. */
function EventCounts({ counts }: { counts: OperatorActivity["counts"] }) {
  const rows = [
    { key: "events_now", label: "En cours aujourd'hui", value: counts.now },
    { key: "events_within7", label: "Qui commencent dans les 7 jours", value: counts.startingWithin7 },
    { key: "events_within30", label: "Qui commencent dans les 30 jours (7 jours compris)", value: counts.startingWithin30 },
    { key: "registrations_open", label: "Inscriptions ouvertes maintenant", value: counts.registrationsOpenNow },
    { key: "openings_within7", label: "Ouvertures d'inscriptions prévues dans les 7 jours", value: counts.registrationOpeningsNext7Days },
  ]
  return (
    <section className="space-y-2" aria-labelledby="stats-events">
      <h3 id="stats-events" className="text-sm font-semibold text-gray-900">Événements</h3>
      <p id="stats-events-intro" className="text-sm text-gray-700">
        Événements publiés seulement, jours lus à l&apos;heure de Zurich.
      </p>
      <CalculationDetails topic="Événements">
        Les brouillons et les archivés ne comptent pas ; les événements non listés (publiés) comptent. Les jours suivent Europe/Zurich, le fuseau des événements.
      </CalculationDetails>
      <dl
        aria-describedby="stats-events-intro"
        className="grid gap-x-6 gap-y-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        {rows.map((row) => (
          <div key={row.key}>
            <dt className="text-gray-700">{row.label}</dt>
            <dd className="font-semibold tabular-nums text-gray-900">{formatCount(row.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ActivityPanel({ activity }: { activity: OperatorActivity["activity"] }) {
  return (
    <section className="space-y-2" aria-labelledby="stats-activity">
      <h3 id="stats-activity" className="text-sm font-semibold text-gray-900">Activité des inscriptions</h3>
      <p id="stats-activity-intro" className="text-sm text-gray-700">
        Chaque période est comparée à la précédente, de même durée.
      </p>
      <CalculationDetails topic="Activité des inscriptions">
        Toutes les inscriptions enregistrées comptent, quel que soit leur statut actuel. L&apos;heure la plus chargée est lue à l&apos;heure de Zurich.
      </CalculationDetails>
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
      <h3 id="stats-next-events" className="text-sm font-semibold text-gray-900">Les 10 prochains événements</h3>
      <p id="stats-next-events-intro" className="text-sm text-gray-700">
        Événements publiés dont le dernier jour est aujourd&apos;hui ou plus tard, par date de début.
      </p>
      <CalculationDetails topic="Les 10 prochains événements">
        Le remplissage est le rapport entre les inscriptions confirmées et les places des créneaux non annulés. La situation suit les jours de Zurich. Aucune donnée sur les bénévoles.
      </CalculationDetails>
      <div
        role="region"
        aria-labelledby="stats-next-events"
        tabIndex={0}
        className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <table className="w-full text-sm" aria-describedby="stats-next-events-intro">
          <caption className="sr-only">Les 10 prochains événements, avec leur organisation, leurs dates, leur situation, leurs créneaux, leurs inscriptions et leur taux de remplissage</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Événement</th>
              <th scope="col" className="px-4 py-2 font-medium">Dates</th>
              <th scope="col" className="px-4 py-2 font-medium">Situation</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Créneaux</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Inscriptions</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Remplissage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-2 text-gray-700">Aucun événement publié à venir.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <span className="block font-medium break-words text-gray-900">{row.title}</span>
                    <Link
                      href={`/super-admin/organizations/${row.organizationSlug}`}
                      className="mt-0.5 block w-fit text-xs break-words text-gray-600 underline underline-offset-2 rounded hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {row.organizationName}
                      <span className="sr-only"> (fiche de l&apos;organisation)</span>
                    </Link>
                  </th>
                  <td className="px-4 py-2 text-gray-700">{eventDatesLabel(row.startDate, row.endDate)}</td>
                  <td className="px-4 py-2 text-gray-700">{UPCOMING_SITUATION_LABELS[row.situation]}</td>
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

function UsageTable({ id, title, intro, details, rows }: { id: string; title: string; intro?: string; details?: ReactNode; rows: (UsageRow | { key: string; label: string; value: string | number })[] }) {
  return (
    <section className="space-y-2" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-semibold text-gray-900">{title}</h3>
      {intro && <p id={`${id}-intro`} className="text-sm text-gray-700">{intro}</p>}
      {details && <CalculationDetails topic={title}>{details}</CalculationDetails>}
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
