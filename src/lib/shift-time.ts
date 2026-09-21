import { z } from "zod"

/**
 * Shift times are wall-clock times of the shift's date: 00:00 to 23:59, never
 * 24:00, 25:00 or 26:00. After midnight the clock starts again at zero.
 * A shift that runs past midnight has an end time earlier than its start time
 * (22:00 to 02:00): the end is then read as the next morning. A shift that
 * starts after midnight belongs to the next calendar date.
 */
export const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const CLOCK_ERROR =
  "Heure invalide : format HH:MM, de 00:00 à 23:59. Pour un créneau qui passe minuit, saisissez une heure de fin plus petite que le début (par exemple 22:00 à 02:00)."

export const SAME_TIME_ERROR = "L'heure de fin doit être différente de l'heure de début."

export const clockSchema = z.string().regex(CLOCK_RE, CLOCK_ERROR)

export function isValidClock(value: string): boolean {
  return CLOCK_RE.test(value)
}

/** First error message of a zod result, for a plain-text `error` field. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides."
}
