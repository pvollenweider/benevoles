// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { RosterAction, RosterViewerState, ShiftRosterEntry } from "./shift-roster"

/**
 * What volunteers and organisers read about the shift roster (#1068): the consent texts and
 * notices, the settings' wording, the sentences of the personal page and the event page, and the
 * display name's format (« Aline M. », printed and spoken). The rules (who may see, who is named,
 * the counts, the consent texts' versions and audiences) are in src/lib/shift-roster.ts.
 *
 * Pure and client-safe (no Prisma).
 */

// --- Consent texts and notices ---

/**
 * The first consent text (ROSTER_NOTICE_V1, 2026-10-21), no longer shown, kept for the record of
 * what was accepted under it: « J'accepte que les autres bénévoles confirmés de cet événement, y
 * compris ceux qui ne partagent aucun créneau avec moi, voient sur chacun de mes créneaux mon
 * prénom et l'initiale de mon nom (par exemple « Aline M. »), jusqu'à la fin de l'événement, pour
 * savoir avec qui ils seront et choisir leurs créneaux. »
 *
 * The current one (ROSTER_NOTICE_VERSION): the sign-up form's optional checkbox, first person like
 * the form's other boxes: who sees what; the rest (scope, duration, purpose, withdrawal, count) is
 * its hint, read with it.
 */
export const ROSTER_SIGNUP_LABEL = "J'accepte que les bénévoles confirmés et les membres invités par l'organisation voient mon prénom et l'initiale de mon nom (par exemple « Aline M. ») sur mes créneaux confirmés."
/** Said wherever a volunteer learns about the roster: the count needs no choice (#1068 follow-up). */
export const ROSTER_COUNT_NOTICE = "Même si ton nom reste masqué, ta place confirmée est comptée dans le nombre de bénévoles affiché sur chaque créneau."
export const ROSTER_SIGNUP_HINT = `Ces personnes le voient, même sans créneau commun avec toi, jusqu'à la fin de l'événement, pour choisir leurs créneaux et savoir avec qui elles seront. Facultatif, sans effet sur ton inscription. Tu pourras le confirmer, ou le masquer à tout moment, sur ta page « Mes inscriptions ». ${ROSTER_COUNT_NOTICE}`
/** The sign-up form's sentence for a known minor, instead of the box. */
export const ROSTER_MINOR_TEXT = `Les noms des bénévoles de moins de 18 ans ne sont jamais montrés aux autres bénévoles. ${ROSTER_COUNT_NOTICE}`

// --- The organisers' side ---

/**
 * The organisers' side (#1068): one short sentence and a link to the guide, which holds the
 * details (who never sees, minors, duration, people already registered, the duty to inform and a
 * message to send). The duty to inform is recalled on the publication page.
 */
export const ROSTER_SETTING_LABEL = "Montrer aux bénévoles qui est inscrit"
export const ROSTER_SETTING_HINT = "Les bénévoles confirmés et les membres invités voient le prénom et l'initiale de ceux qui l'acceptent."
/** Under the setting while it is on (also once the event is published), said when ticked. */
export const ROSTER_ENABLE_REMINDER = "Informez vos bénévoles, y compris les personnes déjà inscrites : leur place confirmée est comptée même si leur nom reste masqué."
/** The publication page's note, the setting on (the default for a new event) or off. */
export const ROSTER_PUBLISH_NOTE_ON = "« Qui est inscrit » est activé : prévenez vos bénévoles."
export const ROSTER_PUBLISH_NOTE = "« Qui est inscrit » est désactivé. L'activer, maintenant ou plus tard, ne change rien à la publication."
export const ROSTER_SETTING_LINK = "Modifier le réglage « Qui est inscrit »"
/** The organisation's default for its new events (Paramètres, owners only). */
export const ROSTER_ORG_DEFAULT_LABEL = "Par défaut, montrer aux bénévoles qui est inscrit"
export const ROSTER_ORG_DEFAULT_HINT = "S'applique aux événements créés ensuite ; les événements existants gardent leur réglage."

