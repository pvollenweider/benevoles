// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { generateRecurrence, recurrenceProblem, type HolidayCalendar, type RecurrenceInput, type Weekday } from "./shift-recurrence"
import { civilDateSchema } from "./civil-date"
import { duplicatedQuestionRole } from "./question-role"
import { duplicatedParent } from "./question-follow-up"
import { leadersOfPostes } from "./leader-postes"

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
  /** Minimum of people (#949); null = the same as capacity. */
  minVolunteers?: number | null
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
  /** Role cumulable with another shift (#986), copied with the role's other settings. */
  overlapAllowed?: boolean
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
  /** Shift roster between volunteers (#1068): the setting is copied with the settings, never anyone's choice. */
  shiftRosterEnabled?: boolean
  /** The organisation's default for new events (#1068): the copy's value when the settings are not copied. */
  organizationRosterDefault?: boolean
  accentColorKey: string | null
  /** Day-of contact (#560): copied with the settings, like the other messages. */
  dayContactName?: string | null
  dayContactPhone?: string | null
  /** Volunteer self-cancellation deadline (#946): copied with the settings. */
  cancelDeadlineDays?: number | null
  cancelDeadlineHours?: number | null
  showSchedule: unknown
  shifts: DuplicableShift[]
  pages: { slug: string; title: string; content: string; displayOrder: number }[]
  /** Active custom questions (#483); copied with the registration settings, never their answers. */
  questions?: { id?: string; label: string; type: string; options: string[]; required: boolean; position: number; roleName?: string | null; minValue?: number | null; maxValue?: number | null; parentId?: string | null; showIfValues?: string[] }[]
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
    minVolunteers: s.minVolunteers ?? null,
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
    overlapAllowed: s.overlapAllowed ?? false,
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
/**
 * `newId` gives each copied question its id beforehand, so that a follow-up (#1016) points to the
 * copy of its parent in the same insert.
 */
export function duplicatePlan(source: DuplicableEvent, options: DuplicateOptions, newId: () => string = () => globalThis.crypto.randomUUID()) {
  const copy = resolveChoices(options.copy)
  const offsetDays = dayOffset(source.startDate, options.startDate)
  const shows = Array.isArray(source.showSchedule) ? source.showSchedule.filter(isShow) : []
  // A permanence's shifts are regenerated from its rule (below): moved by a number of days that
  // isn't a whole number of weeks, they would land on other weekdays and miss the new holidays.
  const shifts = copy.shifts ? source.shifts.filter((s) => !isRecurring(s, source)).map((s) => ({ ...copiedShift(s), date: shiftDate(s.date, offsetDays) })) : []
  const recurrences = copy.shifts ? duplicatedRecurrences(source, offsetDays) : []
  // A question's poste (#984, part 3) follows when the copy has that poste, by the same name.
  const copiedRoles = new Set([...shifts.map((s) => s.roleName), ...recurrences.flatMap((r) => r.shifts.map((s) => s.roleName))])
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
      shiftRosterEnabled: copy.settings ? source.shiftRosterEnabled ?? false : source.organizationRosterDefault ?? false,
      accentColorKey: copy.settings ? source.accentColorKey : null,
      dayContactName: copy.settings ? source.dayContactName ?? null : null,
      dayContactPhone: copy.settings ? source.dayContactPhone ?? null : null,
      cancelDeadlineDays: copy.settings ? source.cancelDeadlineDays ?? null : null,
      cancelDeadlineHours: copy.settings ? source.cancelDeadlineHours ?? null : null,
      showSchedule: copy.settings ? shows.map((s) => ({ ...s, date: shiftIsoDate(s.date, offsetDays) })) : [],
    },
    shifts,
    recurrences,
    pages: copy.pages ? source.pages.map((p) => ({ slug: p.slug, title: p.title, content: p.content, displayOrder: p.displayOrder })) : [],
    questions: copy.settings ? duplicatedQuestions(source.questions ?? [], copiedRoles, newId) : [],
    // Only the leaders of a poste the copy has (#1010): one of a deleted poste would get a link to
    // nothing, and so would every leader of a copy without its shifts.
    leaders: copy.leaders ? leadersOfPostes(source.leaders, copiedRoles) : [],
  }
}

/**
 * The copied questions (#483), with their poste when the copy has it (#984) and each follow-up
 * (#1016) pointing to the copy of its parent; a follow-up whose parent is not copied is left out,
 * as it would be asked to everyone without the question it depends on.
 */
