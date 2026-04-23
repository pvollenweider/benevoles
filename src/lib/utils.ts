import { customAlphabet } from "nanoid"

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
  const dateA = new Date(a.date).toISOString().split("T")[0]
  const dateB = new Date(b.date).toISOString().split("T")[0]
  if (dateA !== dateB) return false
  return a.startTime < b.endTime && b.startTime < a.endTime
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ")
}
