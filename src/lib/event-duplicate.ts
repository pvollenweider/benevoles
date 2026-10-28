// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { generateRecurrence, recurrenceProblem, type HolidayCalendar, type RecurrenceInput, type Weekday } from "./shift-recurrence"
import { civilDateSchema } from "./civil-date"
import { duplicatedQuestionRole } from "./question-role"
import { duplicatedParent } from "./question-follow-up"
import { duplicatedScope } from "./question-scope"
import { leadersForCopy } from "./leader-postes"
import { buildPolicy, parseWorkloadPolicy, policyValues, type WorkloadPolicy } from "./workload-policy"

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
  /** Role assigned by the organisation only (#1145), copied with the role's other settings. */
  assignedOnly?: boolean
  /** Recurring permanence (#866) the shift came from: such shifts are regenerated, not copied. */
  recurrenceId?: string | null
  /** Sector of the poste (#1147): remapped to the copy of the sector, or none. */
  sectorId?: string | null
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
  questions?: { id?: string; label: string; type: string; options: string[]; required: boolean; position: number; roleName?: string | null; minValue?: number | null; maxValue?: number | null; parentId?: string | null; showIfValues?: string[]; displayScope?: string | null; displayRoleNames?: string[] | null }[]
  /** A poste (`roleName`) or, since #1169, a sector (`sectorId`) leader. */
  leaders: { roleName: string | null; sectorId?: string | null; name: string; email: string }[]
  /** Postes whose every shift is cancelled (#1010): their leaders don't follow. */
  deletedPostes?: string[]
  recurrences?: DuplicableRecurrence[]
  /** Sectors (#1147): the source's option, its adoption and its sectors (archived ones included, left out of the copy). */
  sectorsEnabled?: boolean
  sectorsAdoptedAt?: Date | null
  sectors?: { id: string; name: string; displayOrder: number; archivedAt: Date | null }[]
  /** Whether the organisation can adopt sectors now (canAdoptBeta): needed to copy the option of a source that has not adopted them. */
  sectorsGate?: boolean
  /** The option a new event of the organisation starts with (default and gate), when the settings are not copied. */
  newEventSectors?: boolean
  /** Shift swaps (#1174): the source's options, whether the organisation can adopt them now, and a new event's value. */
  shiftSwapsEnabled?: boolean
  shiftSwapsApproval?: boolean
  swapsGate?: boolean
  newEventSwaps?: boolean
}

/**
 * The workload protection of a copy (#1171): with the settings, the source's values, only while the
 * capability can be adopted (a copy is a new adoption), the zone snapshotted again now; else the
 * organisation's rule for a new event. A source whose stored policy does not parse gives nothing.
 */
export function duplicatedWorkload(
  source: { workloadProtectionEnabled?: boolean; workloadPolicy?: unknown },
  copySettings: boolean,
  opts: { gate: boolean; newEvent: { workloadProtectionEnabled: boolean; workloadPolicy?: WorkloadPolicy }; timeZone: string },
): { workloadProtectionEnabled: boolean; workloadPolicy?: WorkloadPolicy } {
  if (!copySettings) return opts.newEvent
  const parsed = parseWorkloadPolicy(source.workloadPolicy)
  if (!parsed.ok || !opts.gate) return { workloadProtectionEnabled: false }
  return { workloadProtectionEnabled: !!source.workloadProtectionEnabled, workloadPolicy: buildPolicy(policyValues(parsed.policy), opts.timeZone) }
}

/**
 * The shift swap options of a copy (#1174): with the settings, the source's choice, only while the
 * capability can be adopted (a copy is a new adoption); else the organisation's rule for a new
 * event. Never a request, an agreement or an approval: those belong to the source's registrations.
 */
export function duplicatedSwaps(source: Pick<DuplicableEvent, "shiftSwapsEnabled" | "shiftSwapsApproval" | "swapsGate" | "newEventSwaps">, copySettings: boolean) {
  return {
    shiftSwapsEnabled: copySettings ? !!source.shiftSwapsEnabled && !!source.swapsGate : !!source.newEventSwaps,
    shiftSwapsApproval: copySettings ? !!source.shiftSwapsApproval : false,
  }
}

/**
 * The sectors of a copy (#1147): an event that adopted sectors gives a copy that adopted them, with
 * its active sectors (fresh ids, same names and order) and each poste in the copy of its sector,
 * as the issue asks (« copies sectors, the poste → sector links and the adoption »). A source that
 * has not adopted them gives no sector; its option follows the settings, and only while the
 * capability can be adopted (a new adoption), else the organisation's rule for a new event.
 */