function duplicatedQuestions(questions: NonNullable<DuplicableEvent["questions"]>, copiedRoles: Set<string>, newId: () => string) {
  const ids = new Map(questions.filter((q) => q.id).map((q) => [q.id!, newId()]))
  return questions
    .filter((q) => !q.parentId || ids.has(q.parentId))
    .map((q) => ({
      id: q.id ? ids.get(q.id)! : newId(),
      label: q.label, type: q.type, options: q.options, required: q.required, position: q.position,
      minValue: q.minValue ?? null, maxValue: q.maxValue ?? null,
      roleName: duplicatedQuestionRole(q.roleName, copiedRoles),
      parentId: duplicatedParent(q.parentId, ids),
      showIfValues: q.parentId ? (q.showIfValues ?? []) : [],
    }))
}

/**
 * `leaders` counts the leaders of a poste with a live shift, the ones a copy with its shifts takes;
 * `leadersLeftOut` the others, of a poste without live shift (#1010).
 */
export type DuplicateCounts = { shifts: number; pages: number; leaders: number; leadersLeftOut?: number; hasSettings: boolean }

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/** The lines of the summary shown before creating: what follows, what doesn't, and by how much dates move. */
export function duplicateSummary(counts: DuplicateCounts, copy: CopyChoices, offsetDays: number): string[] {
  const lines: string[] = []
  if (copy.shifts && counts.shifts > 0) lines.push(`${n(counts.shifts, "créneau copié", "créneaux copiés")}, rouverts et sans inscriptions.`)
  else lines.push("Aucun créneau : la copie démarre vide.")
  if (offsetDays !== 0) lines.push(`Toutes les dates décalées de ${offsetDays > 0 ? "+" : ""}${n(offsetDays, "jour", "jours")}.`)
  else lines.push("Mêmes dates que l'original.")
  if (copy.pages && counts.pages > 0) lines.push(n(counts.pages, "page personnalisée copiée.", "pages personnalisées copiées."))
  if (copy.leaders && counts.leaders > 0) {
    lines.push(copy.shifts
      ? `${n(counts.leaders, "responsable de secteur repris", "responsables de secteur repris")} : chacun reçoit un email avec son lien pour la copie.`
      : "Sans les créneaux, aucun responsable de secteur n'est repris.")
  } else if (copy.leaders && (counts.leadersLeftOut ?? 0) > 0) {
    lines.push("Aucun responsable de secteur repris : leur poste n'a aucun créneau actif.")
  }
  lines.push(copy.settings ? "Messages et réglages d'inscription copiés." : "Messages et réglages d'inscription remis à zéro.")
  lines.push("Les inscriptions et les jalons ne sont jamais copiés. La copie est un brouillon.")
  return lines
}

/** The hint of the « Les responsables de secteur » choice: who follows, and who doesn't (#1010). */
export function leadersChoiceHint(c: DuplicateCounts): string {
  const out = c.leadersLeftOut ?? 0
  const leftOut = out === 0 ? "" : out > 1 ? `${out} autres, de postes sans créneau actif, ne sont pas repris.` : "1 autre, d'un poste sans créneau actif, n'est pas repris."
  if (c.leaders > 0) return `${n(c.leaders, "responsable", "responsables")} : chacun reçoit tout de suite un email avec son lien pour la copie.${leftOut ? ` ${leftOut}` : ""}`
  if (out > 0) return `Aucun responsable repris : ${out > 1 ? `${out} responsables, de postes sans créneau actif, ne sont pas repris.` : "1 responsable, d'un poste sans créneau actif, n'est pas repris."}`
  return "Aucun responsable sur l'événement d'origine."
}

/**
 * What a screen reader hears when a choice or the date changes: the shifts and dates lines, and
 * the leaders' line when there is one, since unchecking the shifts changes it (#1010).
 */
export function summaryAnnouncement(lines: string[]): string {
  return `Résumé mis à jour : ${[...lines.slice(0, 2), ...lines.slice(2).filter((l) => l.includes("responsable"))].join(" ")}`
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
        // The template's minimum (#949) only if it fits the rule's places, which these shifts take.
        minVolunteers: template.minVolunteers != null && template.minVolunteers <= rule.capacity ? template.minVolunteers : null,
      })),
    })
  }
  return out
}
