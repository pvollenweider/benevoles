// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { SHEET_VIEWS } from "@/lib/print-sheets"
import { reprintOptions } from "@/lib/print-badges"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { eventSummary, type EventSummaryRegistration } from "@/lib/event-summary"
import { returningVolunteerIds } from "@/lib/volunteer-hours"
import { fmtDuration } from "@/lib/signup-recap"
import { orgTimeZone } from "@/lib/time-zone"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Rapports" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

// Shift.date is a UTC midnight for the calendar day.
const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })

/**
 * Reports of an event (#400): sheets for volunteers, then organizer-only documents (the full export
 * first), badges, and the JSON archive last. Reports open in a new tab and are printed from there.
 */
export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const [event, org] = await Promise.all([
    ctx.db.event.findFirst({
      where: { id },
      select: {
        id: true, title: true, startDate: true, endDate: true,
        shifts: {
          where: { status: { not: "cancelled" } },
          orderBy: { displayOrder: "asc" },
          select: {
            id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, status: true,
            registrations: {
              where: { status: { in: [...LIVE_STATUSES] } },
              select: { status: true, checkedInAt: true, volunteerId: true, volunteer: { select: { id: true, firstName: true, lastName: true, email: true } } },
            },
          },
        },
        sectorLeaders: { select: { roleName: true } },
      },
    }),
    ctx.db.organization.findUnique({ where: { id: ctx.organizationId }, select: { timeZone: true } }),
  ])
  if (!event) notFound()
  const roles = [...new Set(event.shifts.map((s) => s.roleName))]
  // For the badge reprint: one option per volunteer id; two homonyms are told apart by their email.
  const volunteers = reprintOptions(
    event.shifts.flatMap((s) => s.registrations.filter((r) => r.status === "active").map((r) => ({ ...r.volunteer, post: s.roleName }))),
  )
  const base = `/api/admin/events/${event.id}/export`
  const forVolunteers = SHEET_VIEWS.filter((v) => v.audience === "volunteers")
  const forOrganizers = SHEET_VIEWS.filter((v) => v.audience === "organizers")

  // Post-event summary (#557): same counting rules as the certificate (#556), reusing staffing.ts
  // for the fill rate and the underfilled list instead of re-deriving them.
  const timeZone = orgTimeZone(org)
  const staffingShifts = event.shifts.map((s) => ({
    id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
    startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, closed: s.status === "closed",
    active: s.registrations.filter((r) => r.status === "active").length,
    waiting: s.registrations.filter((r) => r.status === "waiting" || r.status === "offered").length,
    requested: s.registrations.filter((r) => r.status === "requested").length,
  }))
  const summaryRegistrations: EventSummaryRegistration[] = event.shifts.flatMap((s) =>
    s.registrations
      .filter((r) => r.status === "active")
      .map((r, i) => ({
        id: `${s.id}-${i}`,
        volunteerId: r.volunteerId,
        status: r.status,
        checkedInAt: r.checkedInAt,
        shift: { id: s.id, roleName: s.roleName, label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime, status: s.status },
        event: { id: event.id, title: event.title },
      })),
  )
  // Every other event's counted registrations, org-wide, for the first-time/returning split — a
  // volunteer is "returning" for this event when at least one of those starts earlier (#557).
  const otherRegistrations = await ctx.db.registration.findMany({
    where: { status: "active", shift: { status: { not: "cancelled" } }, eventId: { not: event.id } },
    select: { volunteerId: true, eventId: true, event: { select: { startDate: true } } },
  })
  const returning = returningVolunteerIds(
    otherRegistrations.map((r) => ({ volunteerId: r.volunteerId, eventId: r.eventId, eventStart: r.event.startDate })),
    event.id,
    event.startDate,
  )
  const summary = eventSummary(summaryRegistrations, returning, staffingShifts, event.sectorLeaders.map((l) => l.roleName), timeZone)
  // Provisional until the event is over (#557): the organizer can still look, but shifts, check-ins
  // and registrations may still change until then.
  const provisional = event.endDate.getTime() > new Date().getTime()

  // A report opens in a new tab and is printed from there; a download saves a file (#384).
  const row = (href: string, name: string, description: string, describedBy?: string, kind: "tab" | "download" = "tab") => {
    const descId = `desc-${href.split("/").pop()}`
    const describes = [descId, describedBy].filter(Boolean).join(" ")
    return (
      <li key={href} className="px-4 py-3">
        {kind === "download" ? (
          <a href={href} download aria-describedby={describes} className={linkClass}>
            {name}
            <span className="sr-only"> (télécharge un fichier)</span>
          </a>
        ) : (
          <a href={href} target="_blank" rel="noopener" aria-describedby={describes} className={linkClass}>
            {name}
            <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
            <span aria-hidden="true" className="ml-1 font-normal text-gray-500">↗</span>
          </a>
        )}
        <p id={descId} className="text-sm text-gray-600">{description}</p>
      </li>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/admin/events/${event.id}`} className={`text-sm ${linkClass}`}><span aria-hidden="true">← </span>Retour à {event.title}</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Rapports</h1>
        <p className="text-sm text-gray-700 mt-1">
          Des documents lisibles en noir et blanc, à imprimer ou enregistrer en PDF depuis le navigateur. Les rapports s&apos;ouvrent dans un nouvel onglet ; l&apos;archive se télécharge. Les heures planifiées des membres ne figurent dans aucun de ces documents.
        </p>
      </div>

      <section aria-labelledby="reports-volunteers" className="space-y-2">
        <h2 id="reports-volunteers" className="text-base font-semibold text-gray-900">À afficher ou à remettre aux bénévoles</h2>
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {forVolunteers.map((v) => row(`${base}/sheets/${v.id}`, v.name, v.description))}
        </ul>
      </section>

      <section aria-labelledby="reports-organizers" className="space-y-2">
        <h2 id="reports-organizers" className="text-base font-semibold text-gray-900">Pour les organisateurs seulement</h2>
        <p id="reports-organizers-note" className="text-sm text-gray-600">Contiennent des numéros de téléphone : à ne pas afficher ni distribuer.</p>
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {row(`${base}/pdf`, "Export complet", "Le planning en frise par jour, le récapitulatif par poste et la liste des bénévoles avec leurs coordonnées, en couleur.", "reports-organizers-note")}
          {forOrganizers.map((v) => row(`${base}/sheets/${v.id}`, v.name, v.description, "reports-organizers-note"))}
        </ul>
      </section>
      <section aria-labelledby="reports-badges" className="space-y-2">
        <h2 id="reports-badges" className="text-base font-semibold text-gray-900">Badges</h2>
        <p id="reports-badges-desc" className="text-sm text-gray-600">Un badge par bénévole inscrit (prénom, nom, poste, créneaux), dix par feuille A4 à découper. Sans photo ni code QR. La couleur du bandeau est celle du poste, à défaut celle de l&apos;événement.</p>
        {/* A GET form: the options travel in the link, the page opens in a new tab and is printed from there. */}
        <form action={`${base}/badges`} method="get" target="_blank" aria-labelledby="reports-badges" className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-3">
          {/* Post and person side by side: they combine (a person on a post gets only that post's shifts). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="badges-role" className="block text-sm font-medium text-gray-800 mb-1">Poste</label>
              <select id="badges-role" name="role" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                <option value="">Tous les postes</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="badges-volunteer" className="block text-sm font-medium text-gray-800 mb-1">Bénévole (réimpression)</label>
              <select id="badges-volunteer" name="volunteer" aria-describedby="badges-volunteer-help" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                <option value="">Tous les bénévoles du poste choisi</option>
                {volunteers.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <p id="badges-volunteer-help" className="text-xs text-gray-600 -mt-1">Pour réimprimer le badge d&apos;une seule personne. Si un poste est choisi, seuls ses créneaux sur ce poste figurent sur le badge ; laissez « Tous les postes » pour son badge complet.</p>
          <div>
            <label htmlFor="badges-color" className="block text-sm font-medium text-gray-800 mb-1">Couleur du bandeau</label>
            <select id="badges-color" name="color" className="w-full sm:w-auto border border-gray-300 rounded-xl px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <option value="role">Couleur du poste (à défaut celle de l&apos;événement)</option>
              <option value="event">Couleur de l&apos;événement</option>
              <option value="none">Noir et blanc</option>
            </select>
          </div>
          <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
            <legend className="sr-only">Contenu du badge</legend>
            <label className="inline-flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" name="lastName" value="1" defaultChecked className="h-4 w-4 rounded border-gray-300" /> Nom de famille</label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" name="shifts" value="1" defaultChecked className="h-4 w-4 rounded border-gray-300" /> Créneaux</label>
          </fieldset>
          <button type="submit" className={linkClass}>
            Ouvrir les badges
            <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
            <span aria-hidden="true" className="ml-1 font-normal text-gray-500">↗</span>
          </button>
        </form>
      </section>
      <section aria-labelledby="reports-summary" className="space-y-3">
        <h2 id="reports-summary" className="text-base font-semibold text-gray-900">Résumé de l&apos;événement</h2>
        {provisional && (
          // Plain <p>, not role="status": this is static server-rendered content, present from the
          // first paint, not a live region update — nothing changes after the page loads (#557 a11y review).
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2">
            Résumé provisoire : l&apos;événement n&apos;est pas encore terminé ({day(event.endDate)}). Les chiffres peuvent encore changer.
          </p>
        )}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Bénévoles</h3>
            <p className="text-sm text-gray-800 mt-1">
              <strong className="tabular-nums">{summary.distinctVolunteers}</strong> bénévole{summary.distinctVolunteers > 1 ? "s" : ""} distinct{summary.distinctVolunteers > 1 ? "s" : ""} avec un créneau confirmé,
              dont <strong className="tabular-nums">{summary.firstTimeCount}</strong> pour la première fois et <strong className="tabular-nums">{summary.returningCount}</strong> de retour.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Présences</h3>
            <p className="text-sm text-gray-800 mt-1">
              Présences saisies pour <strong className="tabular-nums">{summary.shiftsWithPresence}</strong> sur <strong className="tabular-nums">{summary.shiftsConfirmed}</strong> créneau{summary.shiftsConfirmed > 1 ? "x" : ""} confirmé{summary.shiftsConfirmed > 1 ? "s" : ""}.
              {summary.checkInUsage === "none" && " Aucune présence n'a été saisie pour cet événement : les présences ci-dessous ne sont pas des absences, l'enregistrement n'a simplement pas été fait."}
              {summary.checkInUsage === "partial" && ` ${summary.shiftsWithoutPresence} créneau${summary.shiftsWithoutPresence > 1 ? "x" : ""} confirmé${summary.shiftsWithoutPresence > 1 ? "s" : ""} reste${summary.shiftsWithoutPresence > 1 ? "nt" : ""} sans présence enregistrée : l'usage du pointage a été partiel.`}
              {summary.checkInUsage === "full" && " La présence a été saisie pour chaque créneau confirmé."}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Heures</h3>
            <p className="text-sm text-gray-800 mt-1">
              <strong>{fmtDuration(summary.plannedMinutes)}</strong> planifiées, dont <strong>{fmtDuration(summary.attestedMinutes)}</strong> attestées (présence enregistrée).
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Taux de remplissage</h3>
            <p className="text-sm text-gray-800 mt-1">
              <strong className="tabular-nums">{summary.fillOverall.filled}</strong> place{summary.fillOverall.filled > 1 ? "s" : ""} occupée{summary.fillOverall.filled > 1 ? "s" : ""} sur <strong className="tabular-nums">{summary.fillOverall.capacity}</strong>, tous postes confondus.
            </p>
            {summary.fillByRole.length > 0 && (
              <table className="w-full text-sm border-collapse mt-2">
                <caption className="text-left text-sm font-semibold text-gray-900 mb-1">Remplissage par poste</caption>
                <thead>
                  <tr className="border-b-2 border-gray-400">
                    <th scope="col" className="text-left py-1 pr-2">Poste</th>
                    <th scope="col" className="text-left py-1">Places occupées</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.fillByRole.map((r) => (
                    <tr key={r.roleName} className="border-b border-gray-200">
                      <th scope="row" className="text-left font-normal py-1 pr-2">{r.roleName}</th>
                      <td className="py-1 tabular-nums">{r.filled} sur {r.capacity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {summary.underfilled.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Créneaux restés incomplets ({summary.underfilled.length})</h3>
              {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets. */}
              <ul role="list" className="text-sm text-gray-800 mt-1 space-y-0.5 list-disc list-inside">
                {summary.underfilled.map((s) => (
                  <li key={s.id}>
                    {s.label !== s.roleName ? `${s.roleName} (${s.label})` : s.roleName}, {day(new Date(s.date))} : <span className="tabular-nums">{s.active} sur {s.capacity}</span>, manque {s.missing}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="reports-archive" className="space-y-2">
        <h2 id="reports-archive" className="text-base font-semibold text-gray-900">Archive</h2>
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {row(`${base}/archive`, "Archive de l'événement (JSON)", "Toutes les données de l'événement dans un fichier téléchargé : réglages, créneaux, inscriptions, pages, responsables, jalons et journal. Pour vos archives ou pour changer d'outil.", undefined, "download")}
        </ul>
      </section>
    </div>
  )
}
