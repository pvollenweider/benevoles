// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { addDays } from "./shift-series"

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

export type EventTemplate = {
  id: string
  name: string
  description: string
  defaultTitle: string
  /** Number of days, start date included. */
  days: number
  shifts: TemplateShift[]
}

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

export function findTemplate(id: string): EventTemplate | undefined {
  return EVENT_TEMPLATES.find((t) => t.id === id)
}

export type TemplateEvent = {
  title: string
  startDate: string
  endDate: string
  shifts: { roleName: string; label: string; date: string; startTime: string; endTime: string; capacity: number; displayOrder: number; waitlistEnabled: boolean }[]
}

/** The draft to create from a template: dates from the start date, roles ordered as listed. */
export function templateToEvent(template: EventTemplate, input: { title: string; startDate: string }): TemplateEvent {
  const roleOrder: string[] = []
  for (const s of template.shifts) if (!roleOrder.includes(s.roleName)) roleOrder.push(s.roleName)
  return {
    title: input.title.trim() || template.defaultTitle,
    startDate: input.startDate,
    endDate: addDays(input.startDate, template.days - 1),
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
