// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftInfoText, type ShiftInfo } from "./shift-info"
import { buildDayParts, type ShiftRow } from "./pdf-export-gantt"

/**
 * Printable sheets (#400): paper still matters on site. Five views of one event, each a plain
 * HTML page designed for black-and-white printing: schedule per day, schedule per role, individual
 * schedule per volunteer, attendance sheet, list with phone numbers. The two schedules and the
 * individual sheet reuse the Gantt of the full export (the product's signature), restyled in
 * monochrome. Pure: the route only loads the data and calls renderSheet.
 */

export const SHEET_VIEWS = [
  { id: "day", name: "Planning par jour", description: "Pour chaque jour, la frise des postes avec les prénoms dans les créneaux, puis le détail avec les places libres.", audience: "volunteers" },
  { id: "role", name: "Planning par poste", description: "Une page par poste : sa frise, ses bénévoles, son responsable. À donner à chaque responsable.", audience: "volunteers" },
  { id: "individual", name: "Planning individuel", description: "Une page par bénévole : sa journée en frise, puis ses créneaux avec lieu, contact et consignes. À remettre à l'arrivée.", audience: "volunteers" },
  { id: "attendance", name: "Feuille de présence", description: "Par créneau, une case à cocher par bénévole et des lignes vides pour les arrivées imprévues.", audience: "organizers" },
  { id: "phones", name: "Liste avec téléphones", description: "Tous les bénévoles par ordre alphabétique, avec téléphone, email et créneaux.", audience: "organizers" },
] as const

export type SheetView = (typeof SHEET_VIEWS)[number]["id"]

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
  displayOrder?: number
  registrations: SheetVolunteer[]
}
export type SheetData = {
  eventTitle: string
  organizationName: string
  /** Already formatted, in the organization's time zone. */
  printedAt: string
  shifts: SheetShift[]
  leaders: { roleName: string; name: string; email?: string | null }[]
}

