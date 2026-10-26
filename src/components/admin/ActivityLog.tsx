"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect, useCallback, useId } from "react"
import { SEND_BATCHES_ANCHOR, type ActivityBatch } from "@/lib/send-batches"

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export type OrgLogEntry = {
  id: string
  actorType: string
  actorId: string | null
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  createdAt: string
  /** A batch of emails (#1101), with its delivery as it is now; null when deleted since. */
  batch?: ActivityBatch | null
}

/**
 * One French label per action written to OrgLog, read as "<actor> <label>". Every code logged
 * anywhere must have one: src/lib/__tests__/log-action-labels.test.ts scans the source and fails
 * on a missing label, so a new action never shows up as a raw code (#704).
 */
export const ACTION_LABEL: Record<string, string> = {
  "member.created": "a créé un membre",
  "member.imported": "a importé des membres",
  "template.created": "a créé un modèle de message",
  "template.updated": "a modifié un modèle de message",
  "template.deleted": "a supprimé un modèle de message",
  "member.updated": "a modifié un membre",
  "member.deactivated": "a désactivé un membre",
  "member.links_renewed": "a corrigé l'adresse d'un membre\u00a0: ses liens personnels ont été renouvelés",
  // #516: says that an erasure happened, never whose (the entry points to the organisation).
  "member.erased": "a effacé les données personnelles d'un membre",
  "organization.suspended": "a suspendu l'organisation pour abus",
  "organization.suspension_lifted": "a levé la suspension de l'organisation",
  "organization.reactivated_after_inactivity": "a réactivé l'espace, désactivé faute d'activité",
  "organization.kept": "a confirmé vouloir conserver l'espace",
  "organization.inactivity_email_sent": "a demandé si l'espace doit être conservé (vérification d'inactivité)",
  "organization.inactivity_email_queued": "a préparé l'envoi d'un message demandant si l'espace doit être conservé (vérification d'inactivité)",
  "organization.inactivity_check_blocked": "a mis en attente la vérification d'inactivité : un message n'a pu être envoyé à aucun organisateur, l'opérateur du service est prévenu",
  "organization.inactivity_check_stopped": "a arrêté la vérification d'inactivité en cours (activité, réponse, événement prévu ou décision de l'équipe du service)",
  "organization.deactivated_for_inactivity": "a désactivé l'espace, sans réponse à la vérification d'inactivité",
  "organization.approved": "a validé l'espace",
  "adminuser.invited": "a invité un organisateur",
  "notification.retried": "a renvoyé un email",
  "organization.notifications_updated": "a modifié les paramètres des emails",
  // #1077: says whose address became the reply-to without writing it in the log.
  "organization.reply_to_defaulted": "a activé son compte : son adresse email est devenue l'adresse de réponse de l'organisation",
  "organization.logo_updated": "a changé le logo de l'organisation",
  "organization.logo_removed": "a retiré le logo de l'organisation",
  "adminuser.removed": "a retiré un organisateur",
  "adminuser.role_changed": "a changé le rôle d'un organisateur",
  "member.merged": "a fusionné deux membres",
  "member.deleted": "a supprimé un membre",
  "member.duplicate_dismissed": "a ignoré un doublon possible",
  "volunteer.certificate_generated": "a généré une attestation de bénévolat",
  "organization.links_regenerated": "a régénéré les liens personnels de tous les membres",
  // #1101: one entry per batch of emails sent at once from an event.
  "sendbatch.queued": "a lancé un envoi groupé d'emails",
}

