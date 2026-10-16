// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { messageSchema, type Audience } from "./targeted-message"
import { localDateTimeToUtc } from "./time-zone"
import type { SCHEDULED_MESSAGE_STATUSES } from "./statuses"

/**
 * Scheduled targeted messages (#1019): a message of « Écrire aux bénévoles » sent on a chosen date
 * and time, in the organisation's time zone, instead of right away. Only the intent is stored; the
 * recipients are computed when it goes, like an immediate send. Pure: no Prisma, no clock (the
 * caller passes `now`), shared by the form and the routes.
 */

/** How far ahead a message can be scheduled. */
export const SCHEDULE_MAX_DAYS = 365
/** The outbox cron runs every 5 minutes: a scheduled message leaves within that delay. */
export const SCHEDULE_DELAY_MINUTES = 5
/** A row claimed longer ago than this was abandoned by a crashed run: picked up again. */
export const SCHEDULE_STALE_CLAIM_MS = 15 * 60 * 1000

export type ScheduledStatus = (typeof SCHEDULED_MESSAGE_STATUSES)[number]

export const scheduleSchema = messageSchema.omit({ dryRun: true }).extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date d'envoi est obligatoire."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "L'heure d'envoi est obligatoire."),
})
export type ScheduleInput = z.infer<typeof scheduleSchema>

/** Today's date (YYYY-MM-DD) and the time (HH:MM) in `timeZone` at `now`. */
export function localNow(now: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` }
}

/** The instant of a local date (YYYY-MM-DD) and time (HH:MM) in `timeZone`. */
export function scheduledInstant(date: string, time: string, timeZone: string): Date {
  return localDateTimeToUtc(new Date(`${date}T00:00:00Z`), time, timeZone)
}

export type ScheduleProblem = { field: "date" | "time"; message: string }

/**
 * What is wrong with a chosen date and time, or null. Missing values first, then a past time
 * (on the date when the day is gone, on the time when it is today), then too far ahead. The same
 * rule runs in the form and in the route.
 */
export function scheduleProblem(input: { date: string; time: string }, timeZone: string, now: Date): ScheduleProblem | null {
  const date = input.date.trim()
  const time = input.time.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) return { field: "date", message: "Indiquez la date d'envoi." }
  if (!/^\d{2}:\d{2}$/.test(time) || Number(time.slice(0, 2)) > 23 || Number(time.slice(3)) > 59) return { field: "time", message: "Indiquez l'heure d'envoi." }
  const today = localNow(now, timeZone)
  if (date < today.date) return { field: "date", message: "Cette date est passée : choisissez aujourd'hui ou un jour à venir." }
  const at = scheduledInstant(date, time, timeZone)
  if (at.getTime() <= now.getTime()) {
    return { field: "time", message: `Cette heure est passée : choisissez une heure après ${today.time} (heure de ${timeZone}).` }
  }
  if (at.getTime() > now.getTime() + SCHEDULE_MAX_DAYS * 24 * 3600 * 1000) {
    return { field: "date", message: `Programmez l'envoi au plus ${SCHEDULE_MAX_DAYS} jours à l'avance.` }
  }
  return null
}

/** « lundi 20 octobre à 18:00 », the year only when it isn't the current one. */
export function formatScheduledFor(at: Date, timeZone: string, now: Date): string {
  const year = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone, year: "numeric" }).format(d)
  const day = at.toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long", ...(year(at) !== year(now) ? { year: "numeric" } : {}) })
  const hour = at.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })
  return `${day} à ${hour}`
}

/**
 * Rows the dispatch picks (#1019): scheduled and due, or claimed by a run that crashed long ago.
 * Mirrored by the Prisma `where` of the dispatch; tested here.
 */
export function isDue(row: { status: string; scheduledFor: Date; claimedAt: Date | null }, now: Date): boolean {
  if (row.status === "scheduled") return row.scheduledFor.getTime() <= now.getTime()
  if (row.status === "sending") return !!row.claimedAt && row.claimedAt.getTime() < now.getTime() - SCHEDULE_STALE_CLAIM_MS
  return false
}

/**
 * Why a due message is not sent, or null to send it: the event archived, the chosen shift gone or
 * cancelled, nobody left in the audience. Never falls back to another audience.
 */
export function skipReason(f: { eventStatus: string; audience: Audience; shiftAvailable: boolean; recipients: number }): string | null {
  if (f.eventStatus === "archived") return "l'événement est archivé"
  if (f.audience.kind === "shift" && !f.shiftAvailable) return "le créneau choisi a été supprimé ou annulé"
  if (f.recipients === 0) return "personne à qui écrire dans cette sélection au moment de l'envoi"
  return null
}

/** The state line of a scheduled message in the list. */
export function scheduledStateLabel(row: { status: string; skipReason: string | null; cancelledAt: Date | null; cancelledByName: string | null }, fmt: (d: Date) => string): string {
  switch (row.status) {
    case "scheduled": return "Programmé, pas encore parti"
    case "sending": return "Envoi en cours"
    case "sent": return "Parti"
    case "cancelled": return `Annulé${row.cancelledAt ? ` le ${fmt(row.cancelledAt)}` : ""}${row.cancelledByName ? `, par ${row.cancelledByName}` : ""}`
    case "skipped": return `Non envoyé : ${row.skipReason ?? "raison inconnue"}`
    default: return row.status
  }
}
