// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { MAX_ATTEMPTS, type NotificationKind, type NotificationPayload } from "./notifications/types"

/**
 * The email delivery page of an organization (#382): how an outbox row reads for an admin.
 * Pure; the loader decrypts the payload and passes only what's shown (recipient, kind, dates).
 */

export const KIND_LABELS: Record<NotificationKind, string> = {
  registration_confirmation: "Confirmation d'inscription",
  member_invite: "Invitation d'un membre",
  reminder_j2: "Rappel J-2",
  reminder_j1: "Rappel J-1",
  reminder_dd: "Rappel du jour",
  manual_reminder: "Rappel envoyé par un admin",
  shift_modified: "Créneau modifié",
  shift_cancelled: "Créneau annulé",
  registration_cancelled: "Désistement : notification aux admins",
  admin_notification: "Notification à l'équipe",
  admin_invite: "Invitation d'un administrateur",
  admin_welcome: "Bienvenue administrateur",
  password_reset: "Réinitialisation du mot de passe",
  waitlist_confirmation: "Liste d'attente : confirmation",
  waitlist_offered: "Liste d'attente : place proposée",
  sector_leader_invite: "Lien de responsable de secteur",
  sector_leader_new_signup: "Responsable : nouvelle inscription",
  sector_leader_withdrawal: "Responsable : désistement",
  product_update: "Nouveautés du produit",
  registration_link_resend: "Renvoi du lien personnel",
  targeted_message: "Message aux bénévoles",
  registration_requested: "Demande d'inscription reçue",
  registration_refused: "Demande d'inscription refusée",
}

export function kindLabel(kind: string): string {
  return (KIND_LABELS as Record<string, string>)[kind] ?? kind
}

export type OutboxRow = {
  id: string
  status: string
  attempts: number
  nextAttemptAt: Date
  lastError: string | null
  sentAt: Date | null
  createdAt: Date
}

export type OutboxState = "pending" | "retrying" | "sent" | "failed"

/** Pending on first try, retrying after a failure, sent, or given up after MAX_ATTEMPTS. */
export function outboxState(row: Pick<OutboxRow, "status" | "attempts">): OutboxState {
  if (row.status === "sent") return "sent"
  if (row.status === "failed") return "failed"
  return row.attempts > 0 ? "retrying" : "pending"
}

export const STATE_LABELS: Record<OutboxState, string> = {
  pending: "En attente d'envoi",
  retrying: "Nouvel essai prévu",
  sent: "Envoyé",
  failed: "Échec définitif",
}

export type OutboxRowView = {
  id: string
  state: OutboxState
  stateLabel: string
  kind: string
  kindLabel: string
  recipient: string
  /** « essai 2 sur 6 » while retrying, empty otherwise. */
  attemptsLabel: string
  lastError: string | null
  createdAt: Date
  sentAt: Date | null
  nextAttemptAt: Date | null
  canRetry: boolean
}

export function recipientLabel(r: NotificationPayload["recipient"] | undefined): string {
  if (!r) return "—"
  const email = r.email?.trim()
  const name = r.name?.trim()
  if (name && email) return `${name} <${email}>`
  return email || name || r.phone?.trim() || "—"
}

export function outboxRowView(row: OutboxRow, payload: Pick<NotificationPayload, "kind" | "recipient"> | null): OutboxRowView {
  const state = outboxState(row)
  return {
    id: row.id,
    state,
    stateLabel: STATE_LABELS[state],
    kind: payload?.kind ?? "?",
    kindLabel: payload ? kindLabel(payload.kind) : "Contenu illisible",
    recipient: recipientLabel(payload?.recipient),
    attemptsLabel: state === "retrying" ? `essai ${row.attempts + 1} sur ${MAX_ATTEMPTS}` : "",
    lastError: row.lastError,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    nextAttemptAt: state === "pending" || state === "retrying" ? row.nextAttemptAt : null,
    canRetry: state === "failed",
  }
}

export type OutboxCounts = Record<OutboxState, number>

export function outboxCounts(rows: { state: OutboxState }[]): OutboxCounts {
  const c: OutboxCounts = { pending: 0, retrying: 0, sent: 0, failed: 0 }
  for (const r of rows) c[r.state]++
  return c
}

/** One sentence for the top of the page. */
export function outboxHeadline(c: OutboxCounts): string {
  if (c.failed > 0) return `${c.failed} email${c.failed > 1 ? "s" : ""} en échec définitif : à renvoyer ou à vérifier.`
  const waiting = c.pending + c.retrying
  if (waiting > 0) return `${waiting} email${waiting > 1 ? "s" : ""} en cours d'envoi.`
  return "Tous les emails récents sont partis."
}
