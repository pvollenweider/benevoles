// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { addDays } from "./shift-series"
import { describeWeekdays, generateRecurrence, recurrenceProblem, timeRange, type HolidayCalendar, type Weekday } from "./shift-recurrence"
import { toMin, toMinEnd } from "./gantt-utils"

/**
 * Event templates (#395): a pre-filled draft (days, roles, shifts) the organizer then edits.
 * Nothing more than that: no template system, the list lives here.
 */

export type TemplateShift = {
  roleName: string
  label?: string
  /** Day of the event, 0 = the start date. */
  day: number
  startTime: string
  endTime: string
  capacity: number
  waitlistEnabled?: boolean
}

/** A recurring permanence of a template (#866): repeated over the whole event. */
export type TemplateRecurrence = {
  roleName: string
  label?: string
  weekdays: Weekday[]
  everyWeeks?: 1 | 2
  startTime: string
  endTime: string
  /** Shift length; the whole range (one shift a day) when absent. */
  slotMinutes?: number
  capacity: number
}

export type EventTemplate = {
  id: string
  name: string
  description: string
  defaultTitle: string
  /** Number of days, start date included. */
  days: number
  shifts: TemplateShift[]
  /** Recurring permanences (#866): a season-like template has these and no fixed shifts. */
  recurrences?: TemplateRecurrence[]
}

/** A recurring template runs this long by default; the organizer extends the event afterwards. */
export const RECURRING_TEMPLATE_DAYS = 91

const span = (roleName: string, day: number, slots: [string, string][], capacity: number, label?: string): TemplateShift[] =>
  slots.map(([startTime, endTime]) => ({ roleName, label, day, startTime, endTime, capacity }))

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "festival",
    name: "Festival sur plusieurs jours",
    description: "Trois soirées : billetterie, buvette et accueil chaque soir, montage le premier jour, démontage le dernier.",
    defaultTitle: "Festival",
    days: 3,
    shifts: [
      ...span("Montage", 0, [["09:00", "13:00"], ["13:00", "17:00"]], 6),
      ...[0, 1, 2].flatMap((day) => [
        ...span("Billetterie", day, [["17:00", "21:00"], ["21:00", "01:00"]], 3),
        ...span("Buvette", day, [["18:00", "22:00"], ["22:00", "02:00"]], 4),
        ...span("Accueil & info", day, [["17:00", "21:00"]], 2),
      ]),
      ...span("Démontage", 2, [["23:00", "02:00"]], 6),
    ],
  },
  {
    id: "buvette",
    name: "Buvette",
    description: "Une journée : mise en place, bar et caisse par créneaux de trois heures, rangement.",
    defaultTitle: "Buvette",
    days: 1,
    shifts: [
      ...span("Mise en place", 0, [["08:00", "10:00"]], 3),
      ...span("Bar", 0, [["10:00", "13:00"], ["13:00", "16:00"], ["16:00", "19:00"], ["19:00", "22:00"]], 3),
      ...span("Caisse", 0, [["10:00", "13:00"], ["13:00", "16:00"], ["16:00", "19:00"], ["19:00", "22:00"]], 1),
      ...span("Rangement", 0, [["22:00", "23:30"]], 3),
    ],
  },
  {
    id: "sport",
    name: "Manifestation sportive",
    description: "Une matinée de course : dossards, signaleurs sur le parcours, ravitaillement, arrivée et rangement.",
    defaultTitle: "Course populaire",
    days: 1,
    shifts: [
      ...span("Inscriptions & dossards", 0, [["07:00", "10:00"]], 4),
      ...span("Signaleurs de parcours", 0, [["08:30", "12:30"]], 8),
      ...span("Ravitaillement", 0, [["09:00", "13:00"]], 6),
      ...span("Arrivée & résultats", 0, [["10:00", "14:00"]], 3),
      ...span("Rangement", 0, [["13:00", "15:00"]], 4),
    ],
  },
  {
    id: "fete",
    name: "Fête de village",
    description: "Deux jours : montage, buvette et grillades le samedi soir, buvette et animation le dimanche, démontage.",
    defaultTitle: "Fête de village",
    days: 2,
    shifts: [
      ...span("Montage", 0, [["09:00", "12:00"]], 6),
      ...span("Buvette", 0, [["17:00", "20:00"], ["20:00", "23:00"], ["23:00", "02:00"]], 4),
      ...span("Grillades", 0, [["18:00", "22:00"]], 3),
      ...span("Buvette", 1, [["11:00", "14:00"], ["14:00", "17:00"], ["17:00", "20:00"]], 4),
      ...span("Animation enfants", 1, [["14:00", "17:00"]], 3),
      ...span("Démontage", 1, [["20:00", "22:00"]], 6),
    ],
  },
  {
    id: "chantier",
    name: "Montage, exploitation, démontage",
    description: "Trois jours : une équipe de montage, l'exploitation par créneaux de quatre heures, une équipe de démontage.",
    defaultTitle: "Événement",
    days: 3,
    shifts: [
      ...span("Montage", 0, [["08:00", "12:00"], ["13:00", "17:00"]], 8),
      ...span("Exploitation", 1, [["09:00", "13:00"], ["13:00", "17:00"], ["17:00", "21:00"]], 4),
      ...span("Démontage", 2, [["08:00", "12:00"], ["13:00", "16:00"]], 8),
    ],
  },
]

