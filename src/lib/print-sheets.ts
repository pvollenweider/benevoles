// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { printLogoHtml, type OrgLogo } from "./org-logo"
import { emergencyNoteFor, readBeforePages, shiftInfoLines, shiftInfoText, type ShiftInfo, type ShiftInfoLine } from "./shift-info"
import { buildDayParts, ganttColumnWidths, type ShiftRow } from "./pdf-export-gantt"
import { clockTime, normalizeName, personName, toMin, toMinEnd } from "./gantt-utils"
import { dayAxis, dayBands, shouldSplitDay, type DayBand } from "./day-sheet-bands"
import { conditionLine, scopeLine, confirmedLine, MULTIPLE_NOTE, numberNote, rowLabel, waitingLine, type AnswerSummary } from "./question-answer-summary"
import { effectiveMinimum, placesInWords, shiftStaffingState, staffingStateText } from "./staffing"
import { PRINT_BUTTON_SCRIPT_TAG } from "./inline-scripts"

/**
 * Printable sheets (#400): paper still matters on site. Six views of one event, each a plain
 * HTML page designed for black-and-white printing: schedule per day, schedule per role, individual
 * schedule per volunteer, attendance sheet, list with phone numbers, summary of the answers to the
 * custom questions (#686). The two schedules reuse the Gantt of the full export (the product's
 * signature), restyled in monochrome; the role sheet only prints it when it adds information
 * (#1444), and the individual sheet shows contacts once then a table per day. Pure: the route only
 * loads the data and calls renderSheet.
 */

export const SHEET_VIEWS = [
  { id: "day", name: "Planning par jour", description: "Pour chaque jour, la frise des postes avec les prénoms dans les créneaux, puis le détail avec les places libres.", audience: "volunteers" },
  { id: "role", name: "Planning par poste", description: "Une page par poste : ses créneaux, ses bénévoles, son responsable. À donner à chaque responsable.", audience: "volunteers" },
  { id: "individual", name: "Planning individuel", description: "Une page par bénévole : ses contacts, puis ses créneaux de chaque jour avec ses coéquipiers. À remettre à l'arrivée.", audience: "volunteers" },
  { id: "attendance", name: "Feuille de présence", description: "Par créneau, une case à cocher par bénévole et des lignes vides pour les arrivées imprévues.", audience: "organizers" },
  { id: "phones", name: "Liste avec téléphones", description: "Tous les bénévoles par ordre alphabétique, une colonne par jour, avec téléphone, email et créneaux.", audience: "organizers" },
  { id: "answers", name: "Synthèse des réponses", description: "Par question posée aux bénévoles, le nombre de réponses des confirmés et des personnes en attente, sans nom ni coordonnées. Pour passer commande (t-shirts, repas).", audience: "organizers" },
] as const

export type SheetView = (typeof SHEET_VIEWS)[number]["id"]

/** The day-sheet split rule (#1431), also available from here for callers of the sheet renderer. */
export { shouldSplitDay } from "./day-sheet-bands"

export function isSheetView(v: string): v is SheetView {
  return SHEET_VIEWS.some((s) => s.id === v)
}

export type SheetVolunteer = { /** Volunteer id: the identity across shifts (two homonyms without email stay two people). */ id?: string; firstName: string; lastName: string; email: string | null; phone: string | null; comment?: string | null; checkedIn?: boolean }
export type SheetShift = ShiftInfo & {
  id: string
  roleName: string
  label: string
  /** "YYYY-MM-DD" */
  date: string
  startTime: string
  endTime: string
  capacity: number
  /** Minimum of people (#949); null or absent = the same as capacity. */
  minVolunteers?: number | null
  displayOrder?: number
  registrations: SheetVolunteer[]
}
export type SheetData = {
  eventTitle: string
  organizationName: string
  /** The organization's logo (#300), beside the title; its name stays written in the header. */
  logo?: OrgLogo | null
  /** Already formatted, in the organization's time zone. */
  printedAt: string
  shifts: SheetShift[]
  /** Poste leaders (a sector leader, roleName null, is not listed on a poste's sheet in #1169). */
  leaders: { roleName: string | null; name: string; email?: string | null }[]
  /** The answers to the custom questions (#686), only loaded for the « answers » view. */
  answers?: AnswerSummary
  /** « Secteur : Parking » when the sheet is limited to one sector (#1170), under the title. */
  sectorCaption?: string | null
}

