// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The words of the « Trop de tentatives » state of the pages a personal link opens (the sign-up
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
export const TOO_MANY_ATTEMPTS_TITLE = "Trop de tentatives"

/** The paragraphs under the heading, in reading order. */
export const TOO_MANY_ATTEMPTS_PARAGRAPHS = [
  "Trop de liens non reconnus ont été ouverts depuis ta connexion internet en peu de temps. Par sécurité, les liens personnels sont en pause pour cette connexion, pendant une heure au plus.",
  "Ton lien n'a pas été vérifié et rien n'a été modifié. Attends une heure, puis ouvre à nouveau le lien reçu par email.",
  "Si tu dois répondre avant, essaie depuis une autre connexion, par exemple les données mobiles de ton téléphone, ou écris à l'organisation de ton événement.",
] as const
