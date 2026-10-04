// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Organizer-facing results of sending invitations and reminders (#597): read as a sentence, with
// agreement in number, and refused emails counted apart from sent ones.

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/** « 3 invités, 2 emails envoyés, 1 échec d'envoi, 1 sans email ». Zero parts are left out. */
export function inviteResultText(r: { invitedNew?: number; skippedExisting?: number; emailsSent?: number; emailsFailed?: number; membersWithoutEmail?: number }): string {
  const parts: string[] = []
  if (r.invitedNew) parts.push(n(r.invitedNew, "invité", "invités"))
  if (r.skippedExisting) parts.push(n(r.skippedExisting, "déjà invité", "déjà invités"))
  if (r.emailsSent) parts.push(n(r.emailsSent, "email envoyé", "emails envoyés"))
  if (r.emailsFailed) parts.push(n(r.emailsFailed, "échec d'envoi", "échecs d'envoi"))
  if (r.membersWithoutEmail) parts.push(`${r.membersWithoutEmail} sans email`)
  return parts.join(", ")
}

/** « 2 relances envoyées, 1 échec d'envoi ». */
export function remindResultText(r: { sent: number; failed?: number }): string {
  const sent = n(r.sent, "relance envoyée", "relances envoyées")
  return r.failed ? `${sent}, ${n(r.failed, "échec d'envoi", "échecs d'envoi")}` : sent
}
