// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { dayLabel, spokenTimeRange } from "./spoken-time"

/**
 * What a sensitive action is about to do, in plain words, before the admin confirms (#379): how
 * many people, which emails will go out, what happens next, and that the action is logged. Pure;
 * the confirmation modal renders the lines and the log link is built from the action's start.
 */

export type ActionRecap = {
  title: string
  /** The recap's bullet list (after the groups, when there are any). */
  lines: string[]
  confirmLabel: string
  danger: boolean
  /**
   * Optional, for a longer recap (#516): the one sentence that matters most (e.g. irreversible),
   * shown first, then a warning shown in a box with a visible « Attention : », then headed lists
   * (« Effacé : », « Conservé : »), one item each. When `lead` or `warning` is set, they alone
   * describe the dialog (aria-describedby), not the whole recap.
   */
  lead?: string
  warning?: string
  groups?: { heading: string; items: string[] }[]
}

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`
const LOGGED = "L'action est journalisée : vous la retrouverez dans le journal de l'événement."
const LOGGED_ORG = "L'action est journalisée : vous la retrouverez dans le journal d'activité de l'organisation."

const UNDO_LINE = "Vous aurez 10 secondes pour annuler : rien n'est envoyé ni enregistré avant. Quitter la page valide le retrait."

/**
 * What « Retirer de leur créneau » does with a selection (#703): only confirmed registrations are
 * cancelled (the bulk route skips the others), and each person removed with an email address gets
 * one email, however many of their rows are selected. Counted from the rows on screen.
 */
export function bulkCancelCounts(selected: { status: string; volunteer: { id: string; email: string | null } }[]) {
  const active = selected.filter((r) => r.status === "active")
  const people = new Set(active.map((r) => r.volunteer.id))
  const withEmail = new Set(active.filter((r) => r.volunteer.email).map((r) => r.volunteer.id))
  return { registrations: active.length, people: people.size, withEmail: withEmail.size, notConfirmed: selected.length - active.length }
}

export function bulkCancelRecap(i: { registrations: number; people: number; withEmail: number; notConfirmed?: number; waitlisted: number }): ActionRecap {
  const withoutEmail = i.people - i.withEmail
  return {
    title: `Retirer ${n(i.people, "bénévole", "bénévoles")} de leur créneau ?`,
    lines: [
      `${n(i.registrations, "inscription annulée", "inscriptions annulées")}. Les places sont libérées immédiatement.`,
      i.withEmail > 0
        ? `${n(i.withEmail, "email d'annulation envoyé", "emails d'annulation envoyés")}, un par personne, avec le lien vers ses autres créneaux s'il lui en reste.`
        : "Aucun email : personne n'a d'adresse.",
      ...(i.withEmail > 0 && withoutEmail > 0 ? [`${n(withoutEmail, "personne sans adresse ne reçoit", "personnes sans adresse ne reçoivent")} rien.`] : []),
      ...(i.notConfirmed ? [`${n(i.notConfirmed, "inscription sélectionnée est", "inscriptions sélectionnées sont")} en liste d'attente, avec une place proposée ou en demande : ${i.notConfirmed > 1 ? "elles restent telles quelles" : "elle reste telle quelle"}, sans email.`] : []),
      i.waitlisted > 0 ? `${n(i.waitlisted, "place libérée sera proposée", "places libérées seront proposées")} à la liste d'attente.` : "Pas de liste d'attente sur ces créneaux.",
      LOGGED,
      UNDO_LINE,
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

