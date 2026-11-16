// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * French elision before a person's first name (#1146, independent review): « qu'Aline », « d'Emma »,
 * « que Lucas », « de Lucas ». Only before a vowel: a name starting with « h » or « y » keeps the
 * full word (« de Hugo », « de Yann »), since an aspirated h cannot be told from a silent one.
 */

const VOWEL = /^[aeiouàâäéèêëîïôöùûüœæ]/i

/** Whether a word elides before `next`. */
export const elidesBefore = (next: string) => VOWEL.test(next.trim())

/** « qu'Aline », « que Lucas ». */
export const que = (next: string) => (elidesBefore(next) ? `qu'${next.trim()}` : `que ${next.trim()}`)

/** « d'Emma », « de Lucas ». */
export const de = (next: string) => (elidesBefore(next) ? `d'${next.trim()}` : `de ${next.trim()}`)
