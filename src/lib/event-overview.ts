// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sentences of an event's overview page (the « Aperçu » tab): the places in words instead of four
 * stat cards, the last message sent and the next automatic reminder. Pure: no Prisma, no clock.
 */

import { shiftInstants } from "./ics"
import { localDay } from "./day-of"
import { REMINDER_WINDOW_HOURS } from "./automatic-reminders"
import { REMINDER_LABELS, type ReminderKey } from "./notification-settings"

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « 30 personnes confirmées, 2 demandes à traiter, 16 places encore libres. » Null without a place. */
export function placesSentence(p: { capacity: number; confirmed: number; requested: number; left: number }): string | null {
  if (p.capacity === 0) return null
  const parts = [plural(p.confirmed, "personne confirmée", "personnes confirmées")]
  if (p.requested > 0) parts.push(plural(p.requested, "demande à traiter", "demandes à traiter"))
  parts.push(p.left === 0 ? "plus aucune place libre" : plural(p.left, "place encore libre", "places encore libres"))
  return `${parts.join(", ")}.`
}

export type NextReminder = { key: ReminderKey; label: string; /** "YYYY-MM-DD" in the organisation's zone. */ day: string }

/**
 * The next automatic reminder the hourly cron will send, for the event's shifts still to come:
 * per calendar day, the first shift's start minus the reminder's window (REMINDER_WINDOW_HOURS),
 * the earliest one whose window has not closed yet. Only the reminders in `keys` (those on).
 * A day without anyone registered sends nothing: the sentence that uses this says « inscrits ».
 */
export function nextAutomaticReminder(
  shifts: { date: string; startTime: string; endTime: string }[],
  keys: ReminderKey[],
  now: Date,
  timeZone: string,
): NextReminder | null {
  const firstStart = new Map<string, number>()
  for (const s of shifts) {
    const start = shiftInstants(s, timeZone).start.getTime()
    const day = s.date.slice(0, 10)
    if (!firstStart.has(day) || start < firstStart.get(day)!) firstStart.set(day, start)
  }
  let best: { key: ReminderKey; at: number } | null = null
  for (const start of firstStart.values()) {
    for (const key of keys) {
      const { minHours, maxHours } = REMINDER_WINDOW_HOURS[key]
      const closes = start - minHours * 3_600_000
      if (closes <= now.getTime()) continue
      const at = Math.max(now.getTime(), start - ((minHours + maxHours) / 2) * 3_600_000)
      if (!best || at < best.at) best = { key, at }
    }
  }
  return best ? { key: best.key, label: REMINDER_LABELS[best.key].label, day: localDay(new Date(best.at), timeZone) } : null
}

/** « « Infos parking », le 3 octobre, à 25 personnes. » */
export function lastMessageSentence(m: { subject: string; createdAt: Date; recipientCount: number }, timeZone: string): string {
  const day = m.createdAt.toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long" })
  return `« ${m.subject} », le ${day}, à ${plural(m.recipientCount, "personne", "personnes")}.`
}