/** The topic of the « En savoir plus » links (said to screen readers: « En savoir plus sur … »). */
export const ROSTER_DOC_TOPIC = "« Qui est inscrit »"
/**
 * Where « En savoir plus » leads, per screen: a heading of a unit of content/guide/
 * (src/lib/__tests__/shift-roster-doc-links.test.ts fails when one no longer exists).
 */
export const ROSTER_DOC_LINKS = {
  setting: "/doc/creer-un-evenement#activer-qui-est-inscrit-sur-un-evenement-qui-a-deja-des-inscrits",
  orgDefault: "/doc/personnaliser-l-organisation#qui-est-inscrit-reglage-par-defaut",
  publish: "/doc/creer-un-evenement#prevenir-les-benevoles-deja-inscrits",
  signup: "/doc/choisir-ses-creneaux#voir-qui-est-inscrit",
  personal: "/doc/ma-page-personnelle#qui-est-inscrit",
} as const

// --- The display name ---

/** « Aline M. »: the first name and the first letter of the last name, nothing more. Null without a first name. */
export function rosterDisplayName(firstName: string, lastName: string): string | null {
  const first = firstName.trim().replace(/\s+/g, " ")
  if (!first) return null
  // By code point, so an accented or astral first letter is kept whole.
  const initial = Array.from(lastName.trim())[0]
  return initial ? `${first} ${initial.toLocaleUpperCase("fr")}.` : first
}

/**
 * The display name as printed: a non-breaking space before the initial, so that « Léa F. » never
 * wraps between the first name and « F. ». Printed text only: rosterSpokenName and the API keep
 * the plain space.
 */
export function rosterVisibleName(displayName: string): string {
  return displayName.replace(/ (\S\.)$/u, "\u00a0$1")
}

/** How a screen reader should say a display name: « M. » alone is read « Monsieur » by French voices. */
export function rosterSpokenName(displayName: string): string {
  const m = displayName.match(/^(.*) (\S)\.$/u)
  return m ? `${m[1]}, initiale ${m[2]}` : displayName
}

// --- The personal page ---

/** Who sees a name shown under the current text, in the personal page's sentences. */
const AUDIENCE_TEXT = "les bénévoles confirmés et les membres invités par l'organisation"

/** The personal page's switch: turning it on gives the consent (current text), off withdraws it. */
export const ROSTER_NAME_SWITCH_LABEL = "Afficher mon nom aux autres bénévoles"

/**
 * The state written next to the switch, always in words (never colour alone). `name` is the
 * display name in the form wanted (printed or spoken), already quoted by the caller or not.
 */
export function rosterStateText(state: Exclude<RosterViewerState, "minor">, name: string | null): string {
  const shown = name ? ` : «\u00a0${name}\u00a0»` : ""
  switch (state) {
    case "visible": return `Visible${shown}`
    case "visible_confirmed": return `Visible aux bénévoles confirmés${shown}`
    case "pending": return "À confirmer : tu l'as demandé à l'inscription. Active l'interrupteur pour l'afficher."
    case "hidden": return "Masqué"
  }
}

/**
 * What the switch's description says beyond its state: who sees the name and on what terms. Off
 * or to confirm, this page may collect a first consent, so the sentence is complete (audience,
 * data, scope, duration, purpose, free choice, withdrawal); the sign-up form's box says the same.
 */
export function rosterChoiceText(state: RosterViewerState, displayName: string | null): string {
  const shown = displayName ? `«\u00a0${displayName}\u00a0»` : "ton prénom et l'initiale de ton nom"
  switch (state) {
    case "visible": return `Sur tes créneaux confirmés, ${AUDIENCE_TEXT} voient ${shown}. Tu peux le masquer à tout moment avec cet interrupteur.`
    case "visible_confirmed": return `Sur tes créneaux confirmés, les bénévoles confirmés voient ${shown}. Tu peux le masquer à tout moment avec cet interrupteur.`
    case "pending":
    case "hidden": return `Si tu l'affiches, ${AUDIENCE_TEXT} verront ${shown} sur tes créneaux confirmés, même sans créneau commun avec toi, jusqu'à la fin de l'événement, pour choisir leurs créneaux et savoir avec qui ils seront. C'est facultatif, sans effet sur ton inscription. Tu peux le masquer à tout moment avec cet interrupteur.`
    case "minor": return "Ton nom n'est pas montré aux autres bénévoles (moins de 18 ans)."
  }
}