export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })
const fmtDayShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
/** Spoken form of the short day header: « samedi 5 décembre », without the year (the document has it). */
const fmtDayLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
const fmtRange = (s: string, e: string) => `${s}–${e}`
const fullName = (v: SheetVolunteer) => personName(v)
const shiftName = (s: SheetShift) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName)
const plural = (n: number, w: string) => `${n} ${n > 1 ? (w.endsWith("eau") ? `${w}x` : `${w}s`) : w}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Identity across shifts: an id when present, else the email, else the name. */
const volunteerKey = (v: SheetVolunteer) =>
  v.id ? `id:${v.id}` : (v.email ?? "").toLowerCase() || `${normalizeName(v.firstName)}|${normalizeName(v.lastName)}`.toLowerCase()

const byDateTime = (a: SheetShift, b: SheetShift) =>
  a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.roleName.localeCompare(b.roleName, "fr")
const byName = (a: SheetVolunteer, b: SheetVolunteer) =>
  normalizeName(a.lastName).localeCompare(normalizeName(b.lastName), "fr") || normalizeName(a.firstName).localeCompare(normalizeName(b.firstName), "fr")

function groupBy<T, K extends string>(items: T[], key: (t: T) => K): [K, T[]][] {
  const map = new Map<K, T[]>()
  for (const it of items) map.set(key(it), [...(map.get(key(it)) ?? []), it])
  return [...map.entries()]
}

/** One row per volunteer across the event, with their shifts, alphabetical. */
export function volunteersOf(shifts: SheetShift[]): { volunteer: SheetVolunteer; shifts: SheetShift[] }[] {
  const map = new Map<string, { volunteer: SheetVolunteer; shifts: SheetShift[] }>()
  for (const s of [...shifts].sort(byDateTime)) {
    for (const v of s.registrations) {
      const key = volunteerKey(v)
      const entry = map.get(key)
      if (entry) {
        entry.shifts.push(s)
        if (!entry.volunteer.phone && v.phone) entry.volunteer = { ...entry.volunteer, phone: v.phone }
      } else map.set(key, { volunteer: v, shifts: [s] })
    }
  }
  return [...map.values()].sort((a, b) => byName(a.volunteer, b.volunteer))
}

// ── Phone list (#1431): one column per event day, touching shifts merged ──────────────────────

/** One line of a phone-sheet day cell: a shift, or several touching shifts of the same role. */
export type MergedShift = { date: string; startTime: string; endTime: string; roleName: string; label: string }

/** A merged line plus the people registered on any of its shifts, once each. */
export type MergedShiftWithVolunteers = MergedShift & { registrations: SheetVolunteer[]; shiftIds: string[] }

/**
 * Merge the shifts that touch (the end of one is the start of the next) on the same day and on
 * the same role (role name and label), keeping chronological order. A gap, a different role or
 * another day starts a new line. A shift crossing midnight keeps its own date: 22:00–02:00 is one
 * line in its day's column, never moved to the next day.
 */
function mergeTouchingShiftGroups(shifts: SheetShift[]): (MergedShift & { shifts: SheetShift[] })[] {
  const sorted = [...shifts].sort((a, b) =>
    a.date.localeCompare(b.date) || toMin(a.startTime) - toMin(b.startTime) || a.endTime.localeCompare(b.endTime))
  const merged: (MergedShift & { shifts: SheetShift[] })[] = []
  for (const s of sorted) {
    const last = merged.at(-1)
    const touches = last
      && last.date === s.date
      && last.roleName === s.roleName
      && last.label === s.label
      && toMinEnd(last.endTime, last.startTime) === toMin(s.startTime)
    if (touches) {
      last.endTime = s.endTime
      last.shifts.push(s)
    } else merged.push({ date: s.date, startTime: s.startTime, endTime: s.endTime, roleName: s.roleName, label: s.label, shifts: [s] })
  }
  return merged
}

/** The phone list's lines: the merged shifts, without the source shifts. */
export function mergeTouchingShifts(shifts: SheetShift[]): MergedShift[] {
  return mergeTouchingShiftGroups(shifts).map(({ date, startTime, endTime, roleName, label }) => ({ date, startTime, endTime, roleName, label }))
}

/**
 * The individual sheet's lines (#1444): the same merge, with the registrations of all the merged
 * shifts, so a row can list the co-volunteers of a merged 14:00–18:00 shift without losing any.
 */
export function mergeTouchingShiftsWithVolunteers(shifts: SheetShift[]): MergedShiftWithVolunteers[] {
  return mergeTouchingShiftGroups(shifts).map(({ shifts: group, ...line }) => {
    const people = new Map<string, SheetVolunteer>()
    for (const s of group) for (const v of s.registrations) if (!people.has(volunteerKey(v))) people.set(volunteerKey(v), v)
    return { ...line, registrations: [...people.values()], shiftIds: group.map((s) => s.id) }
  })
}

/** The event's days that have at least one shift, chronological, with short and spoken headers. */
export function phoneDays(shifts: SheetShift[]): { date: string; label: string; full: string }[] {
  return [...new Set(shifts.map((s) => s.date))].sort().map((date) => ({ date, label: fmtDayShort(date), full: fmtDayLong(date) }))
}

/**
 * An email as escaped HTML with a break opportunity before « @ » and before each dot, so a
 * continuation line starts with the separator instead of ending on it. Without this,
 * `word-break: break-all` used to cut addresses mid-word; a long address now wraps only at those
 * natural separators, never inside a local part or a domain label.
 */
export function emailWithBreaks(email: string | null): string {
  return email ? esc(email).replace(/([@.])/g, "<wbr>$1") : ""
}

// ── Gantt (same markup as the full export, restyled in monochrome by the sheet CSS) ───────────

const toRow = (s: SheetShift): ShiftRow => ({
  id: s.id, roleName: s.roleName, label: s.label, date: new Date(`${s.date}T00:00:00Z`),
  startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, status: "open", displayOrder: s.displayOrder ?? 0,
  registrations: s.registrations.map((v) => ({ volunteer: { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone }, comment: v.comment ?? null, source: "" })),
  waitlistEntries: [],
})

/**
 * The Gantt of one day for the given shifts, without the builder's own day title (the sheet has
 * one). The per-role sheet keeps this single timeline when it adds information (#1444); a dense
 * day there uses bandedDay, and the full export gets its split straight from buildDayParts.
 */
export function ganttOf(shifts: SheetShift[]): string {
  if (shifts.length === 0) return ""
  const { gantt } = buildDayParts(new Date(`${shifts[0].date}T00:00:00Z`), shifts.map(toRow), [], false, undefined, { dense: false })
  return gantt.replace(/<h3 class="day-sub-title">[^<]*<\/h3>/, "")
}

/** « 3 créneaux · 5/8 inscrits · 3 places à pourvoir » for a section head. */
export function staffingLine(shifts: SheetShift[]): string {
  const capacity = shifts.reduce((n, s) => n + s.capacity, 0)
  const filled = shifts.reduce((n, s) => n + s.registrations.length, 0)
  const missing = Math.max(0, capacity - filled)
  const figures = `<span aria-hidden="true">${filled}/${capacity} inscrits</span><span class="sr-only">${placesInWords(filled, capacity)}</span>`
  return `${plural(shifts.length, "créneau")} · ${figures} · ${missing ? `<strong>${plural(missing, "place")} à pourvoir</strong>` : "complet"}`
}

type TimelineCandidate = { startTime: string; endTime: string; label?: string | null; roleName?: string | null }

/** A displayed label: empty when it only repeats the role name, as in the detail table's column. */
const ownLabel = (s: TimelineCandidate) => {
  const label = (s.label ?? "").trim()
  if (!label) return ""
  if (s.roleName && label === s.roleName) return ""
  return label
}

/**
 * Whether a poste's timeline carries information on one day (#1444). A single lane of shifts that
 * all share one label only repeats the detail table underneath: the page then shows the table
 * alone. The timeline earns its place when at least two shifts overlap (several lanes) or when the
 * shifts carry more than one distinct label — the only two things the table cannot say at a glance.
 */
export function roleTimelineAddsInfo(shifts: TimelineCandidate[]): boolean {
  if (shifts.length < 2) return false
  const ranges = shifts.map((s) => ({ start: toMin(s.startTime), end: toMinEnd(s.endTime, s.startTime) }))
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (ranges[i].start < ranges[j].end && ranges[j].start < ranges[i].end) return true
    }
  }
  return new Set(shifts.map(ownLabel)).size > 1
}

// ── Dense day: overview strip and 6-hour bands (#1431) ──────────────────────
//
// Only used when shouldSplitDay() says the single timeline cannot be read (many short shifts, or
// the narrowest shift under 28 px). A non-split day keeps ganttOf() and its detail table as before.
// The tables reuse the Gantt's classes, caption and scope attributes; the fill state is carried by
// the cell text (n/places, names, « personne »), the hatching is only decorative.

const slotLabel = (mins: number) => {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
}

/** Same role order as the export's Gantt: displayOrder first, then first appearance (#222). */
function roleOrderOf(shifts: SheetShift[]): string[] {
  const first = new Map<string, number>()
  const minOrder = new Map<string, number>()
  shifts.forEach((s, i) => {
    if (!first.has(s.roleName)) first.set(s.roleName, i)
    minOrder.set(s.roleName, Math.min(minOrder.get(s.roleName) ?? Infinity, s.displayOrder ?? 0))
  })
  return [...first.keys()].sort((a, b) => {
    const d = (minOrder.get(a) ?? 0) - (minOrder.get(b) ?? 0)
    return d !== 0 ? d : first.get(a)! - first.get(b)!
  })
}

/** First name only when unique across the day, else « Prénom N. » — the export Gantt's names. */
function smartNameOf(shifts: SheetShift[]): (v: SheetVolunteer) => string {
  const unique = new Map<string, SheetVolunteer>()
  for (const s of shifts) for (const v of s.registrations) {
    const key = v.email ?? ""
    if (!unique.has(key)) unique.set(key, v)
  }
  const counts = new Map<string, number>()
  for (const v of unique.values()) {
    const first = normalizeName(v.firstName)
    counts.set(first, (counts.get(first) ?? 0) + 1)
  }
  return (v) => {
    const first = normalizeName(v.firstName)
    return (counts.get(first) ?? 0) > 1 ? `${first} ${normalizeName(v.lastName).charAt(0).toUpperCase()}.` : first
  }
}

/** Black-and-white fill state: white complete, light hatch with free places, dense hatch nobody. */
function fillState(s: SheetShift): "complete" | "free" | "empty" {
  const filled = s.registrations.length
  if (filled === 0) return "empty"
  return filled < s.capacity ? "free" : "complete"
}

/** « de 6h à 12h », « de 18h à 24h », « de 0h à 2h (lendemain) » for a band caption. */
function bandCaptionRange(band: DayBand): string {
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
  }
  if (band.nextDay) return `de ${fmt(band.startMin - 1440)} à ${fmt(band.endMin - 1440)} (lendemain)`
  return `de ${fmt(band.startMin)} à ${fmt(band.endMin)}`
}

function bandLegend(): string {
  return `<ul class="legend" aria-label="Légende">
        <li>Légende :</li>
        <li><span class="swatch" aria-hidden="true"></span>complet</li>
        <li><span class="swatch swatch-free" aria-hidden="true"></span>places libres</li>
        <li><span class="swatch swatch-empty" aria-hidden="true"></span>personne</li>
        <li>2/3 inscrits / places</li>
        <li>— personne d'inscrit</li>
      </ul>`
}

type TimelineGroup = { roleName: string; label: string; shifts: SheetShift[] }

type TimelineOptions = {
  /** All the day's shifts: they set the role order, the Libellé column and the smart names. */
  allShifts: SheetShift[]
  /** The shifts drawn in this table (all for the overview, the band's own for a band). */
  rangeShifts: SheetShift[]
  startMin: number
  endMin: number
  step: number
  caption: string
  tableClass: string
  hasLabel: boolean
  smartName: (v: SheetVolunteer) => string
  cell: (s: SheetShift, smartName: (v: SheetVolunteer) => string) => string
}

/** One timeline table (overview or band), on an axis in minutes, one column per step. */
function timelineTable(o: TimelineOptions): string {
  const slotCount = Math.max(1, Math.round((o.endMin - o.startMin) / o.step))
  const order = roleOrderOf(o.allShifts)
  const sorted = [...o.rangeShifts].sort((a, b) =>
    order.indexOf(a.roleName) - order.indexOf(b.roleName) || a.startTime.localeCompare(b.startTime))
  const groups: TimelineGroup[] = []
  const byKey = new Map<string, TimelineGroup>()
  for (const s of sorted) {
    const key = `${s.roleName}\0${s.label}`
    let group = byKey.get(key)
    if (!group) {
      group = { roleName: s.roleName, label: s.label, shifts: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.shifts.push(s)
  }

  const emptyCell = (slot: number) =>
    `<td class="empty-cell${(o.startMin + slot * o.step) % 60 === 0 ? " hour-mark" : ""}"></td>`

  const rows: string[] = []
  let gi = 0
  while (gi < groups.length) {
    const role = groups[gi].roleName
    let ge = gi + 1
    while (ge < groups.length && groups[ge].roleName === role) ge++
    for (let m = gi; m < ge; m++) {
      const group = groups[m]
      let row = `<tr class="${m === ge - 1 ? "role-last" : ""}">`
      if (m === gi) {
        const span = ge - gi
        row += `<th scope="row" class="role-cell"${span > 1 ? ` rowspan="${span}"` : ""}>${esc(role)}</th>`
      }
      if (o.hasLabel) {
        row += group.label !== role
          ? `<th scope="row" class="label-cell">${esc(group.label)}</th>`
          : `<td class="label-cell"></td>`
      }

      let slot = 0
      const shifts = [...group.shifts].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))
      for (const s of shifts) {
        const start = toMin(s.startTime)
        const end = toMinEnd(s.endTime, s.startTime)
        const startSlot = Math.max(0, Math.round((start - o.startMin) / o.step))
        const endSlot = Math.min(slotCount, Math.max(startSlot + 1, Math.round((end - o.startMin) / o.step)))
        if (startSlot >= slotCount || endSlot <= slot || startSlot < slot) continue
        while (slot < startSlot) { row += emptyCell(slot); slot++ }
        const colspan = endSlot - startSlot
        row += `<td class="shift-cell" data-fill="${fillState(s)}"${colspan > 1 ? ` colspan="${colspan}"` : ""}>${o.cell(s, o.smartName)}</td>`
        slot = endSlot
      }
      while (slot < slotCount) { row += emptyCell(slot); slot++ }
      rows.push(`${row}</tr>`)
    }
    gi = ge
  }

  const slotHeaders = Array.from({ length: slotCount }, (_, i) => {
    const mins = o.startMin + i * o.step
    const onHour = mins % 60 === 0
    return `<th scope="col" class="slot-th${onHour ? " hour-th" : ""}">${onHour ? slotLabel(mins) : `<span class="sr-only">${slotLabel(mins)}</span>`}</th>`
  }).join("")
  const widths = ganttColumnWidths(slotCount, o.hasLabel)
  const colgroup = `<colgroup><col style="width:${widths.role}%">${widths.label !== null ? `<col style="width:${widths.label}%">` : ""}<col span="${slotCount}" style="width:${widths.slot}%"></colgroup>`

  return `
      <div class="${o.tableClass}">
        <table class="gantt-table">
          <caption class="band-caption">${esc(o.caption)}</caption>
          ${colgroup}
          <thead>
            <tr>
              <th scope="col" class="th-role">Poste</th>
              ${o.hasLabel ? `<th scope="col" class="th-label">Libellé</th>` : ""}
              ${slotHeaders}
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>`
}

/** « 1/2 » only, in tabular figures: the overview shows the gaps at a glance. */
function overviewCell(s: SheetShift): string {
  const filled = s.registrations.length
  return `<span class="sr-only">de ${esc(clockTime(s.startTime))} à ${esc(clockTime(s.endTime))}, ${placesInWords(filled, s.capacity)}</span><strong class="mono" aria-hidden="true">${filled}/<wbr>${s.capacity}</strong>`
}

/** Names one per line; an empty shift says « — » and « personne » for screen readers. */
function bandCell(s: SheetShift, smartName: (v: SheetVolunteer) => string): string {
  const time = `<span class="sr-only">de ${esc(clockTime(s.startTime))} à ${esc(clockTime(s.endTime))}</span>`
  const filled = s.registrations.length
  if (filled === 0) return `${time}<span aria-hidden="true">—</span><span class="sr-only">personne</span>`
  const names = [...s.registrations].sort(byName).map((v) => esc(smartName(v))).join("<br>")
  // A partial shift shows its count too, on its own line and in normal weight: the names alone
  // never tell how many of the places are taken.
  if (filled >= s.capacity) return time + names
  return `${time}${names}<br><span class="fill-count" aria-hidden="true">${filled}/<wbr>${s.capacity}</span><span class="sr-only">, ${placesInWords(filled, s.capacity)}</span>`
}

function bandedDay(shifts: SheetShift[], date: string): string {
  const dayLabel = fmtDay(date)
  const axis = dayAxis(shifts)
  const hasLabel = shifts.some((s) => s.label !== s.roleName)
  const smartName = smartNameOf(shifts)
  const overview = timelineTable({
    allShifts: shifts, rangeShifts: shifts, startMin: axis.startMin, endMin: axis.endMin, step: axis.step,
    caption: `Vue d'ensemble du ${dayLabel}`, tableClass: "overview-table", hasLabel, smartName, cell: overviewCell,
  })
  const bands = dayBands(shifts).map((band) => timelineTable({
    allShifts: shifts,
    rangeShifts: shifts.filter((s) => {
      const start = toMin(s.startTime)
      const end = toMinEnd(s.endTime, s.startTime)
      return start < band.endMin && end > band.startMin
    }),
    startMin: band.startMin, endMin: band.endMin, step: axis.step,
    caption: `Frise horaire du ${dayLabel} ${bandCaptionRange(band)}`, tableClass: "band-table", hasLabel, smartName, cell: bandCell,
  })).join("")
  return `${bandLegend()}${overview}${bands}`
}