/** Regular activities (#866): a quarter of weekly permanences the organizer adjusts. */
EVENT_TEMPLATES.push(
  {
    id: "epicerie",
    name: "Épicerie participative",
    description: "Une épicerie tenue par ses membres : caisse et accueil le mardi et le jeudi soir et le samedi matin, mise en rayon le samedi, réception des livraisons le mercredi.",
    defaultTitle: "Épicerie participative",
    days: RECURRING_TEMPLATE_DAYS,
    shifts: [],
    recurrences: [
      { roleName: "Caisse et accueil", weekdays: [2, 4], startTime: "17:00", endTime: "19:30", capacity: 2 },
      { roleName: "Caisse et accueil", weekdays: [6], startTime: "09:00", endTime: "12:00", capacity: 2 },
      { roleName: "Mise en rayon", weekdays: [6], startTime: "08:00", endTime: "09:00", capacity: 2 },
      { roleName: "Réception des livraisons", weekdays: [3], startTime: "18:00", endTime: "19:30", capacity: 2 },
    ],
  },
  {
    id: "distribution",
    name: "Distribution alimentaire",
    description: "Chaque semaine : le tri des denrées le vendredi après-midi, le transport et la distribution le samedi matin.",
    defaultTitle: "Distribution alimentaire",
    days: RECURRING_TEMPLATE_DAYS,
    shifts: [],
    recurrences: [
      { roleName: "Tri des denrées", weekdays: [5], startTime: "14:00", endTime: "17:00", capacity: 4 },
      { roleName: "Transport", label: "Chauffeur", weekdays: [6], startTime: "08:00", endTime: "09:00", capacity: 1 },
      { roleName: "Distribution", weekdays: [6], startTime: "09:00", endTime: "12:00", capacity: 6 },
    ],
  },
  {
    id: "permanence",
    name: "Permanence d'accueil",
    description: "Un accueil ouvert le lundi, le mercredi et le vendredi après-midi, deux personnes à chaque fois.",
    defaultTitle: "Permanence d'accueil",
    days: RECURRING_TEMPLATE_DAYS,
    shifts: [],
    recurrences: [{ roleName: "Accueil", weekdays: [1, 3, 5], startTime: "14:00", endTime: "17:00", capacity: 2 }],
  },
  {
    id: "repair",
    name: "Repair café",
    description: "Un samedi sur deux : l'accueil des visiteurs et les réparateurs, de 14 h à 17 h.",
    defaultTitle: "Repair café",
    days: RECURRING_TEMPLATE_DAYS,
    shifts: [],
    recurrences: [
      { roleName: "Accueil", weekdays: [6], everyWeeks: 2, startTime: "13:30", endTime: "17:30", capacity: 1 },
      { roleName: "Réparation", weekdays: [6], everyWeeks: 2, startTime: "14:00", endTime: "17:00", capacity: 4 },
    ],
  },
)

export function findTemplate(id: string): EventTemplate | undefined {
  return EVENT_TEMPLATES.find((t) => t.id === id)
}

