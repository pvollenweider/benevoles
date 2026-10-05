// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { MAX_ATTEMPTS, type NotificationKind, type NotificationPayload } from "./notifications/types"
import type { SmtpOutcome, SmtpReason } from "./notifications/smtp-outcome"
import { MERGED_MEMBER_CANCEL_REASON } from "./outbox-merge-cancel-reason"

/**
 * The email delivery page of an organization (#382): how an outbox row reads for an admin.
 * Pure; the loader decrypts the payload and passes only what's shown (recipient, kind, dates).
 */

/**
 * `NotificationOutbox.lastError` (#598): a compact, structured code — never the raw SMTP reply,
 * which can carry the recipient address and internal host names (see classifySmtpOutcome).
 * `encodeOutcomeReason` is what `deliverOutbox` stores; `outboxErrorSentence` is what the
 * delivery page shows, for both a freshly stored code and a row written before this change (an
 * old raw `lastError` isn't recognized as the structured format and falls through to a neutral
 * sentence — never displayed as is).
 */
const OUTCOME_REASON_PREFIX = "smtp"

export type OutcomeReasonCode = { outcome: SmtpOutcome; reason: SmtpReason | null; responseCode: number | null; enhancedStatus: string | null }

export function encodeOutcomeReason(c: OutcomeReasonCode): string {
  return [OUTCOME_REASON_PREFIX, c.outcome, c.reason ?? "-", c.responseCode ?? "-", c.enhancedStatus ?? "-"].join(":")
}

function decodeOutcomeReason(stored: string): OutcomeReasonCode | null {
  const parts = stored.split(":")
  if (parts.length !== 5 || parts[0] !== OUTCOME_REASON_PREFIX) return null
  const [, outcome, reason, responseCode, enhancedStatus] = parts
  return {
    outcome: outcome as SmtpOutcome,
    reason: reason === "-" ? null : (reason as SmtpReason),
    responseCode: responseCode === "-" ? null : Number(responseCode),
    enhancedStatus: enhancedStatus === "-" ? null : enhancedStatus,
  }
}

/** Plain French sentence for a permanent reason — states only what is proven, never "délivré". */
const PERMANENT_REASON_TEXT: Partial<Record<SmtpReason, string>> = {
  mailbox_unknown: "boîte aux lettres introuvable",
  mailbox_disabled: "boîte aux lettres désactivée",
  mailbox_full: "boîte aux lettres pleine",
  domain_not_found: "domaine introuvable",
  policy_rejected: "rejeté par la politique du serveur destinataire",
}

const TEMPORARY_REASON_TEXT: Partial<Record<SmtpReason, string>> = {
  timeout: "délai dépassé",
  relay_error: "rejeté par notre propre serveur d'envoi",
  mailbox_full: "boîte aux lettres pleine",
}

function sentenceFor(c: OutcomeReasonCode): string {
  if (c.outcome === "rejected_permanent") {
    const detail = c.reason ? PERMANENT_REASON_TEXT[c.reason] : undefined
    return detail
      ? `Refus définitif du serveur d'envoi (motif indiqué : ${detail}). Adresse à vérifier.`
      : "Refus définitif du serveur d'envoi. Adresse à vérifier."
  }
  if (c.outcome === "failed_temporary") {
    const detail = c.reason ? TEMPORARY_REASON_TEXT[c.reason] : undefined
    return detail
      ? `Incident temporaire (${detail}) : nouvel essai prévu.`
      : "Incident temporaire côté serveur d'envoi : nouvel essai prévu."
  }
  if (c.outcome === "accepted_by_relay") return "Accepté par le serveur d'envoi."
  return "Échec non classé par le serveur d'envoi."
}

/**
 * Short French label of an outcome, lowercase, used wherever a member's own delivery history is
 * shown (the data export, #598) — never "délivré", only what is proven.
 */
export const OUTCOME_LABEL_FR: Record<SmtpOutcome, string> = {
  accepted_by_relay: "accepté par le serveur d'envoi",
  rejected_permanent: "refus définitif",
  failed_temporary: "échec temporaire",
  unknown: "non classé",
}

/** Short French label of a reason, for the same uses as OUTCOME_LABEL_FR. */
export const REASON_LABEL_FR: Record<SmtpReason, string> = {
  mailbox_unknown: "boîte aux lettres introuvable",
  mailbox_disabled: "boîte aux lettres désactivée",
  mailbox_full: "boîte aux lettres pleine",
  domain_not_found: "domaine introuvable",
  policy_rejected: "rejeté par la politique du serveur destinataire",
  relay_error: "rejeté par notre propre serveur d'envoi",
  timeout: "délai dépassé",
  other: "cause non précisée",
}

/**
 * The sentence shown on the delivery page for a row's `lastError`: null when there is none,
 * the normalized sentence for a structured code, and a neutral sentence — never the raw text —
 * for anything else (rows written before #598).
 */
export function outboxErrorSentence(lastError: string | null): string | null {
  if (!lastError) return null
  if (lastError === MERGED_MEMBER_CANCEL_REASON) return "Annulé : fiche fusionnée avec une autre."
  const decoded = decodeOutcomeReason(lastError)
  if (decoded) return sentenceFor(decoded)
  return "Échec technique de l'envoi (détail non disponible)."
}

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
  registration_removed: "Retrait d'un créneau par l'organisation",
  release_available: "Nouvelle version disponible",
  addresses_to_verify_summary: "Résumé quotidien des adresses à vérifier",
  open_shifts: "Créneaux à compléter proposés à des membres",
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
    lastError: outboxErrorSentence(row.lastError),
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    nextAttemptAt: state === "pending" || state === "retrying" ? row.nextAttemptAt : null,
    // A row cancelled by a merge (#600) isn't retryable: its payload still carries the absorbed
    // record's old address, which the organizer just confirmed was wrong — retrying would email it.
    canRetry: state === "failed" && row.lastError !== MERGED_MEMBER_CANCEL_REASON,
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