export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })
const fmtDayShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
const fmtRange = (s: string, e: string) => `${s}–${e}`
const fullName = (v: SheetVolunteer) => `${v.firstName} ${v.lastName}`.trim()
const shiftName = (s: SheetShift) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName)
const plural = (n: number, w: string) => `${n} ${n > 1 ? (w.endsWith("eau") ? `${w}x` : `${w}s`) : w}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const byDateTime = (a: SheetShift, b: SheetShift) =>
  a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.roleName.localeCompare(b.roleName, "fr")
const byName = (a: SheetVolunteer, b: SheetVolunteer) =>
  a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")

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
      const key = v.id ? `id:${v.id}` : (v.email ?? "").toLowerCase() || `${v.firstName}|${v.lastName}`.toLowerCase()
      const entry = map.get(key)
      if (entry) {
        entry.shifts.push(s)
        if (!entry.volunteer.phone && v.phone) entry.volunteer = { ...entry.volunteer, phone: v.phone }
      } else map.set(key, { volunteer: v, shifts: [s] })
    }
  }
  return [...map.values()].sort((a, b) => byName(a.volunteer, b.volunteer))
}

// ── Gantt (same markup as the full export, restyled in monochrome by the sheet CSS) ───────────

const toRow = (s: SheetShift): ShiftRow => ({
  id: s.id, roleName: s.roleName, label: s.label, date: new Date(`${s.date}T00:00:00Z`),
  startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, status: "open", displayOrder: s.displayOrder ?? 0,
  registrations: s.registrations.map((v) => ({ volunteer: { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone }, comment: v.comment ?? null, source: "" })),
  waitlistEntries: [],
})

/** The Gantt of one day for the given shifts, without the builder's own day title (the sheet has one). */
export function ganttOf(shifts: SheetShift[]): string {
  if (shifts.length === 0) return ""
  const { gantt } = buildDayParts(new Date(`${shifts[0].date}T00:00:00Z`), shifts.map(toRow), [], false)
  return gantt.replace(/<h3 class="day-sub-title">[^<]*<\/h3>/, "")
}

/** « 3 créneaux · 5/8 inscrits · 3 places à pourvoir » for a section head. */
export function staffingLine(shifts: SheetShift[]): string {
  const capacity = shifts.reduce((n, s) => n + s.capacity, 0)
  const filled = shifts.reduce((n, s) => n + s.registrations.length, 0)
  const missing = Math.max(0, capacity - filled)
  return `${plural(shifts.length, "créneau")} · ${filled}/${capacity} inscrits · ${missing ? `<strong>${plural(missing, "place")} à pourvoir</strong>` : "complet"}`
}

// ── Views ────────────────────────────────────────────────────────────────────

function namesCell(s: SheetShift): string {
  const names = [...s.registrations].sort(byName).map((v) => esc(fullName(v)))
  const missing = s.capacity - s.registrations.length
  const blanks = missing > 0 ? `<span class="muted">${plural(missing, "place")} libre${missing > 1 ? "s" : ""}</span>` : ""
  return [names.join(", "), blanks].filter(Boolean).join(names.length ? " · " : "")
}

function detailTable(shifts: SheetShift[], caption: string, second: string, secondOf: (s: SheetShift) => string): string {
  return `
      <table class="detail">
        <caption class="sr-only">${caption}</caption>
        <thead><tr><th scope="col" class="w-time">Horaire</th><th scope="col" class="w-role">${second}</th><th scope="col">Bénévoles</th><th scope="col" class="num">Effectif</th></tr></thead>
        <tbody>
          ${shifts.map((s) => `<tr>
            <td class="nowrap mono">${esc(fmtRange(s.startTime, s.endTime))}</td>
            <td>${esc(secondOf(s))}</td>
            <td>${namesCell(s)}</td>
            <td class="num mono">${s.registrations.length}/${s.capacity}</td>
          </tr>`).join("")}
        </tbody>
      </table>`
}

function sectionHead(title: string, stats: string): string {
  return `<div class="section-head"><h2>${title}</h2><p class="stats">${stats}</p></div>`
}

function dayView(d: SheetData): string {
  return groupBy([...d.shifts].sort(byDateTime), (s) => s.date).map(([date, shifts], i) => `
    <section class="block${i > 0 ? " page-before" : ""}">
      ${sectionHead(esc(cap(fmtDay(date))), staffingLine(shifts))}
      ${ganttOf(shifts)}
      ${detailTable(shifts, `Détail des créneaux du ${esc(fmtDay(date))}`, "Poste", shiftName)}
    </section>`).join("")
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
      ${groupBy(shifts, (s) => s.date).map(([date, dayShifts]) => `
      <h3>${esc(cap(fmtDay(date)))}</h3>
      ${ganttOf(dayShifts)}
      ${detailTable(dayShifts, `${esc(role)} : détail des créneaux du ${esc(fmtDay(date))}`, "Créneau", (s) => (s.label && s.label !== role ? s.label : role))}`).join("")}
    </section>`
  }).join("")
}

function individualView(d: SheetData): string {
  const rows = volunteersOf(d.shifts)
  if (rows.length === 0) return `<p class="meta">Aucun bénévole inscrit.</p>`
  return rows.map(({ volunteer: v, shifts }, i) => `
    <section class="block page${i > 0 ? " page-before" : ""}">
      ${sectionHead(esc(fullName(v)), `${plural(shifts.length, "créneau")} · ${esc(d.eventTitle)}`)}
      ${groupBy(shifts, (s) => s.date).map(([date, dayShifts]) => `
      <h3>${esc(cap(fmtDay(date)))}</h3>
      ${ganttOf(dayShifts)}
      ${dayShifts.map((s) => `
      <div class="card">
        <h4 class="card-title"><span class="mono">${esc(fmtRange(s.startTime, s.endTime))}</span> — ${esc(shiftName(s))}</h4>
        ${shiftInfoText(s).map((l) => `<p>${esc(l)}</p>`).join("")}
      </div>`).join("")}`).join("")}
    </section>`).join("")
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
              <td><strong>${esc(v.lastName)}</strong></td><td>${esc(v.firstName)}</td><td class="nowrap mono">${esc(v.phone)}</td><td></td><td>${esc(v.comment)}</td>
            </tr>`).join("")}
            ${Array.from({ length: blanks }, () => `<tr class="blank"><td class="box"><span class="checkbox" aria-hidden="true">☐</span><span class="sr-only">ligne vide</span></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}
          </tbody>
        </table>`
      }).join("")}
    </section>`).join("")
}

