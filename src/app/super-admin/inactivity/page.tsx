// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { loadDeactivatedForInactivity, loadExemptOrganizations, loadInactivityReport, SOON_DAYS } from "@/lib/org-inactivity-data"
import { erasureDate, erasureDue, inactivityMode, INACTIVITY_MONTHS, procedureText } from "@/lib/org-inactivity"
import { decideProcedure, FINAL_NOTICE_DAYS, MIN_DEACTIVATION_DAYS, REMINDER_GAP_DAYS } from "@/lib/org-inactivity-steps"
import { APP_TIME_ZONE } from "@/lib/time-zone"
import { noReachableAdmin, reachabilityNote } from "@/lib/admin-reachability"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Organisations bientôt inactives" }

const day = (d: Date | null) => (d ? d.toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }) : "Jamais")
/** A procedure's dates, in the organisation's own zone (#1114). */
const dayIn = (timeZone: string) => (d: Date) => d.toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "short", year: "numeric" })

/**
 * The periodic check of #811 in report mode: the organisations it would write to soon, and why.
 * Nothing is sent, deactivated or deleted (`ORG_INACTIVITY=report`).
 */
export default async function InactivityPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const mode = inactivityMode()
  const now = new Date()
  const [rows, exempt, deactivated] = mode === "off" ? [[], [], []] : await Promise.all([loadInactivityReport(now), loadExemptOrganizations(), loadDeactivatedForInactivity()])
  const unreachable = rows.filter((r) => noReachableAdmin(r.reachability))
  // A procedure under way that cannot go on by itself (#1114): handled by hand, listed first.
  const isBlocked = (r: (typeof rows)[number]) => r.procedure !== null && r.assessment.state === "due" && decideProcedure(r.procedure, now).action === "blocked"
  const blocked = rows.filter(isBlocked)
  const note = (r: (typeof rows)[number]) => reachabilityNote(r.reachability)

  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Organisations bientôt inactives</h1>
        <p className="text-sm text-gray-700 mt-1">
          Après {INACTIVITY_MONTHS} mois sans activité et sans événement à venir, une organisation reçoit « Souhaitez-vous conserver votre espace ? », puis deux rappels ; un rappel ne part qu&apos;une fois le message précédent accepté par le serveur d&apos;envoi pour au moins un administrateur, au plus tôt {REMINDER_GAP_DAYS} jours de calendrier après lui. Sans réponse, elle est désactivée au plus tôt {FINAL_NOTICE_DAYS} jours après l&apos;envoi du dernier rappel, et jamais moins de {MIN_DEACTIVATION_DAYS} jours après l&apos;envoi du premier ; ses administrateurs peuvent la réactiver eux-mêmes. Un message accepté pour aucun administrateur bloque la procédure : pas de désactivation tant qu&apos;il n&apos;est pas accepté.
          {" "}
          {mode === "off"
            ? "La vérification est désactivée (ORG_INACTIVITY=off)."
            : `${mode === "on" ? "Mode actif : les emails partent et les désactivations ont lieu ; aucun espace n'est supprimé." : "Mode observation : rien n'est envoyé, désactivé ni supprimé."} La liste montre les organisations concernées dans les ${SOON_DAYS} prochains jours ou déjà concernées. La page de chaque organisation permet de reporter la vérification ou de l'en exclure.`}
        </p>
      </div>

      {mode !== "off" && blocked.length > 0 && (
        <p className="text-sm text-gray-900 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
          {blocked.length === 1 ? "1 organisation dont la vérification est bloquée" : `${blocked.length} organisations dont la vérification est bloquée`}
          {blocked.length <= 5 && (
            <>
              {" ("}
              {blocked.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  <Link href={`/super-admin/organizations/${r.slug}`} className="text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{r.name}</Link>
                </span>
              ))}
              {")"}
            </>
          )}
          {" : un message n'a été accepté pour aucun administrateur, ou la procédure a commencé avant le suivi des envois. Pas de désactivation tant que c'est le cas ; traitez-les depuis leur page."}
          {blocked.length > 5 && " Repérez-les par « Procédure bloquée » dans le tableau."}
        </p>
      )}

      {mode !== "off" && unreachable.length > 0 && (
        <p className="text-sm text-gray-900 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
          {unreachable.length === 1
            ? "1 organisation n'a aucun administrateur joignable"
            : `${unreachable.length} organisations n'ont aucun administrateur joignable`}
          {unreachable.length <= 5 && ` (${unreachable.map((r) => r.name).join(", ")})`}
          {mode === "on"
            ? " : aucun administrateur actif, ou adresses refusées. Les messages de la vérification ne leur parviennent pas. Contactez-les autrement, ou reportez la vérification depuis leur page. Sans réponse, elles seront désactivées comme les autres."
            : " : aucun administrateur actif, ou adresses refusées. Les messages de la vérification ne leur parviendraient pas. Contactez-les autrement, ou reportez la vérification depuis leur page. Sans réponse, elles seraient désactivées comme les autres."}
        </p>
      )}

      {mode !== "off" && (rows.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune organisation concernée.</p>
      ) : (
        <div tabIndex={0} role="region" aria-label="Organisations concernées" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table className="w-full text-sm">
            <caption className="sr-only">Organisations concernées, la plus proche de la première étape en premier</caption>
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Organisation</th>
                <th scope="col" className="px-4 py-2 font-medium">Dernière activité</th>
                <th scope="col" className="px-4 py-2 font-medium">Dernier événement</th>
                <th scope="col" className="px-4 py-2 font-medium">Utilisée</th>
                <th scope="col" className="px-4 py-2 font-medium">Administrateurs actifs</th>
                <th scope="col" className="px-4 py-2 font-medium">{mode === "on" ? "Où elle en est" : "Où elle en serait"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <Link href={`/super-admin/organizations/${r.slug}`} className="text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{r.name}</Link>
                  </th>
                  <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{day(r.lastActivityAt)}</td>
                  <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{day(r.lastEventEnd)}</td>
                  <td className="px-4 py-2 text-gray-800">{r.everUsed ? "Oui" : "Jamais utilisée"}</td>
                  <td className="px-4 py-2 text-gray-900">
                    <span className="tabular-nums">{r.activeAdmins}</span>
                    {note(r) && (
                      <>
                        <span className="sr-only">, </span>
                        <span className={`block text-xs ${noReachableAdmin(r.reachability) ? "font-semibold text-red-800" : "text-gray-700"}`}>{note(r)}</span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {r.postponedUntil && r.postponedUntil.getTime() > now.getTime() && `Reporté jusqu'au ${day(r.postponedUntil)}. `}
                    {r.procedure && r.assessment.state === "due"
                      ? (
                        <>
                          <ProcedureCell text={procedureText(r.procedure, now, dayIn(r.timeZone))} />
                          {r.timeZone !== APP_TIME_ZONE && ` (dates en heure de ${r.timeZone})`}
                          {mode === "report" && " Mode observation : la procédure est en pause."}
                        </>
                      )
                      : r.assessment.state === "active"
                      ? `1er email le ${day(r.assessment.firstEmailAt)}`
                      : `${r.assessment.stepLabel} (depuis le ${day(r.assessment.firstEmailAt)})${r.assessment.nextStep ? ` ; ensuite : ${r.assessment.nextStep.label.toLowerCase()} le ${day(r.assessment.nextStep.at)}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {mode !== "off" && deactivated.length > 0 && (
        <section aria-labelledby="inactivity-deactivated" className="space-y-2">
          <h2 id="inactivity-deactivated" className="text-base font-semibold text-gray-900">Désactivées faute d&apos;activité</h2>
          <p className="text-sm text-gray-700">Désactivées faute de réponse à la vérification d&apos;inactivité. Leurs administrateurs peuvent les réactiver depuis la page de connexion ; leurs données sont gardées. L&apos;effacement automatique, 90 jours après la désactivation, n&apos;est pas activé : la date indiquée est celle qu&apos;il suivrait.</p>
          <ul className="list-disc pl-5 text-sm">
            {deactivated.map((o) => (
              <li key={o.id}>
                <Link href={`/super-admin/organizations/${o.slug}`} className="text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{o.name}</Link>
                {o.inactivityDeactivatedAt && ` : désactivée le ${day(o.inactivityDeactivatedAt)}, effacement prévu le ${day(erasureDate(o.inactivityDeactivatedAt))}${erasureDue(o.inactivityDeactivatedAt, now) ? " (échéance passée, effacement non activé)" : ""}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {mode !== "off" && exempt.length > 0 && (
        <section aria-labelledby="inactivity-exempt" className="space-y-2">
          <h2 id="inactivity-exempt" className="text-base font-semibold text-gray-900">Jamais désactivées automatiquement</h2>
          <p className="text-sm text-gray-700">Exclues de la vérification par l&apos;opérateur. Pour les y remettre, ouvrez la page de l&apos;organisation.</p>
          <ul className="list-disc pl-5 text-sm">
            {exempt.map((o) => (
              <li key={o.id}>
                <Link href={`/super-admin/organizations/${o.slug}`} className="text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{o.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const BLOCKED_PREFIX = "Procédure bloquée"

/** The procedure's sentence; a blocked one starts with « Procédure bloquée » in bold red, the word carrying the meaning. */
function ProcedureCell({ text }: { text: string }) {
  if (!text.startsWith(BLOCKED_PREFIX)) return <>{text}</>
  return (
    <>
      <span className="font-semibold text-red-800">{BLOCKED_PREFIX}</span>
      {text.slice(BLOCKED_PREFIX.length)}
    </>
  )
}
