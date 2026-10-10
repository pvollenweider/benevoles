// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { generateRecurrence, recurrenceProblem, type HolidayCalendar, type RecurrenceInput, type Weekday } from "./shift-recurrence"
import { civilDateSchema } from "./civil-date"

/**
 * Event duplication with explicit choices (#378, on top of #356). The organizer picks a title,
 * a new start date (every date moves by the same offset) and what follows: shifts, custom
 * pages, sector leaders, registration settings and messages. Registrations never follow. Pure:
 * the route reads the source, calls duplicatePlan and writes the plan.
 */

export const duplicateOptionsSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  /** "YYYY-MM-DD"; the source's own start date when absent. */
  startDate: civilDateSchema.optional(),
  copy: z.object({
    shifts: z.boolean().optional(),
    pages: z.boolean().optional(),
    leaders: z.boolean().optional(),
    settings: z.boolean().optional(),
  }).optional(),
})
export type DuplicateOptions = z.infer<typeof duplicateOptionsSchema>

export type CopyChoices = { shifts: boolean; pages: boolean; leaders: boolean; settings: boolean }
/** Everything but the sector leaders: they get an email with a link to the copy, so it's opt-in. */
export const DEFAULT_COPY: CopyChoices = { shifts: true, pages: true, leaders: false, settings: true }

export type DuplicableShift = {
  roleName: string
  label: string
  description: string | null
  date: Date
  startTime: string
  endTime: string
  capacity: number
  locationDetails: string | null
  latitude: number | null
  longitude: number | null
  contactName: string | null
  contactPhone: string | null
  instructions: string | null
  displayOrder: number
  internalNotes: string | null
  minAge: number | null
  waitlistEnabled: boolean
  requiresApproval: boolean
  colorKey: string | null
  maxPerVolunteer?: number | null
  reservedTags?: string[]
  /** Recurring permanence (#866) the shift came from: such shifts are regenerated, not copied. */
  recurrenceId?: string | null
}

/** A recurring permanence (#866) of the source event. */
export type DuplicableRecurrence = {
  id: string
  roleName: string
  label: string
  weekdays: number[]
  everyWeeks: number
  startTime: string
  endTime: string
  slotMinutes: number
  breakMinutes: number
  capacity: number
  fromDate: Date
  untilDate: Date
  holidays: string
}

export type DuplicableEvent = {
  title: string
  description: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  startDate: Date
  endDate: Date
  publicInstructions: string | null
  confirmationMessage: string | null
  reminderMessage: string | null
  remindersEnabled: boolean
  requirePhone: boolean
  accentColorKey: string | null
  /** Day-of contact (#560): copied with the settings, like the other messages. */
  dayContactName?: string | null
  dayContactPhone?: string | null
  showSchedule: unknown
  shifts: DuplicableShift[]
  pages: { slug: string; title: string; content: string; displayOrder: number }[]
  /** Active custom questions (#483); copied with the registration settings, never their answers. */
  questions?: { label: string; type: string; options: string[]; required: boolean; position: number }[]
  leaders: { roleName: string; name: string; email: string }[]
  recurrences?: DuplicableRecurrence[]
}

/** What a duplicated event copies from each shift (#356): every setting, never the identity, the status or the sign-ups. */
export function copiedShift(s: DuplicableShift) {
  return {
    roleName: s.roleName,
    label: s.label,
    description: s.description,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    status: "open" as const,
    locationDetails: s.locationDetails,
    latitude: s.latitude,
    longitude: s.longitude,
    contactName: s.contactName,
    contactPhone: s.contactPhone,
    instructions: s.instructions,
    displayOrder: s.displayOrder,
    internalNotes: s.internalNotes,
    minAge: s.minAge,
    waitlistEnabled: s.waitlistEnabled,
    requiresApproval: s.requiresApproval,
    colorKey: s.colorKey,
    maxPerVolunteer: s.maxPerVolunteer ?? null,
    reservedTags: s.reservedTags ?? [],
  }
}

const DAY = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/** Whole days between the source's first day and the new one; 0 without a new date. */
export function dayOffset(sourceStart: Date, newStart: string | undefined): number {
  if (!newStart) return 0
  return Math.round((Date.parse(`${newStart}T00:00:00Z`) - utcDay(sourceStart)) / DAY)
}

export function shiftDate(d: Date, days: number): Date {
  return days === 0 ? d : new Date(d.getTime() + days * DAY)
}

/** "YYYY-MM-DD" moved by `days`. */
export function shiftIsoDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}

type Show = { name: string; date: string; startTime: string; endTime: string }
const isShow = (s: unknown): s is Show => typeof s === "object" && s !== null && typeof (s as Show).date === "string"

export function resolveChoices(copy: DuplicateOptions["copy"]): CopyChoices {
  return { ...DEFAULT_COPY, ...Object.fromEntries(Object.entries(copy ?? {}).filter(([, v]) => v !== undefined)) }
}

