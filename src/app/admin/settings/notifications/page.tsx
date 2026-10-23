// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { loadOutbox, OUTBOX_PAGE_LIMIT } from "@/lib/outbox-data"
import { outboxHeadline, STATE_LABELS, type OutboxRowView, type OutboxState } from "@/lib/outbox-view"
import { orgTimeZone } from "@/lib/time-zone"
import OutboxRetryButton from "@/components/admin/OutboxRetryButton"
import NotificationSettingsForm from "@/components/admin/NotificationSettingsForm"
import { hasLevel } from "@/lib/permissions"
import { parseNotificationSettings } from "@/lib/notification-settings"
// Reads the Organization row for its time zone, not a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import HelpLink from "@/components/admin/HelpLink"
import FocusTargetHeading from "@/components/admin/event-nav/FocusTargetHeading"
import { loadSendBatches } from "@/lib/send-batches-data"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Emails" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const STATE_STYLE: Record<OutboxState, string> = {
  pending: "bg-gray-100 text-gray-800",
  retrying: "bg-amber-100 text-amber-900",
  sent: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
  cancelled: "bg-gray-100 text-gray-800",
}

/** Emails of the organization (#382): pending, retrying, sent, failed, with the reason and a « Renvoyer ». */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ envoi?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  // `?envoi=<id>`: only the emails of one batch (#1101) of this organisation; any other id is ignored.
  const { envoi } = await searchParams
  const askedBatch = typeof envoi === "string" && envoi.length > 0 && envoi.length <= 64 ? envoi : null
  const [batch] = askedBatch ? await loadSendBatches(ctx.organizationId, { ids: [askedBatch], limit: 1 }) : []
  const [{ rows, counts, truncated }, org] = await Promise.all([
    loadOutbox(ctx.organizationId, OUTBOX_PAGE_LIMIT, batch ? { sendBatchId: batch.id } : {}),
    prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { timeZone: true, replyToEmail: true, notificationSettings: true } }),
  ])
  const tz = orgTimeZone(org)
  const when = (d: Date) => d.toLocaleString("fr-FR", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const batchName = batch
    ? `l'envoi «\u00a0${batch.kindLabel}\u00a0» du ${batch.createdAt.toLocaleDateString("fr-FR", { timeZone: tz, day: "numeric", month: "long" })} à ${batch.createdAt.toLocaleTimeString("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })} (${batch.eventTitle})`
    : null
  const order: OutboxState[] = ["failed", "retrying", "pending", "sent"]

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings/admins" className={`text-sm ${linkClass}`}><span aria-hidden="true">← </span>Paramètres</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Emails</h1>
        <HelpLink route="/admin/settings/notifications" />
      </div>

      {hasLevel(ctx.session.user?.role, "owner") ? (
        <NotificationSettingsForm
          initialSettings={parseNotificationSettings(org?.notificationSettings)}
          initialReplyTo={org?.replyToEmail ?? null}
          adminEmail={ctx.session.user?.email ?? null}
        />
      ) : (
        // Organisers see the deliveries below, not the email settings (#469).
        <section aria-labelledby="email-settings-ro" className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          <h2 id="email-settings-ro" className="text-base font-semibold text-gray-900">Réglages des emails</h2>
          <p className="text-sm text-gray-700">Votre rôle : organisateur. Ces réglages sont réservés aux propriétaires de l&apos;organisation.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt className="text-gray-600">Adresse de réponse</dt>
            <dd className="text-gray-900 break-all">{org?.replyToEmail ?? "celle de la plateforme"}</dd>
          </dl>
        </section>
      )}

      <div>
        {/* Reached from an « envoi groupé » (#1101): the list, not the settings above, takes the focus. */}
        <FocusTargetHeading id="emails-envoyes" className="text-base font-semibold text-gray-900">Emails envoyés</FocusTargetHeading>
        {batchName && (
          <p className="text-sm text-gray-900 mt-1">
            Emails de {batchName}, encore dans la liste.{" "}
            <Link href="/admin/settings/notifications" className={linkClass}>Voir tous les emails de l&apos;organisation</Link>
          </p>
        )}
        {askedBatch && !batch && (
          <p className="text-sm text-gray-900 mt-1">Cet envoi groupé est introuvable : tous les emails de l&apos;organisation sont affichés.</p>
        )}
        <p className="text-sm text-gray-700 mt-1">{outboxHeadline(counts)}</p>
        <p className="text-sm text-gray-600 mt-1">
          Les emails envoyés sont effacés chaque nuit (ils contiennent des données personnelles) ; ceux en échec ou annulés restent 30 jours.
          {truncated && ` Seuls les ${OUTBOX_PAGE_LIMIT} plus récents sont affichés.`}
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {order.map((s) => (
          <div key={s} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <dt className="text-xs text-gray-600">{STATE_LABELS[s]}</dt>
            <dd className="text-xl font-semibold text-gray-900 tabular-nums">{counts[s]}</dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">{batch ? "Aucun email de cet envoi n'est encore dans la liste : les emails partis sont effacés chaque nuit." : "Aucun email récent."}</p>
      ) : (
        <div tabIndex={0} role="region" aria-labelledby="outbox-caption" className="bg-white border border-gray-200 rounded-xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table className="w-full text-sm">
            <caption id="outbox-caption" className="sr-only">{batchName ? `Emails de ${batchName}, du plus récent au plus ancien` : "Emails récents de l'organisation, du plus récent au plus ancien"}</caption>
            <thead className="text-left text-xs text-gray-600 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Date</th>
                <th scope="col" className="px-4 py-2 font-medium">Email</th>
                <th scope="col" className="px-4 py-2 font-medium">Destinataire</th>
                <th scope="col" className="px-4 py-2 font-medium">État</th>
                <th scope="col" className="px-4 py-2 font-medium">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => <Row key={r.id} r={r} when={when} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Row({ r, when }: { r: OutboxRowView; when: (d: Date) => string }) {
  return (
    <tr>
      <td className="px-4 py-2 whitespace-nowrap text-gray-700 tabular-nums align-top">{when(r.createdAt)}</td>
      <td className="px-4 py-2 text-gray-900 align-top">{r.kindLabel}</td>
      <td className="px-4 py-2 text-gray-800 align-top break-all">{r.recipient}</td>
      <td className="px-4 py-2 align-top">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[r.state]}`}>{r.stateLabel}</span>
        {r.attemptsLabel && <span className="block text-xs text-gray-600 mt-0.5">{r.attemptsLabel}</span>}
      </td>
      <td className="px-4 py-2 text-gray-700 align-top">
        {r.state === "sent" && r.sentAt && <span className="block">Parti à {when(r.sentAt)}</span>}
        {r.nextAttemptAt && <span className="block">Prochain essai {when(r.nextAttemptAt)}</span>}
        {r.lastError && (r.lastErrorIsCancellation
          ? <span className="block text-xs text-gray-700 mt-0.5 break-words">{r.lastError}</span>
          : <span className="block text-xs text-red-800 mt-0.5 break-words">Erreur : {r.lastError}</span>)}
        <span className="block mt-1"><OutboxRetryButton id={r.id} recipient={r.recipient} canRetry={r.canRetry} /></span>
      </td>
    </tr>
  )
}
