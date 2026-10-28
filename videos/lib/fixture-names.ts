// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Invented cast of the video fixtures: a first name shown on screen keeps the
 * same common European surname in every seed, guard, selector and script.
 * Surnames are among the most frequent of their country; nobody real is meant.
 * Emails stay on reserved example domains and never derive from these names.
 */
export const FIXTURE_SURNAMES = {
  Aline: "Martin",
  Nicolas: "Peeters",
  Léa: "Müller",
  Noah: "De Jong",
  Sarah: "Smith",
  Lucas: "Silva",
  Camille: "Rossi",
  Zoé: "Papadopoulos",
  Emma: "Johansson",
  Élodie: "Nováková",
  Colette: "Jensen",
  Samira: "García",
  Paul: "Murphy",
  Morgane: "Korhonen",
  Lou: "Tóth",
  Alex: "Ivanov",
  Jules: "Hansen",
} as const

export type FixtureFirstName = keyof typeof FIXTURE_SURNAMES

/** Placeholder surname of the fixtures before the cast; reset guards still accept it so an older local base can be reset in place. */
export const LEGACY_FIXTURE_SURNAME = "Exemple"

export function surnameOf(firstName: string): string {
  const surname = (FIXTURE_SURNAMES as Record<string, string>)[firstName]
  if (!surname) throw new Error(`No fixture surname for ${firstName}`)
  return surname
}

export const fullNameOf = (firstName: string) => `${firstName} ${surnameOf(firstName)}`

/** True for the cast surname of this first name, or the legacy placeholder when `legacy` is allowed (reset guards only). */
export const isFixtureSurname = (firstName: string, lastName: string, legacy = false) =>
  lastName === surnameOf(firstName) || (legacy && lastName === LEGACY_FIXTURE_SURNAME)

/** Gender-neutral surnames for generated rosters (no Ivanov/Nováková, whose form depends on the person). */
export const ROSTER_SURNAMES = ["Martin", "Müller", "Smith", "Peeters", "De Jong", "Gruber", "García", "Rossi", "Silva", "Papadopoulos", "Nowak", "Tóth", "Popa", "Melnyk", "Johansson", "Jensen", "Hansen", "Korhonen", "Murphy"] as const

/** Org-activity roster member `index`: 8 first names × 19 surnames are coprime, so the first 152 full names are distinct. */
export const rosterSurname = (index: number) => ROSTER_SURNAMES[index % ROSTER_SURNAMES.length]

/** A cast full name such as « Zoé Papadopoulos », never a free-typed or real name. */
export const isFixtureFullName = (name: string) => Object.entries(FIXTURE_SURNAMES).some(([first, last]) => name === `${first} ${last}`)
