import { customAlphabet } from "nanoid"
import { toMin, toMinEnd } from "./gantt-utils"

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 24)

export function generateToken(): string {
  return nanoid()
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

// Age in whole years on `referenceDate` — the shift's date for the minimum-age rule (#192): what
// matters is being old enough on the day of the shift, not on the day of registration. Shared by
// the public form's client-side check and the server-side enforcement it mirrors, so the two
// never drift apart. UTC getters: a "YYYY-MM-DD" birth date and Shift.date are both stored as
// UTC midnight, local getters would shift them by a day west of UTC.
export function calculateAgeAt(birthDate: Date | string, referenceDate: Date | string): number {
  const birth = typeof birthDate === "string" ? new Date(birthDate) : birthDate
  const ref = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate
  let age = ref.getUTCFullYear() - birth.getUTCFullYear()
  const monthDiff = ref.getUTCMonth() - birth.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < birth.getUTCDate())) age--
  return age
}

// Shifts (among `shifts`) whose minimum age the volunteer doesn't reach on the shift's own date.
export function shiftsTooYoungFor<T extends { minAge: number | null; date: Date | string }>(
  birthDate: Date | string,
  shifts: T[],
): T[] {
  return shifts.filter((s) => s.minAge != null && calculateAgeAt(birthDate, s.date) < s.minAge)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export function shiftsOverlap(
  a: { startTime: string; endTime: string; date: Date | string },
  b: { startTime: string; endTime: string; date: Date | string }
): boolean {
  // Compare absolute intervals: a shift that runs past midnight (22:00 to 02:00) also
  // overlaps shifts of the next calendar day, and legacy hours above 23 still work.
  const interval = (s: { startTime: string; endTime: string; date: Date | string }) => {
    const day = new Date(new Date(s.date).toISOString().split("T")[0]).getTime() / 60000
    return { start: day + toMin(s.startTime), end: day + toMinEnd(s.endTime, s.startTime) }
  }
  const ia = interval(a)
  const ib = interval(b)
  return ia.start < ib.end && ib.start < ia.end
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ")
}
