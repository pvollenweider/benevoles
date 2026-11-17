// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The words of the « too many attempts » state (heading « Réessaie dans une heure ») of the pages a personal link opens (the sign-up
 * confirmation, the waitlist offer, « Je ne peux pas »): the connection opened too many unknown
 * links (src/lib/token-rate-limit.ts), so the page looks nothing up and says so. Pure, shared by
 * the three pages and their tab titles.
 *
 * The text is the same whatever the link: it never says whether the link exists, and names no
 * event, organisation or shift.
 */

/** The state's key in the pages' title maps. */
export const TOO_MANY_ATTEMPTS = "tooManyAttempts" as const
export type TooManyAttemptsState = typeof TOO_MANY_ATTEMPTS

/** The tab title (state part) and the page's only heading. */
export const TOO_MANY_ATTEMPTS_TITLE = "Réessaie dans une heure"

/**
 * The paragraphs under the heading, in reading order: what happens and what it means for the
 * person, what to do, what to do when it cannot wait. Written for someone who only clicked a link
 * in an email (owner's wording, 17 November 2026): the heading says what to do, no technical word,
 * and « wifi coupé » works from a computer as well as from a phone.
 */
export const TOO_MANY_ATTEMPTS_PARAGRAPHS = [
  "Cette page est bloquée pendant une heure. Cela arrive quand trop de liens sont ouverts depuis le même réseau. Ta réponse n'a pas été enregistrée.",
  "Dans une heure, clique à nouveau sur le lien reçu par email.",
  "C'est urgent ? Ouvre le lien sur ton téléphone, wifi coupé. Sinon, contacte l'organisation de l'événement.",
] as const