export function remindInvitedRecap(i: { people: number; declined?: number }): ActionRecap {
  return {
    title: `Relancer ${n(i.people, "membre invité", "membres invités")} sans créneau confirmé ?`,
    lines: [
      `${n(i.people, "email de relance envoyé", "emails de relance envoyés")}.`,
      "Les membres déjà inscrits ne reçoivent rien.",
      ...(i.declined ? [`${n(i.declined, "membre ayant indiqué ne pas être disponible ne reçoit", "membres ayant indiqué ne pas être disponibles ne reçoivent")} rien non plus.`] : []),
      LOGGED,
    ],
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

/** Permanent deletion (#667, owner decision): only ever offered for an inactive member with no
 * registration at all, so there is nothing to cancel or notify, only what cascades with it. */
export function deleteMemberRecap(name: string): ActionRecap {
  return {
    title: `Supprimer ${name} ?`,
    lines: [
      "Cette action est irréversible : la fiche ne peut pas être récupérée ensuite.",
      "Disparaissent avec elle : ses invitations, ses réponses aux questions des événements, ses abonnements aux notifications, les suivis d'envoi d'email et les doublons possibles écartés la concernant.",
      "Aucun email n'est envoyé.",
      LOGGED_ORG,
    ],
    confirmLabel: "Supprimer",
    danger: true,
  }
}

/**
 * "Samedi 4 juillet, de 18h à 23h": the moment of a shift, for a recap shown on screen, in words
 * (#587; an en dash between two hours is read « tiret »). Times are stored "HH:MM".
 */
export function shiftWhen(date: string, startTime: string, endTime: string): string {
  return `${dayLabel(date)}, ${spokenTimeRange(startTime, endTime)}`
}

// Kept exported from here for existing callers; it lives in spoken-time.ts.
export { dayLabel }

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

export function deleteMilestoneRecap(title: string): ActionRecap {
  return {
    title: `Supprimer le jalon « ${title} » ?`,
    lines: ["Le jalon disparaît de la préparation de l'événement. Aucun email n'est envoyé.", LOGGED],
    confirmLabel: "Supprimer",
    danger: true,
  }
}

export function deletePageRecap(title: string): ActionRecap {
  return {
    title: `Supprimer la page « ${title} » ?`,
    lines: ["La page n'est plus visible sur la page publique de l'événement ; les liens vers elle ne fonctionnent plus.", "Aucun email n'est envoyé.", LOGGED],
    confirmLabel: "Supprimer",
    danger: true,
  }
}

export function toggleOrgRecap(name: string, active: boolean): ActionRecap {
  return active
    ? {
        title: `Désactiver l'organisation « ${name} » ?`,
        lines: ["Ses administrateurs ne peuvent plus se connecter et ses pages publiques ne répondent plus.", "Ses emails en attente sont annulés et ne partiront jamais.", "Aucune donnée n'est supprimée : l'organisation peut être réactivée à tout moment, mais elle est effacée 30 jours après sa désactivation.", "Aucun email n'est envoyé."],
        confirmLabel: "Désactiver",
        danger: true,
      }
    : {
        title: `Réactiver l'organisation « ${name} » ?`,
        lines: ["Ses administrateurs peuvent de nouveau se connecter et ses pages publiques répondent.", "Aucun email n'est envoyé."],
        confirmLabel: "Réactiver",
        danger: false,
      }
}

/** Suspension for abuse (#810): distinct from a deactivation, see src/lib/org-suspension.ts. */
export function suspendOrgRecap(name: string): ActionRecap {
  return {
    title: `Suspendre l'organisation « ${name} » pour abus ?`,
    lines: [
      "Ses administrateurs ne peuvent plus se connecter et ses pages publiques ne répondent plus.",
      "Ses emails en attente sont annulés et ne partiront jamais ; aucune inscription n'est plus possible.",
      "Ses données sont conservées pour l'enquête : jamais effacées automatiquement.",
      "Seul le super admin peut lever la suspension ; « Réactiver » reste impossible tant qu'elle dure.",
      "Aucun email n'est envoyé.",
    ],
    confirmLabel: "Suspendre",
    danger: true,
  }
}

export function liftSuspensionRecap(name: string): ActionRecap {
  return {
    title: `Lever la suspension de « ${name} » ?`,
    lines: [
      "L'organisation reste désactivée : il faudra ensuite la réactiver, à part.",
      "Elle redevient soumise au nettoyage : effacée 30 jours après sa désactivation si elle n'est pas réactivée.",
      "Aucun email n'est envoyé.",
    ],
    confirmLabel: "Lever la suspension",
    danger: false,
  }
}

/** Validation of a space awaiting it (#810): both grants at once. */
export function approveOrgRecap(name: string): ActionRecap {
  return {
    title: `Valider l'espace « ${name} » ?`,
    lines: [
      "Il peut publier ses événements : ses pages publiques répondent.",
      "Il peut écrire à ses bénévoles et à ses membres.",
      "Ses administrateurs reçoivent un email « Votre espace est activé ».",
    ],
    confirmLabel: "Valider l'espace",
    danger: false,
  }
}

/** Refusal of a space awaiting validation (#810): deleted with its accounts, nothing sent. */
export function refuseOrgRecap(name: string): ActionRecap {
  return {
    title: `Refuser et supprimer l'espace « ${name} » ?`,
    lines: [
      "L'espace est supprimé définitivement, avec ses événements, ses membres et ses comptes administrateurs.",
      "Aucun email n'est envoyé.",
    ],
    confirmLabel: "Refuser et supprimer",
    danger: true,
  }
}

export function deleteOrgRecap(i: { name: string; events: number; volunteers: number; admins: number }): ActionRecap {
  return {
    title: `Supprimer définitivement « ${i.name} » ?`,
    lines: [
      `Toutes ses données sont effacées : ${n(i.events, "événement", "événements")}, ${n(i.volunteers, "membre", "membres")}, ${n(i.admins, "administrateur", "administrateurs")}, inscriptions et journaux.`,
      "Cette action est irréversible : aucune sauvegarde applicative ne permet de la défaire.",
      "Aucun email n'est envoyé.",
    ],
    confirmLabel: "Supprimer définitivement",
    danger: true,
  }
}

export function broadcastRecap(recipients: number): ActionRecap {
  return {
    title: `Envoyer cette communication à ${n(recipients, "administrateur", "administrateurs")} ?`,
    lines: ["Chaque destinataire reçoit un email tout de suite ; l'envoi ne peut pas être annulé.", "Le message est conservé dans l'historique des communications."],
    confirmLabel: "Envoyer",
    danger: false,
  }
}

/** Link to the event log filtered from the day the action ran (the log's filter is a date), so its entries are on the first page. */
export function logLinkFor(eventId: string, startedAt: Date, timeZone?: string): string {
  const since = startedAt.toLocaleDateString("sv-SE", timeZone ? { timeZone } : undefined)
  return `/admin/events/${eventId}/log?since=${since}`
}

/** Accepting a request on a « Sur validation » shift (#484). */
export function acceptRequestRecap(i: { name: string; shift: string; hasEmail: boolean }): ActionRecap {
  return {
    title: `Accepter la demande de ${i.name} ?`,
    lines: [
      `La demande de ${i.name} sur « ${i.shift} » devient une inscription confirmée.`,
      i.hasEmail ? "Un email de confirmation lui est envoyé, avec son lien personnel." : "Aucun email : cette personne n'a pas d'adresse.",
      LOGGED,
    ],
    confirmLabel: "Accepter",
    danger: false,
  }
}

/** Refusing a request (#484): the spot is freed; the email gives no reason unless one is written. */
export function refuseRequestRecap(i: { name: string; shift: string; hasEmail: boolean; waitlist: boolean }): ActionRecap {
  return {
    title: `Refuser la demande de ${i.name} ?`,
    lines: [
      `La demande sur « ${i.shift} » est refusée et la place est libérée.`,
      i.hasEmail ? "Un email poli le lui dit, sans raison sauf si vous écrivez un message ci-dessous." : "Aucun email : cette personne n'a pas d'adresse.",
      ...(i.waitlist ? ["La place libérée sera proposée à la liste d'attente."] : []),
      LOGGED,
    ],
    confirmLabel: "Refuser",
    danger: true,
  }
}

/** Removing the organization's logo (#300): where it disappears, and that a new one can be sent. */
export function removeLogoRecap(): ActionRecap {
  return {
    title: "Retirer le logo de l'organisation ?",
    lines: [
      "Le logo disparaît des pages publiques, des documents imprimés, des badges, des attestations et des prochains emails. Le nom de l'organisation reste affiché partout.",
      "Les emails déjà envoyés afficheront le nom de l'organisation à la place du logo.",
      "Vous pourrez envoyer un nouveau logo à tout moment.",
      LOGGED_ORG,
    ],
    confirmLabel: "Retirer le logo",
    danger: true,
  }
}
