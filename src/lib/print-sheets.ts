// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftInfoText, type ShiftInfo } from "./shift-info"

/**
 * Printable sheets (#400): paper still matters on site. Five views of one event, each a plain
 * HTML page that reads well in black and white: schedule per day, schedule per role, list with
 * phone numbers, attendance sheet with checkboxes, individual schedule per volunteer. Pure: the
 * route only loads the data and calls renderSheet.
 */

export const SHEET_VIEWS = [
  { id: "day", name: "Planning par jour", description: "Pour chaque jour, les créneaux par poste avec les noms des bénévoles.", audience: "volunteers" },
  { id: "role", name: "Planning par poste", description: "Une page par poste : ses créneaux, ses bénévoles, son responsable. À donner à chaque responsable.", audience: "volunteers" },
  { id: "phones", name: "Liste avec téléphones", description: "Tous les bénévoles par ordre alphabétique, avec téléphone et email, et leurs créneaux. Pour les organisateurs.", audience: "organizers" },
  { id: "attendance", name: "Feuille de présence", description: "Par créneau, une case à cocher par bénévole et des lignes vides pour les arrivées imprévues.", audience: "organizers" },
  { id: "individual", name: "Planning individuel", description: "Une page par bénévole : ses créneaux, lieux, contacts et consignes. À remettre à l'arrivée.", audience: "volunteers" },
] as const

export type SheetView = (typeof SHEET_VIEWS)[number]["id"]

export function isSheetView(v: string): v is SheetView {
  return SHEET_VIEWS.some((s) => s.id === v)
}

export type SheetVolunteer = { firstName: string; lastName: string; email: string | null; phone: string | null; comment?: string | null; checkedIn?: boolean }
export type SheetShift = ShiftInfo & {
  id: string
  roleName: string
  label: string
  /** "YYYY-MM-DD" */
  date: string
  startTime: string
  endTime: string
  capacity: number
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
const fmtRange = (s: string, e: string) => `${s}–${e}`
const fullName = (v: SheetVolunteer) => `${v.firstName} ${v.lastName}`.trim()
const shiftName = (s: SheetShift) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName)
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`

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
      const key = (v.email ?? "").toLowerCase() || `${v.firstName}|${v.lastName}`.toLowerCase()
      const entry = map.get(key)
      if (entry) {
        entry.shifts.push(s)
        if (!entry.volunteer.phone && v.phone) entry.volunteer = { ...entry.volunteer, phone: v.phone }
      } else map.set(key, { volunteer: v, shifts: [s] })
    }
  }
  return [...map.values()].sort((a, b) => byName(a.volunteer, b.volunteer))
}

// ── Views ────────────────────────────────────────────────────────────────────

function namesCell(s: SheetShift): string {
  const names = [...s.registrations].sort(byName).map((v) => esc(fullName(v)))
  const missing = s.capacity - s.registrations.length
  const blanks = missing > 0 ? `<span class="muted">${plural(missing, "place")} libre${missing > 1 ? "s" : ""}</span>` : ""
  return [names.join(", "), blanks].filter(Boolean).join(names.length ? " · " : "")
}

function dayView(d: SheetData): string {
  return groupBy([...d.shifts].sort(byDateTime), (s) => s.date).map(([date, shifts]) => `
    <section class="block">
      <h2>${esc(fmtDay(date))}</h2>
      <table>
        <th scope="col"ead><tr><th scope="col">Horaire</th><th scope="col">Poste</th><th scope="col">Bénévoles</th><th scope="col" class="num">Effectif</th></tr></thead>
        <tbody>
          ${shifts.map((s) => `<tr>
            <td class="nowrap">${esc(fmtRange(s.startTime, s.endTime))}</td>
            <td>${esc(shiftName(s))}</td>
            <td>${namesCell(s)}</td>
            <td class="num">${s.registrations.length}/${s.capacity}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`).join("")
}