// ── Views ────────────────────────────────────────────────────────────────────

function namesCell(s: SheetShift): string {
  const names = [...s.registrations].sort(byName).map((v) => esc(fullName(v)))
  const missing = s.capacity - s.registrations.length
  const blanks = missing > 0 ? `<span class="muted">${plural(missing, "place")} libre${missing > 1 ? "s" : ""}</span>` : ""
  return [names.join(", "), blanks].filter(Boolean).join(names.length ? " · " : "")
}

/** « 2/4 », then « · sous le minimum (2) » or « · minimum atteint » for a shift with a minimum (#949): words, for black and white. */
export function effectifCell(s: SheetShift): string {
  const figures = `${s.registrations.length}/${s.capacity}`
  const state = s.registrations.length < s.capacity ? staffingStateText(s, shiftStaffingState({ ...s, active: s.registrations.length })) : null
  return state ? `${figures} · ${state === "minimum atteint" ? state : `<strong>${state}</strong>`}` : figures
}

/** Under a detail table whose shifts have a minimum (#949): what the words in « Effectif » mean. */
export function minimumLegend(shifts: SheetShift[]): string {
  if (!shifts.some((s) => effectiveMinimum(s) != null)) return ""
  return `<p class="meta">Effectif : inscrits sur les places. « Sous le minimum (2) » : moins de personnes que le minimum avec lequel le créneau peut tourner ; « minimum atteint » : le créneau peut tourner, sans être complet.</p>`
}