/** A volunteer's shifts grouped by day, chronological: the day is written once, then each time range. */
export function shiftsByDay(shifts: SheetShift[]): { date: string; day: string; items: { time: string; name: string }[] }[] {
  const days: { date: string; day: string; items: { time: string; name: string }[] }[] = []
  for (const s of [...shifts].sort(byDateTime)) {
    let entry = days.find((e) => e.date === s.date)
    if (!entry) { entry = { date: s.date, day: fmtDayShort(s.date), items: [] }; days.push(entry) }
    entry.items.push({ time: fmtRange(s.startTime, s.endTime), name: shiftName(s) })
  }
  return days
}

/** The « Créneaux » cell: one line per day, the hours and the shift name after it. */
function shiftsCell(shifts: SheetShift[]): string {
  return `<ul class="days" role="list">${shiftsByDay(shifts).map((e) => `<li><span class="day">${esc(e.day)}</span> ${e.items.map((i) => `<span class="shift"><span class="mono nowrap">${esc(i.time)}</span> ${esc(i.name)}</span>`).join(' <span class="sep" aria-hidden="true">·</span> ')}</li>`).join("")}</ul>`
}

function phonesView(d: SheetData): string {
  const rows = volunteersOf(d.shifts)
  return `
    <p class="notice" role="note">Document pour les organisateurs : contient des numéros de téléphone. Ne pas afficher ni distribuer.</p>
    <table class="detail">
      <caption class="sr-only">Bénévoles avec téléphone et créneaux</caption>
      <thead><tr><th scope="col">Nom</th><th scope="col">Prénom</th><th scope="col" class="w-phone">Téléphone</th><th scope="col">Email</th><th scope="col">Créneaux</th></tr></thead>
      <tbody>
        ${rows.map(({ volunteer: v, shifts }) => `<tr>
          <td><strong>${esc(v.lastName)}</strong></td>
          <td>${esc(v.firstName)}</td>
          <td class="nowrap mono">${esc(v.phone)}</td>
          <td class="email">${esc(v.email)}</td>
          <td>${shiftsCell(shifts)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <p class="meta">${plural(rows.length, "bénévole")}.</p>`
}

const BUILDERS: Record<SheetView, (d: SheetData) => string> = {
  day: dayView, role: roleView, individual: individualView, attendance: attendanceView, phones: phonesView,
}

/**
 * The whole printable page for one view. Monochrome by design: one ink, one light grey band;
 * the Gantt bars are white with a 2px ink outline and the light grey band is the only fill.
 */
export function renderSheet(view: SheetView, d: SheetData): string {
  const meta = SHEET_VIEWS.find((s) => s.id === view)!
  const landscape = view === "day" || view === "role"
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(meta.name)} – ${esc(d.eventTitle)}</title>
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
    .email { word-break: break-all; }
    .w-time { width: 7em; }
    .w-role { width: 14em; }
    .w-phone { width: 9em; }
    /* Shifts cell: the day once, then the hours of each shift; lines wrap at the separators. */
    .days { list-style: none; margin: 0; padding: 0; }
    .days li { margin: 0 0 2px; overflow-wrap: anywhere; }
    .days li:last-child { margin-bottom: 0; }
    .days .day { font-weight: 700; margin-right: 4px; }
    .days .sep { color: var(--ink-2); }

    /* ── Attendance: caption as a band, boxes with room to tick ──────────── */
    .attendance { margin-top: 12px; table-layout: fixed; }
    .w-name { width: 20%; }
    .attendance caption { text-align: left; font-weight: 700; font-size: 13px; padding: 4px 0; caption-side: top; }
    .attendance td { height: 28px; }
    .attendance tbody tr.blank td { border-bottom: 1px solid var(--ink); }
    .box { width: 60px; text-align: center; }
    .checkbox { font-size: 20px; line-height: 1; }

    /* ── Cards (individual sheet) ────────────────────────────────────────── */
    .card { border: 1px solid var(--rule); padding: 6px 10px; margin: 6px 0; page-break-inside: avoid; break-inside: avoid; }
    .card-title { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
    .card p { font-size: 12px; }

    /* ── Gantt (shared markup with the full export), monochrome and ink-sparing: white bars with a
          thick outline instead of solid fills, bold header text instead of a band ─────────── */
    .gantt-table { border-collapse: collapse; table-layout: auto; width: 100%; margin: 4px 0 8px; }
    .gantt-table th, .gantt-table td { border: 1px solid var(--rule-soft); padding: 2px 4px; vertical-align: middle; }
    .gantt-table .th-role, .gantt-table .th-label { min-width: 90px; text-align: left; font-size: 11px; font-weight: 700; background: #fff; color: var(--ink); border-bottom: 2px solid var(--ink); }
    .gantt-table .slot-th { min-width: 14px; font-size: 11px; color: var(--ink-2); text-align: left; padding: 1px 2px; border-left: 1px solid var(--rule-soft); border-right: 0; background: #fff; }
    .gantt-table thead th { border-bottom: 2px solid var(--ink); }
    .gantt-table .hour-th { border-left: 2px solid var(--ink) !important; font-weight: 700; color: var(--ink); }
    .gantt-table .hour-mark { border-left: 2px solid var(--rule) !important; }
    .gantt-table .role-cell { text-align: left; font-weight: 700; font-size: 11px; white-space: normal; border-right: 2px solid var(--ink); border-top: 2px solid var(--ink); }
    .gantt-table .label-cell { font-size: 11px; color: var(--ink-2); white-space: normal; border-right: 2px solid var(--ink); }
    .gantt-table .shift-cell { background: #fff; color: var(--ink); font-size: 11px; font-weight: 600; text-align: left; vertical-align: top; white-space: normal; line-height: 1.3; padding: 3px 5px; border: 2px solid var(--ink) !important; }
    /* Two bars back to back: a double rule so the boundary reads as two boxes, not one split box. */
    .gantt-table .shift-cell + .shift-cell { border-left: 5px double var(--ink) !important; }
    .gantt-table .empty-cell { background: #fff; border-left: 1px solid var(--rule-soft); border-right: 0; }
    .gantt-table tr.role-last td, .gantt-table tr.role-last th { border-bottom: 2px solid var(--ink); }

    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); border: 0; white-space: nowrap; }

    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 1.1cm 1.2cm; }
    @media print {
      body { padding: 0; font-size: 12px; max-width: none; }
      .doc-head { margin-bottom: 12px; }
      .print-btn { display: none; }
      .block { margin-bottom: 14px; }
      .stats { white-space: nowrap; }
      .gantt-table .slot-th { font-size: 9px; }
      .gantt-table .label-cell, .gantt-table .shift-cell { font-size: 10px; }
      .detail tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media (prefers-reduced-motion: no-preference) { .print-btn { transition: background-color 150ms ease-out; } }
  </style>
</head>
<body>
  <header class="doc-head">
    <div>
      <h1>${esc(d.eventTitle)}</h1>
      <p class="kind"><strong>${esc(meta.name)}</strong> · ${esc(d.organizationName)} · imprimé le ${esc(d.printedAt)}</p>
    </div>
    <button type="button" class="print-btn" onclick="window.print()">Imprimer</button>
  </header>
  <main>
    ${d.shifts.length === 0 ? `<p class="meta">Aucun créneau.</p>` : BUILDERS[view](d)}
  </main>
</body>
</html>`
}