function roleView(d: SheetData): string {
  const roles = [...new Set([...d.shifts].sort(byDateTime).map((s) => s.roleName))]
  return roles.map((role) => {
    const shifts = d.shifts.filter((s) => s.roleName === role).sort(byDateTime)
    const leaders = d.leaders.filter((l) => l.roleName === role)
    return `
    <section class="block page">
      <h2>${esc(role)}</h2>
      <p class="meta">${leaders.length ? `Responsable${leaders.length > 1 ? "s" : ""} : ${leaders.map((l) => esc(l.name) + (l.email ? ` (${esc(l.email)})` : "")).join(", ")}` : "Pas de responsable de secteur désigné."}</p>
      <table>
        <th scope="col"ead><tr><th scope="col">Date</th><th scope="col">Horaire</th><th scope="col">Créneau</th><th scope="col">Bénévoles</th><th scope="col" class="num">Effectif</th></tr></thead>
        <tbody>
          ${shifts.map((s) => `<tr>
            <td class="nowrap">${esc(fmtDay(s.date))}</td>
            <td class="nowrap">${esc(fmtRange(s.startTime, s.endTime))}</td>
            <td>${esc(s.label !== s.roleName ? s.label : "")}</td>
            <td>${namesCell(s)}</td>
            <td class="num">${s.registrations.length}/${s.capacity}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`
  }).join("")
}

function phonesView(d: SheetData): string {
  const rows = volunteersOf(d.shifts)
  return `
    <p class="notice" role="note">Document pour les organisateurs : contient des numéros de téléphone. Ne pas afficher ni distribuer.</p>
    <table>
      <th scope="col"ead><tr><th scope="col">Nom</th><th scope="col">Prénom</th><th scope="col">Téléphone</th><th scope="col">Email</th><th scope="col">Créneaux</th></tr></thead>
      <tbody>
        ${rows.map(({ volunteer: v, shifts }) => `<tr>
          <td>${esc(v.lastName)}</td>
          <td>${esc(v.firstName)}</td>
          <td class="nowrap">${esc(v.phone)}</td>
          <td>${esc(v.email)}</td>
          <td>${shifts.map((s) => `${esc(shiftName(s))} ${esc(fmtDay(s.date).split(" ").slice(0, 3).join(" "))} ${esc(fmtRange(s.startTime, s.endTime))}`).join("<br>")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <p class="meta">${plural(rows.length, "bénévole")}.</p>`
}

/** Blank lines under each shift for people who turn up unannounced. */
export const ATTENDANCE_SPARE_LINES = 2

function attendanceView(d: SheetData): string {
  return groupBy([...d.shifts].sort(byDateTime), (s) => s.date).map(([date, shifts]) => `
    <section class="block">
      <h2>${esc(fmtDay(date))}</h2>
      ${shifts.map((s) => {
        const people = [...s.registrations].sort(byName)
        const blanks = Math.max(0, s.capacity - people.length) + ATTENDANCE_SPARE_LINES
        return `
        <table class="attendance">
          <caption>${esc(shiftName(s))} · ${esc(fmtRange(s.startTime, s.endTime))} · ${people.length}/${s.capacity}</caption>
          <th scope="col"ead><tr><th scope="col" class="box">Présent</th><th scope="col">Nom</th><th scope="col">Prénom</th><th scope="col">Téléphone</th><th scope="col">Heure d'arrivée</th><th scope="col">Remarque</th></tr></thead>
          <tbody>
            ${people.map((v) => `<tr>
              <td class="box"><span class="checkbox" aria-hidden="true">${v.checkedIn ? "☑" : "☐"}</span><span class="sr-only">${v.checkedIn ? "présent" : "à cocher"}</span></td>
              <td>${esc(v.lastName)}</td><td>${esc(v.firstName)}</td><td class="nowrap">${esc(v.phone)}</td><td></td><td>${esc(v.comment)}</td>
            </tr>`).join("")}
            ${Array.from({ length: blanks }, () => `<tr class="blank"><td class="box"><span class="checkbox" aria-hidden="true">☐</span><span class="sr-only">ligne vide</span></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}
          </tbody>
        </table>`
      }).join("")}
    </section>`).join("")
}

function individualView(d: SheetData): string {
  const rows = volunteersOf(d.shifts)
  if (rows.length === 0) return `<p class="meta">Aucun bénévole inscrit.</p>`
  return rows.map(({ volunteer: v, shifts }) => `
    <section class="block page">
      <h2>${esc(fullName(v))}</h2>
      <p class="meta">${esc(d.eventTitle)} · ${esc(d.organizationName)} · ${plural(shifts.length, "créneau").replace("créneaus", "créneaux")}</p>
      ${shifts.map((s) => `
      <div class="card">
        <h3 class="card-title">${esc(fmtDay(s.date))}, ${esc(fmtRange(s.startTime, s.endTime))} — ${esc(shiftName(s))}</h3>
        ${shiftInfoText(s).map((l) => `<p>${esc(l)}</p>`).join("")}
      </div>`).join("")}
    </section>`).join("")
}

const BUILDERS: Record<SheetView, (d: SheetData) => string> = {
  day: dayView, role: roleView, phones: phonesView, attendance: attendanceView, individual: individualView,
}

/** The whole printable page for one view. Black and white by design: borders and weight, no colour. */
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
    /* Read on screen before printing: a readable size there, compact on paper. */
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 16px; color: #000; background: #fff; padding: 16px 20px; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 2px solid #000; }
    .toolbar h1 { font-size: 18px; }
    .toolbar .sub { font-size: 12px; margin-top: 2px; }
    .print-btn { background: #000; color: #fff; border: 2px solid #000; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .print-btn:focus-visible { outline: 3px solid #000; outline-offset: 2px; }
    h2 { font-size: 15px; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #000; }
    .block { margin-bottom: 18px; page-break-inside: avoid; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .meta { font-size: 0.9em; margin-bottom: 8px; }
    .muted { font-style: italic; }
    .notice { border: 2px solid #000; padding: 6px 8px; font-weight: 700; margin-bottom: 10px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
    caption { text-align: left; font-weight: 700; font-size: 13px; padding: 4px 0; }
    th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; }
    th { font-weight: 700; background: #e5e5e5; }
    .num { text-align: right; white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    tr { page-break-inside: avoid; }
    .attendance td { height: 26px; }
    .box { width: 60px; text-align: center; }
    .checkbox { font-size: 18px; line-height: 1; }
    .card { border: 1px solid #000; padding: 6px 8px; margin-bottom: 8px; page-break-inside: avoid; }
    .card-title { font-size: 1em; font-weight: 700; margin-bottom: 3px; border: 0; padding: 0; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); border: 0; white-space: nowrap; }
    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 1.2cm; }
    @media print {
      body { padding: 0; font-size: 12px; }
      .toolbar { border-bottom-width: 1px; }
      .print-btn { display: none; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <header class="toolbar">
    <div>
      <h1>${esc(meta.name)}</h1>
      <p class="sub">${esc(d.eventTitle)} · ${esc(d.organizationName)} · imprimé le ${esc(d.printedAt)}</p>
    </div>
    <button type="button" class="print-btn" onclick="window.print()">Imprimer</button>
  </header>
  <main>
    ${d.shifts.length === 0 ? `<p class="meta">Aucun créneau.</p>` : BUILDERS[view](d)}
  </main>
</body>
</html>`
}