/** A second column of the detail table: its header and the text of a shift. */
type DetailColumn = { title: string; of: (s: SheetShift) => string }

function detailTable(shifts: SheetShift[], caption: string, second?: DetailColumn | null): string {
  return `
      <table class="detail">
        <caption class="sr-only">${caption}</caption>
        <thead><tr><th scope="col" class="w-time">Horaire</th>${second ? `<th scope="col" class="w-role">${second.title}</th>` : ""}<th scope="col">Bénévoles</th><th scope="col" class="num">Effectif</th></tr></thead>
        <tbody>
          ${shifts.map((s) => `<tr>
            <td class="nowrap mono">${esc(fmtRange(s.startTime, s.endTime))}</td>
            ${second ? `<td>${esc(second.of(s))}</td>` : ""}
            <td>${namesCell(s)}</td>
            <td class="num mono">${effectifCell(s)}</td>
          </tr>`).join("")}
        </tbody>
      </table>${minimumLegend(shifts)}`
}

function sectionHead(title: string, stats: string): string {
  return `<div class="section-head"><h2>${title}</h2><p class="stats">${stats}</p></div>`
}

function dayView(d: SheetData): string {
  return groupBy([...d.shifts].sort(byDateTime), (s) => s.date).map(([date, shifts], i) => {
    const body = shouldSplitDay(shifts)
      ? bandedDay(shifts, date)
      : `${ganttOf(shifts)}
      ${detailTable(shifts, `Détail des créneaux du ${esc(fmtDay(date))}`, { title: "Poste", of: shiftName })}`
    return `
    <section class="block${i > 0 ? " page-before" : ""}">
      ${sectionHead(esc(cap(fmtDay(date))), staffingLine(shifts))}
      ${body}
    </section>`
  }).join("")
}

function roleView(d: SheetData): string {
  const roles = [...new Set([...d.shifts].sort(byDateTime).map((s) => s.roleName))]
  return roles.map((role, i) => {
    const shifts = d.shifts.filter((s) => s.roleName === role).sort(byDateTime)
    const leaders = d.leaders.filter((l) => l.roleName === role)
    return `
    <section class="block page${i > 0 ? " page-before" : ""}">
      ${sectionHead(esc(role), staffingLine(shifts))}
      <p class="meta">${leaders.length ? `Responsable${leaders.length > 1 ? "s" : ""} : ${leaders.map((l) => `<strong>${esc(l.name)}</strong>` + (l.email ? ` (${esc(l.email)})` : "")).join(", ")}` : "Pas de responsable de secteur désigné."}</p>
      ${groupBy(shifts, (s) => s.date).map(([date, dayShifts]) => {
        // A single lane of identical labels adds nothing to the detail table (#1444): no timeline
        // then. When it stays, a dense day uses the day sheet's overview and 6-hour bands.
        const timeline = roleTimelineAddsInfo(dayShifts)
          ? (shouldSplitDay(dayShifts) ? bandedDay(dayShifts, date) : ganttOf(dayShifts))
          : ""
        // « Créneau » repeats the role name unless a shift carries a label of its own.
        const ownLabels = dayShifts.some((s) => ownLabel(s) !== "")
        return `
      <h3>${esc(cap(fmtDay(date)))}</h3>
      ${timeline}
      ${detailTable(dayShifts, `${esc(role)} : détail des créneaux du ${esc(fmtDay(date))}`, ownLabels ? { title: "Créneau", of: (s) => ownLabel(s) || role } : null)}`
      }).join("")}
    </section>`
  }).join("")
}

type InfoKind = ShiftInfoLine["kind"] | "readBefore"
type InfoLine = { kind: InfoKind; text: string }