/** A name shown under the first text (confirmed volunteers only): the offer to accept the current one. */
export const ROSTER_WIDEN_TEXT = "Les membres invités ne le voient pas encore."
export const ROSTER_WIDEN_LABEL = "Le leur montrer aussi"
/** What the card says once a choice is saved. */
export function rosterDoneText(action: RosterAction): string {
  if (action === "hide") return "Ton nom est maintenant masqué."
  if (action === "widen") return "Ton nom est maintenant montré aussi aux membres invités."
  return "Ton nom est maintenant affiché."
}
/** The card's empty state, its failure. */
export const ROSTER_EMPTY_TEXT = "Aucun créneau confirmé pour l'instant."
export const ROSTER_NOBODY_TEXT = "Personne d'autre pour l'instant."
export const ROSTER_FAILURE_TEXT = "Ton choix n'a pas pu être enregistré. Vérifie ta connexion, puis réessaie."

// --- A shift's line (personal page and event page) ---

/**
 * After a shift's names, or alone when none is shown: « et 3 autres bénévoles », « 1 autre
 * bénévole, sans nom affiché ». « autre » = other than the viewer, who is never counted. Null for 0.
 */
export function rosterOthersText(count: number, withNames: boolean): string | null {
  if (!(count > 0)) return null
  const n = `${count} ${count === 1 ? "autre bénévole" : "autres bénévoles"}`
  return withNames ? `et ${n}` : `${n}, sans nom affiché`
}

/**
 * One shift's roster in a sentence, for the event page (list line, frise detail, a bar's
 * description): « Aline M., Luc D. et 2 autres bénévoles », « Aline M. et Luc D. », « 3 autres
 * bénévoles, sans nom affiché », « personne d'autre pour l'instant ». `name` formats each display
 * name (printed or spoken form). No entry = nobody else confirmed there.
 */
export function rosterSummary(entry: Pick<ShiftRosterEntry, "names" | "othersCount"> | undefined, name: (n: string) => string = (n) => n): string {
  const names = (entry?.names ?? []).map(name)
  const others = entry?.othersCount ?? 0
  if (names.length === 0) return others > 0 ? rosterOthersText(others, false)! : "personne d'autre pour l'instant"
  if (others > 0) return `${names.join(", ")} ${rosterOthersText(others, true)}`
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`
}

/** The lead of a shift's line: « Avec toi » on the viewer's own shift, « Sur ce créneau » otherwise. */
export const rosterLead = (own: boolean) => (own ? "Avec toi" : "Sur ce créneau")

// --- The event page ---

/** The event page's switch (#1068): its label, the sentence while on, its messages. */
export const ROSTER_SWITCH_LABEL = "Voir qui est inscrit"
export const ROSTER_SWITCH_EXPLAIN = "Prénom et initiale des bénévoles confirmés qui l'ont accepté ; les autres sont comptés, sans leur nom."
export const ROSTER_SWITCH_LOADED = "Les inscrits sont affichés sur les créneaux."
export const ROSTER_SWITCH_FAILURE = "Impossible d'afficher qui est inscrit pour l'instant. Désactive puis réactive « Voir qui est inscrit » pour réessayer."
export const ROSTER_SWITCH_UNAVAILABLE = "Qui est inscrit n'est pas disponible pour cet événement."
export const ROSTER_FRISE_PROMPT = "Touche, survole ou sélectionne au clavier un créneau pour voir qui est inscrit. La vue Liste affiche tous les noms."
/** The personal page's link to the event page, the switch on. */
export const ROSTER_SEE_OTHERS_LABEL = "Voir qui est inscrit sur les autres créneaux"