const ENTITY_FILTERS = [
  { value: "", label: "Tous les types" },
  { value: "Member", label: "Membres" },
  { value: "AdminUser", label: "Comptes organisateurs" },
  { value: "NotificationOutbox", label: "Emails" },
  { value: "SendBatch", label: "Envois groupés" },
  { value: "Organization", label: "Organisation" },
]

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<OrgLogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [entityType, setEntityType] = useState("")
  const [announcement, setAnnouncement] = useState("")

  const filterId = useId()

  const fetchPage = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams()
    if (entityType) params.set("entityType", entityType)
    if (cursor) params.set("cursor", cursor)
    const res = await fetch(`/api/admin/settings/activity?${params}`)
    if (!res.ok) throw new Error("fetch failed")
    return res.json() as Promise<{ entries: OrgLogEntry[]; nextCursor: string | null }>
  }, [entityType])

  useEffect(() => {
    // Deferred a tick: calling setState synchronously as the very first thing an effect does
    // forces a same-commit re-render — see the identical pattern in EventLogExplorer.tsx.
    queueMicrotask(() => {
      setLoading(true)
      setError(null)
      setLoadMoreError(null)
      fetchPage()
        .then((d) => {
          setEntries(d.entries)
          setNextCursor(d.nextCursor)
          // Cleared first: two consecutive identical announcements otherwise leave the live
          // region's text node untouched and most screen readers stay silent — see the same
          // technique in EventLogExplorer.tsx.
          setAnnouncement("")
          requestAnimationFrame(() => {
            setAnnouncement(`${d.entries.length} entrée${d.entries.length > 1 ? "s" : ""} trouvée${d.entries.length > 1 ? "s" : ""}.`)
          })
        })
        .catch(() => {
          setError("Impossible de charger le journal d'activité.")
          setAnnouncement("")
          requestAnimationFrame(() => { setAnnouncement("Impossible de charger le journal d'activité.") })
        })
        .finally(() => setLoading(false))
    })
  }, [fetchPage])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const d = await fetchPage(nextCursor)
      setEntries((prev) => [...prev, ...d.entries])
      setNextCursor(d.nextCursor)
      setAnnouncement("")
      requestAnimationFrame(() => {
        setAnnouncement(`${d.entries.length} entrée${d.entries.length > 1 ? "s" : ""} supplémentaire${d.entries.length > 1 ? "s" : ""} chargée${d.entries.length > 1 ? "s" : ""}.`)
      })
    } catch {
      setLoadMoreError("Impossible de charger la suite du journal.")
      setAnnouncement("")
      requestAnimationFrame(() => { setAnnouncement("Impossible de charger la suite du journal.") })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <div>
        <label htmlFor={filterId} className="block text-xs font-medium text-gray-500 mb-1">Filtrer par type</label>
        <select
          id={filterId}
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="border border-gray-500 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          {ENTITY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {/* Initial load: loading/error/empty are mutually exclusive with the list because there's
          nothing to preserve yet. Once entries exist, they stay on screen regardless of a later
          "Charger plus" failure — see loadMoreError below, rendered alongside the list, not
          instead of it. */}
      {loading && entries.length === 0 ? (
        <p role="status" className="text-sm text-gray-500">Chargement…</p>
      ) : error && entries.length === 0 ? (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune activité pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-1.5" role="list">
          {entries.map((entry) => (
            <li key={entry.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">
                  <span className="font-medium">{entry.actorLabel}</span> {ACTION_LABEL[entry.action] ?? entry.action}
                </p>
                {entry.batch && (
                  <p className="text-sm text-gray-700 mt-0.5">
                    {entry.batch.kindLabel}, {entry.batch.eventTitle}{"\u00a0"}: {entry.batch.summary}.
                    {entry.batch.heldSentence && <> {entry.batch.heldSentence}</>}{" "}
                    <a href={`/admin/events/${entry.batch.eventId}/message#${SEND_BATCHES_ANCHOR}`} className={LINK}>
                      Voir dans les messages de l&apos;événement<span className="sr-only">{"\u00a0"}: {entry.batch.kindLabel}, {entry.batch.eventTitle}, {fmtDateTime(entry.createdAt)}</span>
                    </a>
                  </p>
                )}
              </div>
              <time dateTime={entry.createdAt} className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">{fmtDateTime(entry.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}

      {loadMoreError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadMoreError}</p>
      )}

      {nextCursor && !loading && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
        >
          {loadingMore ? "Chargement…" : "Charger plus"}
        </button>
      )}
    </div>
  )
}
