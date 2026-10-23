// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Organizer-facing results of sending invitations and reminders (#597, #1105): read as a sentence,
// with agreement in number. The emails go through the outbox: they are « en cours d'envoi », never
// claimed as sent, and one held over a sending limit is not a failure. Zero parts are left out.

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/** « 3 invités, 1 déjà invité, 4 emails en cours d'envoi, 1 sans email. 1 invitation pas renvoyée : … » */
export function inviteResultText(r: { invitedNew?: number; skippedExisting?: number; emailsQueued?: number; recentlySkipped?: number; membersWithoutEmail?: number }): string {
  const parts: string[] = []
  if (r.invitedNew) parts.push(n(r.invitedNew, "invité", "invités"))
  if (r.skippedExisting) parts.push(n(r.skippedExisting, "déjà invité", "déjà invités"))
  if (r.emailsQueued) parts.push(n(r.emailsQueued, "email en cours d'envoi", "emails en cours d'envoi"))
  if (r.membersWithoutEmail) parts.push(`${r.membersWithoutEmail} sans email`)
  const sentences = parts.length ? [`${parts.join(", ")}.`] : []
  if (r.recentlySkipped) {
    sentences.push(r.recentlySkipped > 1
      ? `${r.recentlySkipped} invitations pas renvoyées : la précédente est partie il y a moins de 5 minutes, ou attend encore son tour.`
      : "1 invitation pas renvoyée : la précédente est partie il y a moins de 5 minutes, ou attend encore son tour.")
  }
  return sentences.join(" ")
}

/** « 12 relances en cours d'envoi. 3 personnes invitées ou relancées il y a moins de 48 heures ne sont pas relancées à nouveau. » */
export function remindResultText(r: { queued: number; recentlySkipped?: number; declinedSkipped?: number }): string {
  const sentences = [r.queued > 0 ? `${n(r.queued, "relance en cours d'envoi", "relances en cours d'envoi")}.` : "Personne n'a été relancé."]
  if (r.recentlySkipped) {
    sentences.push(r.recentlySkipped > 1
      ? `${r.recentlySkipped} personnes invitées ou relancées il y a moins de 48 heures ne sont pas relancées à nouveau.`
      : "1 personne invitée ou relancée il y a moins de 48 heures n'est pas relancée à nouveau.")
  }
  if (r.declinedSkipped) sentences.push(`${n(r.declinedSkipped, "personne pas disponible non relancée", "personnes pas disponibles non relancées")}.`)
  return sentences.join(" ")
}

/** Under « Relancer » (#1105): why it reaches fewer people than « Sans réponse », or nobody yet. */
export function remindWaitHint(r: { eligible: number; recent: number }): string | null {
  if (r.recent === 0) return null
  if (r.eligible === 0) {
    return r.recent > 1
      ? `Les ${r.recent} sans créneau ont été invités ou relancés il y a moins de 48 heures : vous pourrez les relancer après ce délai.`
      : "La personne sans créneau a été invitée ou relancée il y a moins de 48 heures : vous pourrez la relancer après ce délai."
  }
  return r.recent > 1
    ? `${r.recent} personnes invitées ou relancées il y a moins de 48 heures ne seront pas relancées cette fois.`
    : "1 personne invitée ou relancée il y a moins de 48 heures ne sera pas relancée cette fois."
}

/** « 42 rappels en cours d'envoi » (manual reminder, #1105). */
export function manualReminderResultText(queued: number): string {
  return n(queued, "rappel en cours d'envoi", "rappels en cours d'envoi")
}
