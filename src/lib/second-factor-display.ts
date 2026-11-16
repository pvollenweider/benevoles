// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Display helpers of the second factor (pentest F6), safe in the browser (no Node import).
 */

/** Codes in a set (same as RECOVERY_CODE_COUNT on the server, which can't be imported here). */
export const RECOVERY_CODE_COUNT_SHOWN = 10

export const RECOVERY_CODES_FILE_NAME = "benevol-codes-de-secours.txt"

/** The downloaded file: what it is, for which account and site, when, then one code per line. */
export function recoveryCodesFile(codes: string[], about: { site: string; email: string; createdAt: Date }): string {
  const date = about.createdAt.toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })
  return [
    `Codes de secours de la double authentification, ${about.site}`,
    `Compte : ${about.email}`,
    `Créés le ${date}. Chaque code ne sert qu'une fois.`,
    "",
    ...codes,
    "",
  ].join("\n")
}

/** The digits of a typed code: spaces (non-breaking ones too) and dashes dropped. */
export function codeDigits(input: string): string {
  return input.replace(/[\s  -]/g, "")
}

/** A French date with the ordinal for the first of the month: « 1er novembre 2026 ». */
export function frenchLongDate(date: Date, timeZone?: string): string {
  const text = date.toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric", timeZone })
  return text.replace(/^1 /, "1er ")
}
