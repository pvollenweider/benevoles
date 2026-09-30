// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What a sensitive action is about to do, in plain words, before the admin confirms (#379): how
 * many people, which emails will go out, what happens next, and that the action is logged. Pure;
 * the confirmation modal renders the lines and the log link is built from the action's start.
 */

export type ActionRecap = { title: string; lines: string[]; confirmLabel: string; danger: boolean }

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`
const LOGGED = "L'action est journalisée : vous la retrouverez dans le journal de l'événement."

export function bulkCancelRecap(i: { people: number; withEmail: number; waitlisted: number }): ActionRecap {
  return {
    title: `Retirer ${n(i.people, "bénévole", "bénévoles")} de leur créneau ?`,
    lines: [
      `${n(i.people, "inscription annulée", "inscriptions annulées")}. Les places sont libérées immédiatement.`,
      i.withEmail > 0 ? `${n(i.withEmail, "email d'annulation envoyé", "emails d'annulation envoyés")} aux personnes concernées.` : "Aucun email : personne n'a d'adresse.",
      i.waitlisted > 0 ? `${n(i.waitlisted, "place libérée sera proposée", "places libérées seront proposées")} à la liste d'attente.` : "Pas de liste d'attente sur ces créneaux.",
      LOGGED,
    ],
    confirmLabel: "Retirer",
    danger: true,
  }
}

export function bulkLeaderRecap(i: { people: number; withoutEmail: number }): ActionRecap {
  return {
    title: `Rendre ${n(i.people, "bénévole", "bénévoles")} responsable de leur poste ?`,
    lines: [
      `${n(i.people, "responsable de secteur désigné", "responsables de secteur désignés")}, chacun pour le poste de son inscription.`,
      `${n(i.people, "email envoyé", "emails envoyés")} avec le lien de responsable.`,
      ...(i.withoutEmail > 0 ? [`${n(i.withoutEmail, "personne ignorée", "personnes ignorées")} : pas d'adresse email.`] : []),
      LOGGED,
    ],
    confirmLabel: "Désigner",
    danger: false,
  }
}

export function bulkResendRecap(i: { people: number }): ActionRecap {
  return {
    title: `Renvoyer leur lien personnel à ${n(i.people, "bénévole", "bénévoles")} ?`,
    lines: [`${n(i.people, "email envoyé", "emails envoyés")} : un seul email par personne, même si plusieurs de ses inscriptions sont sélectionnées.`, "Rien d'autre ne change.", LOGGED],
    confirmLabel: "Renvoyer",
    danger: false,
  }
}

export function remindInvitedRecap(i: { people: number }): ActionRecap {
  return {
    title: `Relancer ${n(i.people, "membre invité", "membres invités")} sans réponse ?`,
    lines: [`${n(i.people, "email de relance envoyé", "emails de relance envoyés")}.`, "Les membres déjà inscrits ne reçoivent rien.", LOGGED],
    confirmLabel: "Relancer",
    danger: false,
  }
}

/** Link to the event log filtered from the day the action ran (the log's filter is a date), so its entries are on the first page. */
export function logLinkFor(eventId: string, startedAt: Date, timeZone?: string): string {
  const since = startedAt.toLocaleDateString("sv-SE", timeZone ? { timeZone } : undefined)
  return `/admin/events/${eventId}/log?since=${since}`
}