export function duplicatedSectors(source: DuplicableEvent, copySettings: boolean, newId: () => string) {
  const adopted = !!source.sectorsAdoptedAt
  const sectors = adopted
    ? (source.sectors ?? []).filter((s) => !s.archivedAt).sort((a, b) => a.displayOrder - b.displayOrder).map((s, i) => ({ from: s.id, id: newId(), name: s.name, displayOrder: i }))
    : []
  const ids = new Map(sectors.map((s) => [s.from, s.id]))
  return {
    sectors: sectors.map(({ id, name, displayOrder }) => ({ id, name, displayOrder })),
    sectorOf: (sectorId: string | null | undefined) => (sectorId ? ids.get(sectorId) ?? null : null),
    sectorsEnabled: adopted ? true : copySettings ? !!source.sectorsEnabled && !!source.sectorsGate : !!source.newEventSectors,
    sectorsAdoptedAt: adopted ? new Date() : null,
  }
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
    assignedOnly: s.assignedOnly ?? false,
    sectorId: s.sectorId ?? null,
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
  const shiftsCopied = copy.shifts ? source.shifts.filter((s) => !isRecurring(s, source)).map((s) => ({ ...copiedShift(s), date: shiftDate(s.date, offsetDays) })) : []
  const sectorPlan = duplicatedSectors(source, copy.settings, newId)
  const inSector = <S extends { sectorId: string | null }>(s: S): S => ({ ...s, sectorId: sectorPlan.sectorOf(s.sectorId) })
  const shifts = shiftsCopied.map(inSector)
  const recurrences = (copy.shifts ? duplicatedRecurrences(source, offsetDays) : []).map((r) => ({ ...r, shifts: r.shifts.map(inSector) }))
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
      sectorsEnabled: sectorPlan.sectorsEnabled,
      sectorsAdoptedAt: sectorPlan.sectorsAdoptedAt,
      ...duplicatedSwaps(source, !!copy.settings),
    },
    sectors: sectorPlan.sectors,
    shifts,
    recurrences,
    pages: copy.pages ? source.pages.map((p) => ({ slug: p.slug, title: p.title, content: p.content, displayOrder: p.displayOrder })) : [],
    questions: copy.settings ? duplicatedQuestions(source.questions ?? [], copiedRoles, newId) : [],
    // Never the leaders of a deleted poste (#1010): they would get a link to a poste the copy
    // doesn't have. A poste typed before its shifts exist still follows. A sector leader (#1169)
    // follows in the copy of their sector; never one of an archived sector, which is not copied.
    leaders: copy.leaders
      ? leadersForCopy(source.leaders, source.deletedPostes ?? [], (source.sectors ?? []).filter((s) => !s.archivedAt).map((s) => s.id)).taken
        .flatMap((l) => {
          if (!l.sectorId) return [{ roleName: l.roleName, name: l.name, email: l.email }]
          const sectorId = sectorPlan.sectorOf(l.sectorId)
          return sectorId ? [{ roleName: null, sectorId, name: l.name, email: l.email }] : []
        })
      : [],
  }
}

/**
 * The copied questions (#483), with their poste when the copy has it (#984), their scope (#1140) and each follow-up
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
      // Who is asked (#1140), postes by name, even those the copy has no shifts for yet.
      ...duplicatedScope(q),
    }))
}

/**
 * `leaders` counts the leaders a copy takes; `leadersLeftOut` those it doesn't: of a poste whose every
 * shift is cancelled (#1010) or, `leftOutSectors` of them, of an archived sector (#1169).
 */
export type DuplicateCounts = { shifts: number; pages: number; leaders: number; leadersLeftOut?: number; leftOutSectors?: number; hasSettings: boolean }

/** Why leaders are left out: the wording of #1010 unless some lead an archived sector (#1169). */
const leftOutReason = (c: DuplicateCounts, many: boolean) => (c.leftOutSectors ?? 0) > 0
  ? (many ? "de postes ou de secteurs qui ne sont plus actifs" : "d'un poste ou d'un secteur qui n'est plus actif")
  : (many ? "de postes aux créneaux tous annulés" : "d'un poste aux créneaux tous annulés")

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
  else if (copy.leaders && (counts.leadersLeftOut ?? 0) > 0) lines.push((counts.leftOutSectors ?? 0) > 0 ? "Aucun responsable repris : leur poste ou leur secteur n'est plus actif." : "Aucun responsable de secteur repris : tous les créneaux de leur poste sont annulés.")
  lines.push(copy.settings ? "Messages et paramètres d'inscription copiés." : "Messages et paramètres d'inscription remis à zéro.")
  lines.push("Les inscriptions et les jalons ne sont jamais copiés. La copie est un brouillon.")
  return lines
}

/** The hint of the « Les responsables de secteur » choice: who follows, and who doesn't (#1010). */
export function leadersChoiceHint(c: DuplicateCounts): string {
  const out = c.leadersLeftOut ?? 0
  const leftOut = out === 0 ? "" : out > 1 ? `${out} autres, ${leftOutReason(c, true)}, ne sont pas repris.` : `1 autre, ${leftOutReason(c, false)}, n'est pas repris.`
  if (c.leaders > 0) return `${n(c.leaders, "responsable", "responsables")} : chacun reçoit tout de suite un email avec son lien pour la copie.${leftOut ? ` ${leftOut}` : ""}`
  if (out > 0) return `Aucun responsable repris : ${out > 1 ? `${out} responsables, ${leftOutReason(c, true)}, ne sont pas repris.` : `1 responsable, ${leftOutReason(c, false)}, n'est pas repris.`}`
  return "Aucun responsable sur l'événement d'origine."
}

/**
 * What a screen reader hears when a choice or the date changes: the shifts and dates lines, and
 * the leaders' line when there is one, so checking them is heard with who follows (#1010).
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
