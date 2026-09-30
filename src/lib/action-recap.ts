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
const LOGGED_ORG = "L'action est journalisée : vous la retrouverez dans le journal d'activité de l'organisation."

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

export function deactivateMemberRecap(name: string): ActionRecap {
  return {
    title: `Désactiver ${name} ?`,
    lines: ["La personne disparaît de la liste des membres actifs et des filtres ; ses inscriptions passées restent.", "Aucun email n'est envoyé. Un membre désactivé peut être réactivé depuis sa fiche (cochez « Inclure inactifs » pour la retrouver).", LOGGED_ORG],
    confirmLabel: "Désactiver",

    danger: true,
  }
}

/** "Samedi 4 juillet, 18:00–23:00": the moment of a shift, for a recap. */
export function shiftWhen(date: string, startTime: string, endTime: string): string {
  return `${dayLabel(date)}, ${startTime}–${endTime}`
}

/** "Samedi 4 juillet" from an ISO date. */
export function dayLabel(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}`
}

export function deleteShiftRecap(i: { name: string; when: string; registered: number }): ActionRecap {
  return {
    title: `Supprimer le créneau « ${i.name} » ?`,
    lines: [
      `${i.when}.`,
      i.registered > 0 ? `${n(i.registered, "bénévole inscrit", "bénévoles inscrits")} : ${i.registered > 1 ? "leurs inscriptions sont annulées et ils sont" : "son inscription est annulée et il est"} prévenu${i.registered > 1 ? "s" : ""} par email.` : "Personne n'est inscrit : aucun email.",
      "Si c'était le dernier créneau d'un événement publié, l'événement repasse en brouillon.",
      LOGGED,
    ],
    confirmLabel: "Supprimer",
    danger: true,
  }
}

export function removeLeaderRecap(name: string, roleName: string): ActionRecap {
  return {
    title: `Retirer ${name} des responsables de « ${roleName} » ?`,
    lines: ["Son lien de responsable cesse de fonctionner tout de suite.", "Aucun email n'est envoyé. Si la personne n'est plus responsable d'aucun poste, son tag « responsable » lui est retiré.", LOGGED],
    confirmLabel: "Retirer",

    danger: true,
  }
}

export function deleteRoleRecap(i: { role: string; shifts: number; registered: number }): ActionRecap {
  return {
    title: `Supprimer le poste « ${i.role} » ?`,
    lines: [
      `${n(i.shifts, "créneau supprimé", "créneaux supprimés")}.`,
      i.registered > 0 ? `${n(i.registered, "bénévole inscrit", "bénévoles inscrits")} : ${i.registered > 1 ? "leurs inscriptions sont annulées et ils sont prévenus" : "son inscription est annulée et il est prévenu"} par email.` : "Personne n'est inscrit : aucun email.",
      "Si c'étaient les derniers créneaux d'un événement publié, l'événement repasse en brouillon.",
      LOGGED,
    ],
    confirmLabel: "Supprimer",
    danger: true,
  }
}

/** Link to the event log filtered from the day the action ran (the log's filter is a date), so its entries are on the first page. */
export function logLinkFor(eventId: string, startedAt: Date, timeZone?: string): string {
  const since = startedAt.toLocaleDateString("sv-SE", timeZone ? { timeZone } : undefined)
  return `/admin/events/${eventId}/log?since=${since}`
}