/** Every line the individual cards used to show, with its kind, exactly as shiftInfoText renders it. */
function infoLinesOf(s: SheetShift): InfoLine[] {
  const texts = shiftInfoText(s)
  const lines = shiftInfoLines(s)
  return [
    ...lines.map((l, i) => ({ kind: l.kind, text: texts[i] })),
    ...readBeforePages(s).map((_, i) => ({ kind: "readBefore" as const, text: texts[lines.length + i] })),
  ]
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

/** The texts every list contains, in the first list's order. */
function sharedTexts(linesPerShift: string[][]): string[] {
  if (linesPerShift.length === 0) return []
  return unique(linesPerShift[0]).filter((text) => linesPerShift.every((lines) => lines.includes(text)))
}

/**
 * Where each practical line goes on the individual sheet (#1444). Contacts are shown once at the
 * top; a line common to every shift of a poste is shown once for that poste; a line that differs
 * between shifts of the same poste stays next to its shift, so nothing the old cards said is lost.
 */
type VolunteerInfoLines = {
  dayContacts: string[]
  contacts: string[]
  info: string[]
  roleContacts: Map<string, string[]>
  roleInfo: Map<string, string[]>
  leaders: Map<string, string[]>
  shiftLines: Map<string, string[]>
}

function volunteerInfoLines(shifts: SheetShift[]): VolunteerInfoLines {
  const perShift = shifts.map(infoLinesOf)
  const roles = [...new Set(shifts.map((s) => s.roleName))]
  const indexesFor = (role: string) => shifts.flatMap((s, i) => (s.roleName === role ? [i] : []))

  const contactsOf = perShift.map((ls) => unique(ls.filter((l) => l.kind === "contact").map((l) => l.text)))
  const infoOf = perShift.map((ls) => unique(ls.filter((l) => l.kind !== "contact" && l.kind !== "dayContact" && l.kind !== "leader").map((l) => l.text)))
  const dayContacts = unique(perShift.flatMap((ls) => ls.filter((l) => l.kind === "dayContact").map((l) => l.text)))

  const contacts = sharedTexts(contactsOf)
  const info = sharedTexts(infoOf)
  const roleContacts = new Map<string, string[]>()
  const roleInfo = new Map<string, string[]>()
  const leaders = new Map<string, string[]>()
  const shiftLines = new Map<string, string[]>()
  for (const role of roles) {
    const idxs = indexesFor(role)
    const roleContactShare = sharedTexts(idxs.map((i) => contactsOf[i])).filter((t) => !contacts.includes(t))
    const roleInfoShare = sharedTexts(idxs.map((i) => infoOf[i])).filter((t) => !info.includes(t))
    roleContacts.set(role, roleContactShare)
    roleInfo.set(role, roleInfoShare)
    leaders.set(role, unique(idxs.flatMap((i) => perShift[i].filter((l) => l.kind === "leader").map((l) => l.text))))
    for (const i of idxs) {
      shiftLines.set(shifts[i].id, unique([...contactsOf[i], ...infoOf[i]])
        .filter((t) => !contacts.includes(t) && !info.includes(t) && !roleContactShare.includes(t) && !roleInfoShare.includes(t)))
    }
  }
  return { dayContacts, contacts, info, roleContacts, roleInfo, leaders, shiftLines }
}

/** « (Buvette) » after a line shared by one of several postes, so the reader knows which one. */
const roleSuffix = (role: string, roleCount: number) =>
  roleCount > 1 ? ` <span class="contact-role">(${esc(role)})</span>` : ""

function individualContacts(info: VolunteerInfoLines, roleCount: number, note: string | null): string {
  const items = [
    ...info.dayContacts.map((text) => `<li>${esc(text)}</li>`),
    ...info.contacts.map((text) => `<li>${esc(text)}</li>`),
    ...[...info.roleContacts].flatMap(([role, lines]) => lines.map((text) => `<li>${esc(text)}${roleSuffix(role, roleCount)}</li>`)),
    ...[...info.leaders].flatMap(([role, lines]) => lines.map((text) => `<li>${esc(text)}${roleSuffix(role, roleCount)}</li>`)),
  ]
  if (items.length === 0 && !note) return ""
  return `<h3>Contacts</h3>
      ${items.length ? `<ul class="contact-list">${items.join("")}</ul>` : ""}
      ${note ? `<p class="contact-note">${esc(note)}</p>` : ""}`
}

function individualInfo(info: VolunteerInfoLines): string {
  const roleLines = [...info.roleInfo].filter(([, lines]) => lines.length > 0)
  if (info.info.length === 0 && roleLines.length === 0) return ""
  return `<h3>Informations</h3>
      ${info.info.map((text) => `<p class="role-info">${esc(text)}</p>`).join("")}
      ${roleLines.map(([role, lines]) => `<p class="role-info"><strong>${esc(role)}</strong> : ${lines.map(esc).join("<br>")}</p>`).join("")}`
}

/** A merged line's time, with the phone list's « fin le lendemain » note past midnight. */
function individualTimeCell(s: MergedShift): string {
  const nextDay = toMinEnd(s.endTime, s.startTime) >= 1440
  return `<span class="nowrap mono">${esc(clockTime(s.startTime))}<span aria-hidden="true">–</span><span class="sr-only"> à </span>${esc(clockTime(s.endTime))}</span>${nextDay ? ` <span class="next-day" aria-hidden="true">(fin le lendemain)</span><span class="sr-only"> le lendemain</span>` : ""}`
}

function individualDayTable(date: string, dayShifts: SheetShift[], info: VolunteerInfoLines, volunteer: SheetVolunteer): string {
  const merged = mergeTouchingShiftsWithVolunteers(dayShifts)
  const rows = merged.map((m) => {
    const otherNames = m.registrations
      .filter((v) => volunteerKey(v) !== volunteerKey(volunteer))
      .sort(byName)
      .map((v) => esc(fullName(v)))
    const extra = unique(m.shiftIds.flatMap((id) => info.shiftLines.get(id) ?? []))
    return `<tr>
            <td>${individualTimeCell(m)}</td>
            <td>${esc(mergedShiftName(m))}${extra.map((line) => `<span class="sr-only">. </span><span class="shift-extra">${esc(line)}</span>`).join("")}</td>
            <td class="with-cell">${otherNames.length ? otherNames.join(", ") : `<span aria-hidden="true">—</span><span class="sr-only">personne d'autre</span>`}</td>
          </tr>`
  }).join("")
  return `
      <table class="detail individual-table">
        <caption>${esc(cap(fmtDay(date)))}</caption>
        <thead><tr><th scope="col" class="w-time">Horaire</th><th scope="col">Poste</th><th scope="col">Avec</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
}

function individualView(d: SheetData): string {
  const rows = volunteersOf(d.shifts)
  if (rows.length === 0) return `<p class="meta">Aucun bénévole inscrit.</p>`
  return rows.map(({ volunteer: v, shifts }, i) => {
    const info = volunteerInfoLines(shifts)
    const note = emergencyNoteFor(shifts)
    const roleCount = new Set(shifts.map((s) => s.roleName)).size
    const contacts = individualContacts(info, roleCount, note)
    const infoBlock = individualInfo(info)
    // Once a Contacts or Informations heading precedes them, the day tables get their own heading
    // so heading navigation does not file the schedule under the previous one.
    const slotsHeading = contacts.trim() || infoBlock.trim() ? `<h3>Créneaux</h3>` : ""
    return `
    <section class="block page${i > 0 ? " page-before" : ""}">
      ${sectionHead(esc(fullName(v)), `${plural(shifts.length, "créneau")} · ${esc(d.eventTitle)}`)}
      ${contacts}
      ${infoBlock}
      ${slotsHeading}
      ${groupBy(shifts, (s) => s.date).map(([date, dayShifts]) => individualDayTable(date, dayShifts, info, v)).join("")}
    </section>`
  }).join("")
}

/** Blank lines under each shift for people who turn up unannounced. */
export const ATTENDANCE_SPARE_LINES = 2

function attendanceView(d: SheetData): string {
  return groupBy([...d.shifts].sort(byDateTime), (s) => s.date).map(([date, shifts], i) => `
    <section class="block${i > 0 ? " page-before" : ""}">
      ${sectionHead(esc(cap(fmtDay(date))), staffingLine(shifts))}
      ${shifts.map((s) => {
        const people = [...s.registrations].sort(byName)
        const blanks = Math.max(0, s.capacity - people.length) + ATTENDANCE_SPARE_LINES
        return `
        <table class="attendance">
          <caption>${esc(shiftName(s))} · ${esc(fmtRange(s.startTime, s.endTime))} · ${people.length}/${s.capacity}</caption>
          <thead><tr><th scope="col" class="box">Présent</th><th scope="col" class="w-name">Nom</th><th scope="col" class="w-name">Prénom</th><th scope="col" class="w-phone">Téléphone</th><th scope="col" class="w-time">Arrivée</th><th scope="col">Remarque</th></tr></thead>
          <tbody>
            ${people.map((v) => `<tr>
              <td class="box"><span class="checkbox" aria-hidden="true">${v.checkedIn ? "☑" : "☐"}</span><span class="sr-only">${v.checkedIn ? "présent" : "à cocher"}</span></td>
              <td><strong>${esc(normalizeName(v.lastName))}</strong></td><td>${esc(normalizeName(v.firstName))}</td><td class="nowrap mono">${esc(v.phone)}</td><td></td><td>${esc(v.comment)}</td>
            </tr>`).join("")}
            ${Array.from({ length: blanks }, () => `<tr class="blank"><td class="box"><span class="checkbox" aria-hidden="true">☐</span><span class="sr-only">ligne vide</span></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}
          </tbody>
        </table>`
      }).join("")}
    </section>`).join("")
}

/** A merged shift's name: the role, and its label when it differs (as on the detail tables). */
const mergedShiftName = (s: MergedShift) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName)

/** One day cell: a list of shifts, each a subgrid row aligning its time column with its role column. */
function phoneDayCell(shifts: MergedShift[]): string {
  if (shifts.length === 0) return `<span aria-hidden="true">—</span><span class="sr-only">aucun créneau</span>`
  return `<ul class="shifts" role="list">${shifts.map((s) => {
    const nextDay = toMinEnd(s.endTime, s.startTime) >= 1440
    return `<li><span class="shift-time mono">${esc(clockTime(s.startTime))}<span aria-hidden="true">–</span><span class="sr-only"> à </span>${esc(clockTime(s.endTime))}${nextDay ? `<span class="sr-only"> le lendemain</span>` : ""}<span class="sr-only"> : </span></span><span class="shift-role">${esc(mergedShiftName(s))}${nextDay ? ` <span class="next-day" aria-hidden="true">(fin le lendemain)</span>` : ""}</span></li>`
  }).join("")}</ul>`
}

function phonesView(d: SheetData): string {
  const rows = volunteersOf(d.shifts)
  const days = phoneDays(d.shifts)
  return `
    <p class="notice" role="note">Document pour les organisateurs : contient des numéros de téléphone. Ne pas afficher ni distribuer.</p>
    <table class="phones-table">
      <caption class="sr-only">Bénévoles, coordonnées et créneaux par jour</caption>
      <colgroup><col class="w-vol">${days.map(() => `<col class="w-day">`).join("")}</colgroup>
      <thead><tr><th scope="col">Bénévole</th>${days.map((day) => `<th scope="col"><span aria-hidden="true">${esc(day.label)}</span><span class="sr-only">${esc(day.full)}</span></th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(({ volunteer: v, shifts }) => {
          const byDay = new Map(groupBy(mergeTouchingShifts(shifts), (s) => s.date))
          return `<tr>
            <th scope="row" class="vol-cell">
              <span class="vol-name">${esc([normalizeName(v.lastName), normalizeName(v.firstName)].filter(Boolean).join(" "))}</span>
              ${v.phone ? `<span class="vol-phone mono">${esc(v.phone)}</span>` : ""}
              ${v.email ? `<span class="vol-email">${emailWithBreaks(v.email)}</span>` : ""}
            </th>
            ${days.map((day) => `<td class="day-cell">${phoneDayCell(byDay.get(day.date) ?? [])}</td>`).join("")}
          </tr>`
        }).join("")}
      </tbody>
    </table>
    <p class="meta">${plural(rows.length, "bénévole")}.</p>`
}

/** The answers to the custom questions (#686): one table per question, counts only, no names. */
function answersView(d: SheetData): string {
  const a = d.answers
  if (!a || a.questions.length === 0) return `<p class="meta">Aucune question posée aux bénévoles pour cet événement.</p>`
  if (a.confirmedCount === 0) return `<p class="meta">Aucun bénévole confirmé pour l'instant.${a.waitingCount ? ` ${esc(waitingLine(a.waitingCount))}.` : ""}</p>`
  const waiting = a.waitingCount > 0
  return `
    <p class="meta">Chaque bénévole compte une fois, quel que soit son nombre de créneaux : <strong>${esc(confirmedLine(a.confirmedCount))}</strong>${waiting ? `, et ${esc(waitingLine(a.waitingCount))}` : ""}. Les inscriptions annulées ne comptent pas, ni les questions retirées.</p>
    ${a.questions.map((q) => `
    <section class="block${q.condition ? " follow-up" : ""}">
      <table class="detail answers">
        <caption>${esc(q.label)}${q.condition ? `<span class="caption-note">${esc(conditionLine(q.condition, waiting))}</span>` : ""}${q.scope ? `<span class="caption-note">${esc(scopeLine(q.scope, waiting))}</span>` : ""}${q.type === "multiple" ? `<span class="caption-note">${esc(MULTIPLE_NOTE)}</span>` : ""}${q.type === "number" ? `<span class="caption-note">${esc(numberNote(waiting))}</span>` : ""}</caption>
        <thead><tr><th scope="col">Réponse</th><th scope="col" class="num">Confirmés</th>${waiting ? `<th scope="col" class="num">En attente</th>` : ""}</tr></thead>
        <tbody>
          ${q.rows.map((r) => `<tr>
            <th scope="row"${r.kind === "none" || r.kind === "removed" ? ` class="muted"` : r.kind === "total" ? ` class="total"` : ""}>${esc(rowLabel(r))}</th>
            <td class="num mono">${r.confirmed}</td>${waiting ? `<td class="num mono">${r.waiting}</td>` : ""}
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`).join("")}`
}

const BUILDERS: Record<SheetView, (d: SheetData) => string> = {
  day: dayView, role: roleView, individual: individualView, attendance: attendanceView, phones: phonesView, answers: answersView,
}

/**
 * The whole printable page for one view. Monochrome by design: one ink, one light grey band;
 * the Gantt bars are white with a 2px ink outline and the light grey band is the only fill.
 */
export function renderSheet(view: SheetView, d: SheetData): string {
  const meta = SHEET_VIEWS.find((s) => s.id === view)!
  const landscape = view === "day" || view === "role" || view === "phones"
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(meta.name)} – ${esc(d.eventTitle)}${d.sectorCaption ? ` – ${esc(d.sectorCaption)}` : ""}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --ink: #111; --ink-2: #444; --rule: #bbb; --rule-soft: #ddd; --band: #f2f2f2; }
    /* Read on screen before printing: a readable size there, compact on paper. */
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.4; color: var(--ink); background: #fff; padding: 20px 24px; max-width: 1400px; margin: 0 auto; }
    .mono { font-variant-numeric: tabular-nums; }

    /* ── Document header ─────────────────────────────────────────────────── */
    .doc-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 10px; margin-bottom: 18px; border-bottom: 2px solid var(--ink); }
    .doc-head h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; text-wrap: balance; }
    .doc-head .kind { font-size: 13px; color: var(--ink-2); margin-top: 3px; }
    .doc-head .kind strong { color: var(--ink); }
    .doc-id { display: flex; align-items: center; gap: 14px; min-width: 0; }
    /* The logo in grey like the rest of the page: it must read once printed in black and white. */
    .org-logo { display: block; flex-shrink: 0; object-fit: contain; filter: grayscale(1); }
    .print-btn { background: var(--ink); color: #fff; border: 2px solid var(--ink); border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .print-btn:hover { background: #333; }
    .print-btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }

    /* ── Sections ────────────────────────────────────────────────────────── */
    .block { margin-bottom: 22px; }
    .page-before { page-break-before: always; break-before: page; }
    .section-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 12px; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--ink); }
    h2 { font-size: 16px; font-weight: 700; }
    h3 { font-size: 13px; font-weight: 700; margin: 14px 0 6px; color: var(--ink-2); }
    .stats { font-size: 12px; color: var(--ink-2); }
    .stats strong { color: var(--ink); }
    .meta { font-size: 12px; color: var(--ink-2); margin: 0 0 8px; }
    .muted { font-style: italic; color: var(--ink-2); }
    .notice { border: 2px solid var(--ink); padding: 6px 10px; font-weight: 700; font-size: 13px; margin-bottom: 12px; }

    /* ── Detail tables: horizontal rules only; the header is bold text over a rule, no ink band ── */
    table.detail, table.attendance { border-collapse: collapse; width: 100%; margin: 6px 0 4px; }
    .detail th, .attendance th { background: #fff; color: var(--ink); font-weight: 700; font-size: 11px; text-align: left; padding: 4px 8px; letter-spacing: 0.01em; border-bottom: 2px solid var(--ink); }
    .detail td, .attendance td { padding: 5px 8px; border-bottom: 1px solid var(--rule-soft); vertical-align: top; text-align: left; font-size: 12px; }
    .detail tbody tr:nth-child(even) td { background: var(--band); }
    .detail tr, .attendance tr { page-break-inside: avoid; break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    .w-time { width: 7em; }
    .w-role { width: 14em; }
    .w-phone { width: 9em; }

    /* ── Phone list: a volunteer cell, one column per event day, a two-column grid per shift ── */
    table.phones-table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 6px 0 4px; }
    .phones-table th, .phones-table td { padding: 5px 8px; border-bottom: 1px solid var(--rule-soft); vertical-align: top; text-align: left; font-size: 12px; }
    .phones-table thead th { background: #fff; color: var(--ink); font-weight: 700; font-size: 11px; white-space: nowrap; border-bottom: 2px solid var(--ink); }
    .phones-table tbody tr:nth-child(even) th, .phones-table tbody tr:nth-child(even) td { background: var(--band); }
    .phones-table tr { page-break-inside: avoid; break-inside: avoid; }
    .phones-table .w-vol { width: 24%; }
    .phones-table tbody th { font-weight: 400; }
    .phones-table .vol-name { display: block; font-weight: 700; }
    .phones-table .vol-phone { display: block; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .phones-table .vol-email { display: block; word-break: normal; overflow-wrap: anywhere; hyphens: none; }
    /* The time keeps its own fixed grid column; a long role wraps inside the second, never under it.
       Each shift is a list item spanning the subgrid, so times and roles line up across the day. */
    .phones-table .shifts { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 8px; row-gap: 2px; align-items: start; margin: 0; padding: 0; list-style: none; }
    .phones-table .shifts li { display: grid; grid-column: 1 / -1; grid-template-columns: max-content minmax(0, 1fr); grid-template-columns: subgrid; }
    .phones-table .shift-time { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .phones-table .shift-role { min-width: 0; overflow-wrap: anywhere; }
    .phones-table .next-day { white-space: nowrap; }

    /* ── Attendance: caption as a band, boxes with room to tick ──────────── */
    .attendance { margin-top: 12px; table-layout: fixed; }
    .w-name { width: 20%; }
    .attendance caption { text-align: left; font-weight: 700; font-size: 13px; padding: 4px 0; caption-side: top; }
    .attendance td { height: 28px; }
    .attendance tbody tr.blank td { border-bottom: 1px solid var(--ink); }
    .box { width: 60px; text-align: center; }
    .checkbox { font-size: 20px; line-height: 1; }

    /* ── Answers summary: one narrow table per question, its label as the caption ── */
    table.answers { width: auto; min-width: 22em; max-width: 100%; }
    .answers caption { text-align: left; font-weight: 700; font-size: 13px; padding: 4px 0; caption-side: top; }
    .answers tbody th { font-weight: 400; font-size: 12px; text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--rule-soft); background: inherit; letter-spacing: 0; }
    .answers tbody tr:nth-child(even) th { background: var(--band); }
    .answers .num { width: 7em; }
    .answers thead th.num { text-align: right; }
    .answers tbody th.total, .answers tbody th.total ~ td { font-weight: 700; }
    .answers .caption-note { display: block; font-weight: 400; font-size: 12px; color: var(--ink-2); }
    .block.follow-up { margin-left: 1.5em; }

    /* ── Individual sheet: contacts once, then one table per day ─────────── */
    .contact-list { margin: 0 0 8px; padding-left: 1.1em; font-size: 12px; }
    .contact-list li { margin: 1px 0; }
    .contact-role { color: var(--ink-2); }
    .contact-note { font-weight: 700; border-left: 3px solid var(--ink); padding-left: 6px; margin: 4px 0 10px; font-size: 12px; }
    .role-info { font-size: 12px; margin: 0 0 4px; }
    .individual-table { margin-top: 2px; }
    .individual-table tr { page-break-inside: avoid; break-inside: avoid; }
    .individual-table caption { text-align: left; font-weight: 700; font-size: 13px; padding: 4px 0; caption-side: top; }
    .individual-table .shift-extra { display: block; font-size: 11px; color: var(--ink-2); margin-top: 1px; }
    .individual-table .next-day { white-space: nowrap; }
    .individual-table .with-cell { overflow-wrap: anywhere; }

    /* ── Gantt (shared markup with the full export), monochrome and ink-sparing: white bars with a
          thick outline instead of solid fills, bold header text instead of a band ─────────── */
    /* Fixed layout (#923): the colgroup scales the time axis to the page width, so a long day
       never runs past the right edge of the sheet or of the screen preview. */
    .gantt-table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 4px 0 8px; }
    .gantt-table th, .gantt-table td { border: 1px solid var(--rule-soft); padding: 2px 4px; vertical-align: middle; }
    .gantt-table .th-role, .gantt-table .th-label { text-align: left; font-size: 11px; font-weight: 700; background: #fff; color: var(--ink); border-bottom: 2px solid var(--ink); }
    /* The hour label sits on the hour line and runs over the next (unlabelled) slots. */
    .gantt-table .slot-th { font-size: 11px; color: var(--ink-2); text-align: left; padding: 1px 0 1px 2px; white-space: nowrap; overflow: visible; border-left: 1px solid var(--rule-soft); border-right: 0; background: #fff; }
    .gantt-table .empty-cell { padding: 0; }
    .gantt-table thead th { border-bottom: 2px solid var(--ink); }
    .gantt-table .hour-th { border-left: 2px solid var(--ink) !important; font-weight: 700; color: var(--ink); }
    .gantt-table .hour-mark { border-left: 2px solid var(--rule) !important; }
    .gantt-table .role-cell { text-align: left; font-weight: 700; font-size: 11px; white-space: normal; border-right: 2px solid var(--ink); border-top: 2px solid var(--ink); }
    .gantt-table .label-cell { font-size: 11px; font-weight: 400; color: var(--ink-2); white-space: normal; border-right: 2px solid var(--ink); }
    .gantt-table .shift-cell { background: #fff; color: var(--ink); font-size: 11px; font-weight: 600; text-align: left; vertical-align: top; white-space: normal; line-height: 1.3; padding: 3px 4px; overflow-wrap: anywhere; border: 2px solid var(--ink) !important; }
    /* Two bars back to back: a double rule so the boundary reads as two boxes, not one split box. */
    .gantt-table .shift-cell + .shift-cell { border-left: 5px double var(--ink) !important; }
    .gantt-table .empty-cell { background: #fff; border-left: 1px solid var(--rule-soft); border-right: 0; }
    .gantt-table tr.role-last td, .gantt-table tr.role-last th { border-bottom: 2px solid var(--ink); }

    /* ── Dense day (#1431): overview strip, 6-hour bands, black-and-white fill state ──────────
       Complete stays white; free places and nobody are hatched in greys, never in colour alone.
       The text inside the cell (n/places, names, « personne ») always carries the meaning. */
    .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 8px; padding: 0; list-style: none; font-size: 11px; color: var(--ink-2); }
    .legend li { display: flex; align-items: center; gap: 5px; }
    .legend .swatch { display: inline-block; width: 14px; height: 14px; border: 1px solid var(--ink); background: #fff; }
    .legend .swatch-free { background: repeating-linear-gradient(135deg,#fff 0 3px,#d9d9d9 3px 5px); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .legend .swatch-empty { background: repeating-linear-gradient(135deg,#fff 0 2px,#9a9a9a 2px 4px); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .band-caption { caption-side: top; text-align: left; font-weight: 700; font-size: 11px; color: var(--ink); padding: 2px 0 3px; }
    .overview-table { margin-bottom: 10px; }
    /* A band is one block: it never straddles a page break. The overview and the first band can
       still share the first page, since only the band table itself avoids a break. */
    .band-table, .band-table .gantt-table { page-break-inside: avoid; break-inside: avoid; }
    /* The overview has one cell per shift across the whole day: a light 1px rule, not the Gantt's
       2px outline and double boundary, and figures large enough to read inside the columns. */
    .overview-table .shift-cell { border: 1px solid var(--ink) !important; padding: 0 1px; text-align: center; font-size: 9px; font-weight: 700; line-height: 1.2; }
    .overview-table .shift-cell strong { font-weight: 700; white-space: normal; }
    /* A white chip keeps the figures legible on the hatching, on screen as on paper. */
    .overview-table .shift-cell strong, .fill-count { background: #fff; color: var(--ink); padding: 0 1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .fill-count { display: inline-block; font-weight: 400; line-height: 1.2; margin-top: 1px; }
    .overview-table .shift-cell + .shift-cell { border-left: 1px solid var(--ink) !important; }
    .gantt-table .shift-cell[data-fill="free"] { background: repeating-linear-gradient(135deg,#fff 0 3px,#d9d9d9 3px 5px); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .gantt-table .shift-cell[data-fill="empty"] { background: repeating-linear-gradient(135deg,#fff 0 2px,#9a9a9a 2px 4px); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section-head, .legend, .band-caption, h3, .individual-table caption { break-after: avoid; }
    table.individual-table { page-break-inside: avoid; break-inside: avoid; }
    .gantt-table tr { page-break-inside: avoid; break-inside: avoid; }

    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); border: 0; white-space: nowrap; }

    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 1.1cm 1.2cm; }
    @media print {
      body { padding: 0; font-size: 12px; max-width: none; }
      .doc-head { margin-bottom: 12px; }
      .print-btn { display: none; }
      .block { margin-bottom: 14px; }
      .stats { white-space: nowrap; }
      .gantt-table .slot-th { font-size: 10px; }
      .gantt-table .label-cell, .gantt-table .shift-cell { font-size: 11px; }
      .overview-table .shift-cell { font-size: 8px; }
      .band-caption { font-size: 10px; }
      .phones-table th, .phones-table td { font-size: 11px; padding: 4px 6px; }
      .phones-table thead { display: table-header-group; }
      .phones-table tbody tr:nth-child(even) th, .phones-table tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .detail tbody tr:nth-child(even) td, .answers tbody tr:nth-child(even) th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media (prefers-reduced-motion: no-preference) { .print-btn { transition: background-color 150ms ease-out; } }
  </style>
</head>
<body>
  <header class="doc-head">
    <div class="doc-id">
      ${printLogoHtml(d.logo, "org-logo", { maxWidth: 160, maxHeight: 56 })}
      <div>
        <h1>${esc(d.eventTitle)}</h1>
        <p class="kind"><strong>${esc(meta.name)}</strong> · ${esc(d.organizationName)} · imprimé le ${esc(d.printedAt)}</p>
        ${d.sectorCaption ? `<p class="kind"><strong>${esc(d.sectorCaption)}</strong></p>` : ""}
      </div>
    </div>
    <button type="button" class="print-btn" data-print>Imprimer</button>
  </header>
  <main>
    ${d.shifts.length === 0 && view !== "answers" ? `<p class="meta">${d.sectorCaption ? `Aucun créneau dans ce choix (${esc(d.sectorCaption)}).` : "Aucun créneau."}</p>` : BUILDERS[view](d)}
  </main>
  ${PRINT_BUTTON_SCRIPT_TAG}
</body>
</html>`
}