/** Everything the route writes for the copy, and the counts the form shows beforehand. */
export function duplicatePlan(source: DuplicableEvent, options: DuplicateOptions) {
  const copy = resolveChoices(options.copy)
  const offsetDays = dayOffset(source.startDate, options.startDate)
  const shows = Array.isArray(source.showSchedule) ? source.showSchedule.filter(isShow) : []
  return {
    copy,
    offsetDays,
    event: {
      title: options.title ?? `${source.title} (copie)`,
      description: source.description,
      location: source.location,
      startDate: shiftDate(source.startDate, offsetDays),
      endDate: shiftDate(source.endDate, offsetDays),
      latitude: source.latitude,
      longitude: source.longitude,
      // A copy never opens registrations by accident (#463): closed, no schedule.
      registrationsOpen: false,
      registrationOpensAt: null,
      registrationClosesAt: null,
      publicInstructions: copy.settings ? source.publicInstructions : null,
      confirmationMessage: copy.settings ? source.confirmationMessage : null,
      reminderMessage: copy.settings ? source.reminderMessage : null,
      remindersEnabled: copy.settings ? source.remindersEnabled : true,
      requirePhone: copy.settings ? source.requirePhone : false,
      accentColorKey: copy.settings ? source.accentColorKey : null,
      dayContactName: copy.settings ? source.dayContactName ?? null : null,
      dayContactPhone: copy.settings ? source.dayContactPhone ?? null : null,
      showSchedule: copy.settings ? shows.map((s) => ({ ...s, date: shiftIsoDate(s.date, offsetDays) })) : [],
    },
    // A permanence's shifts are regenerated from its rule (below): moved by a number of days that
    // isn't a whole number of weeks, they would land on other weekdays and miss the new holidays.
    shifts: copy.shifts ? source.shifts.filter((s) => !isRecurring(s, source)).map((s) => ({ ...copiedShift(s), date: shiftDate(s.date, offsetDays) })) : [],
    recurrences: copy.shifts ? duplicatedRecurrences(source, offsetDays) : [],
    pages: copy.pages ? source.pages.map((p) => ({ slug: p.slug, title: p.title, content: p.content, displayOrder: p.displayOrder })) : [],
    questions: copy.settings ? (source.questions ?? []).map((q) => ({ label: q.label, type: q.type, options: q.options, required: q.required, position: q.position })) : [],
    leaders: copy.leaders ? source.leaders : [],
  }
}

export type DuplicateCounts = { shifts: number; pages: number; leaders: number; hasSettings: boolean }

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/** The lines of the summary shown before creating: what follows, what doesn't, and by how much dates move. */
export function duplicateSummary(counts: DuplicateCounts, copy: CopyChoices, offsetDays: number): string[] {
  const lines: string[] = []
  if (copy.shifts && counts.shifts > 0) lines.push(`${n(counts.shifts, "créneau copié", "créneaux copiés")}, rouverts et sans inscriptions.`)
  else lines.push("Aucun créneau : la copie démarre vide.")
  if (offsetDays !== 0) lines.push(`Toutes les dates décalées de ${offsetDays > 0 ? "+" : ""}${n(offsetDays, "jour", "jours")}.`)
  else lines.push("Mêmes dates que l'original.")
  if (copy.pages && counts.pages > 0) lines.push(n(counts.pages, "page personnalisée copiée.", "pages personnalisées copiées."))
  if (copy.leaders && counts.leaders > 0) lines.push(`${n(counts.leaders, "responsable de secteur repris", "responsables de secteur repris")} : chacun reçoit un email avec son lien pour la copie.`)
  lines.push(copy.settings ? "Messages et réglages d'inscription copiés." : "Messages et réglages d'inscription remis à zéro.")
  lines.push("Les inscriptions et les jalons ne sont jamais copiés. La copie est un brouillon.")
  return lines
}

const isRecurring = (s: DuplicableShift, source: DuplicableEvent) =>
  Boolean(s.recurrenceId && (source.recurrences ?? []).some((r) => r.id === s.recurrenceId))

/**
 * The permanences of a duplicated event (#866): each rule moved by the offset, inside the new
 * event, its shifts regenerated on the same weekdays with the holidays of the new period. Closures
 * belong to one year and are not copied. A rule left with no date is dropped. Settings of the
 * shifts (place, instructions, rules) come from the rule's first shift.
 */
export function duplicatedRecurrences(source: DuplicableEvent, offsetDays: number) {
  const eventStart = shiftIsoDate(source.startDate.toISOString().slice(0, 10), offsetDays)
  const eventEnd = shiftIsoDate(source.endDate.toISOString().slice(0, 10), offsetDays)
  const out: { rule: Omit<DuplicableRecurrence, "id"> & { closures: string[] }; shifts: (ReturnType<typeof copiedShift> & { date: Date })[] }[] = []
  for (const rule of source.recurrences ?? []) {
    const template = source.shifts.find((s) => s.recurrenceId === rule.id)
    if (!template) continue
    const from = [shiftIsoDate(rule.fromDate.toISOString().slice(0, 10), offsetDays), eventStart].sort()[1]
    const until = [shiftIsoDate(rule.untilDate.toISOString().slice(0, 10), offsetDays), eventEnd].sort()[0]
    const input: RecurrenceInput = {
      from, until, weekdays: rule.weekdays as Weekday[], everyWeeks: rule.everyWeeks === 2 ? 2 : 1,
      startTime: rule.startTime, endTime: rule.endTime, slotMinutes: rule.slotMinutes, breakMinutes: rule.breakMinutes,
      holidays: (["none", "FR", "CH"].includes(rule.holidays) ? rule.holidays : "none") as HolidayCalendar, closures: [],
    }
    if (recurrenceProblem(input, { start: eventStart, end: eventEnd })) continue
    out.push({
      rule: {
        roleName: rule.roleName, label: rule.label, weekdays: rule.weekdays, everyWeeks: rule.everyWeeks, startTime: rule.startTime, endTime: rule.endTime,
        slotMinutes: rule.slotMinutes, breakMinutes: rule.breakMinutes, capacity: rule.capacity, holidays: rule.holidays,
        fromDate: new Date(from), untilDate: new Date(until), closures: [],
      },
      shifts: generateRecurrence(input).shifts.map((slot) => ({
        ...copiedShift(template), date: new Date(slot.date), startTime: slot.startTime, endTime: slot.endTime, capacity: rule.capacity,
      })),
    })
  }
  return out
}
