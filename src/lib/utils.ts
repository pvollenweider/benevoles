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