type TemplateShiftRow = { roleName: string; label: string; date: string; startTime: string; endTime: string; capacity: number; displayOrder: number; waitlistEnabled: boolean }

export type TemplateEvent = {
  title: string
  startDate: string
  endDate: string
  shifts: TemplateShiftRow[]
  /** Recurring permanences (#866): each rule with the shifts it gives. */
  recurrences: { rule: TemplateRuleRow; shifts: TemplateShiftRow[] }[]
}

type TemplateRuleRow = {
  roleName: string; label: string; weekdays: number[]; everyWeeks: number; startTime: string; endTime: string
  slotMinutes: number; capacity: number; fromDate: string; untilDate: string; holidays: HolidayCalendar
}

const wholeRange = (r: TemplateRecurrence) => toMinEnd(r.endTime, r.startTime) - toMin(r.startTime)

/** The draft to create from a template: dates from the start date, roles ordered as listed. */
export function templateToEvent(template: EventTemplate, input: { title: string; startDate: string }, holidays: HolidayCalendar = "none"): TemplateEvent {
  const roleOrder: string[] = []
  for (const s of [...template.shifts, ...(template.recurrences ?? [])]) if (!roleOrder.includes(s.roleName)) roleOrder.push(s.roleName)
  const endDate = addDays(input.startDate, template.days - 1)
  return {
    title: input.title.trim() || template.defaultTitle,
    startDate: input.startDate,
    endDate,
    recurrences: (template.recurrences ?? []).flatMap((r) => {
      const input2 = {
        from: input.startDate, until: endDate, weekdays: r.weekdays, everyWeeks: r.everyWeeks ?? 1, startTime: r.startTime, endTime: r.endTime,
        slotMinutes: r.slotMinutes ?? wholeRange(r), holidays, closures: [] as string[],
      }
      if (recurrenceProblem(input2)) return []
      const label = r.label ?? r.roleName
      return [{
        rule: { roleName: r.roleName, label, weekdays: r.weekdays, everyWeeks: input2.everyWeeks, startTime: r.startTime, endTime: r.endTime, slotMinutes: input2.slotMinutes, capacity: r.capacity, fromDate: input.startDate, untilDate: endDate, holidays },
        shifts: generateRecurrence(input2).shifts.map((slot) => ({
          roleName: r.roleName, label, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, capacity: r.capacity,
          displayOrder: roleOrder.indexOf(r.roleName) * 100, waitlistEnabled: false,
        })),
      }]
    }),
    shifts: template.shifts.map((s) => ({
      roleName: s.roleName,
      label: s.label ?? s.roleName,
      date: addDays(input.startDate, s.day),
      startTime: s.startTime,
      endTime: s.endTime,
      capacity: s.capacity,
      displayOrder: roleOrder.indexOf(s.roleName) * 100,
      waitlistEnabled: s.waitlistEnabled ?? false,
    })),
  }
}

/** « Caisse et accueil : chaque mardi et jeudi, de 17:00 à 19:30, 2 personnes » for a recurring template (#866). */
export function templateRhythm(template: EventTemplate): string[] {
  return (template.recurrences ?? []).map((r) => `${r.label ?? r.roleName} : ${describeWeekdays(r.weekdays, r.everyWeeks ?? 1)}, ${timeRange(r.startTime, r.endTime)}, ${r.capacity} personne${r.capacity > 1 ? "s" : ""}`)
}

/** Shifts a template creates; for a recurring one, from its start date (holidays not counted). */
export function templateShiftCount(template: EventTemplate, startDate?: string): number {
  if (!template.recurrences?.length) return template.shifts.length
  if (!startDate) return 0
  return templateToEvent(template, { title: "", startDate }).recurrences.reduce((n, r) => n + r.shifts.length, 0)
}

/** « Buvette : 4 créneaux, 3 personnes » lines for the preview, roles in order. */
export function templateSummary(template: EventTemplate): { roleName: string; shiftCount: number; capacity: number }[] {
  const out: { roleName: string; shiftCount: number; capacity: number }[] = []
  for (const s of template.shifts) {
    const row = out.find((r) => r.roleName === s.roleName)
    if (row) { row.shiftCount += 1; row.capacity += s.capacity }
    else out.push({ roleName: s.roleName, shiftCount: 1, capacity: s.capacity })
  }
  return out
}
