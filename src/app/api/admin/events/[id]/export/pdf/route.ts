import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"

type VolData = { firstName: string; lastName: string; email: string; phone: string | null }
type RegData  = { volunteer: VolData; comment: string | null; source: string }
type ShiftRow = {
  id: string; roleName: string; label: string; date: Date
  startTime: string; endTime: string; capacity: number; status: string
  registrations: RegData[]
}
type ShowEntry = { name: string; date: string; startTime: string; endTime: string }

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function fmtSlot(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function shortName(v: VolData) {
  return `${v.firstName} ${v.lastName.charAt(0).toUpperCase()}.`
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function volsList(regs: RegData[]): string {
  return [...regs]
    .sort((a, b) => a.volunteer.firstName.localeCompare(b.volunteer.firstName, "fr"))
    .map((r) => esc(shortName(r.volunteer)))
    .join("<br>") || "—"
}

function buildDayHtml(date: Date, shifts: ShiftRow[], shows: ShowEntry[]): string {
  const allMins = [
    ...shifts.flatMap((s) => [toMin(s.startTime), toMin(s.endTime)]),
    ...shows.flatMap((s) => [toMin(s.startTime), toMin(s.endTime)]),
  ]
  const STEP = 15
  const dayStart = Math.floor(Math.min(...allMins) / STEP) * STEP
  const dayEnd   = Math.ceil(Math.max(...allMins)  / STEP) * STEP

  const slots: number[] = []
  for (let t = dayStart; t < dayEnd; t += STEP) slots.push(t)

  const roleOrder: string[] = []
  for (const s of shifts) if (!roleOrder.includes(s.roleName)) roleOrder.push(s.roleName)
  const sorted = [...shifts].sort((a, b) => {
    const ri = roleOrder.indexOf(a.roleName) - roleOrder.indexOf(b.roleName)
    return ri !== 0 ? ri : a.startTime.localeCompare(b.startTime)
  })

  // Duplicate first-name detection for smart name display
  const uniqueVols = new Map<string, VolData>()
  for (const s of shifts) for (const reg of s.registrations) {
    if (!uniqueVols.has(reg.volunteer.email)) uniqueVols.set(reg.volunteer.email, reg.volunteer)
  }
  const firstNameCount = new Map<string, number>()
  for (const v of uniqueVols.values())
    firstNameCount.set(v.firstName, (firstNameCount.get(v.firstName) ?? 0) + 1)
  const smartName = (v: VolData) =>
    (firstNameCount.get(v.firstName) ?? 0) > 1
      ? `${v.firstName} ${v.lastName.charAt(0).toUpperCase()}.`
      : v.firstName
  const smartVolsList = (regs: RegData[]): string =>
    [...regs]
      .sort((a, b) => a.volunteer.firstName.localeCompare(b.volunteer.firstName, "fr"))
      .map((r) => esc(smartName(r.volunteer)))
      .join("<br>") || "—"

  // Group by (roleName, label) — one Gantt row per group
  type GroupEntry = { roleName: string; label: string; shifts: ShiftRow[] }
  const groups: GroupEntry[] = []
  const groupMap = new Map<string, GroupEntry>()
  for (const shift of sorted) {
    const key = `${shift.roleName}\0${shift.label}`
    if (!groupMap.has(key)) {
      const g: GroupEntry = { roleName: shift.roleName, label: shift.label, shifts: [] }
      groups.push(g)
      groupMap.set(key, g)
    }
    groupMap.get(key)!.shifts.push(shift)
  }

  // Pre-compute slots covered by shows (for background highlight)
  const showSlots = new Set<number>()
  for (const show of shows) {
    const s0 = Math.round((toMin(show.startTime) - dayStart) / STEP)
    const s1 = Math.min(Math.round((toMin(show.endTime) - dayStart) / STEP), slots.length)
    for (let s = Math.max(0, s0); s < s1; s++) showSlots.add(s)
  }

  // ── Gantt ────────────────────────────────────────────────────────────────
  let ganttRows = ""
  let gi = 0
  while (gi < groups.length) {
    const role = groups[gi].roleName
    let roleEnd = gi + 1
    while (roleEnd < groups.length && groups[roleEnd].roleName === role) roleEnd++
    const roleSpan = roleEnd - gi

    for (let m = gi; m < roleEnd; m++) {
      const group       = groups[m]
      const displayLbl  = group.label !== role ? group.label : ""
      const isLastInRole = m === roleEnd - 1

      let row = `<tr class="${isLastInRole ? "role-last" : ""}">`

      if (m === gi) {
        row += `<td class="role-cell"${roleSpan > 1 ? ` rowspan="${roleSpan}"` : ""}>${esc(role)}</td>`
      }

      row += `<td class="label-cell">${esc(displayLbl)}</td>`

      // Generate time slot cells for all shifts in this group
      let s = 0
      const sortedShifts = [...group.shifts].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))
      for (const sh of sortedShifts) {
        const startSlot = Math.round((toMin(sh.startTime) - dayStart) / STEP)
        const endSlot   = Math.min(slots.length, Math.max(startSlot + 1, Math.round((toMin(sh.endTime) - dayStart) / STEP)))
        if (startSlot < s) continue // skip overlapping shift already covered
        while (s < startSlot) {
          const cls = ["empty-cell", slots[s] % 60 === 0 ? "hour-mark" : "", showSlots.has(s) ? "show-active" : ""].filter(Boolean).join(" ")
          row += `<td class="${cls}"></td>`; s++
        }
        const colspan    = endSlot - startSlot
        const vols       = smartVolsList(sh.registrations)
        const hourMark   = slots[startSlot] % 60 === 0 ? " hour-mark" : ""
        row += colspan > 1
          ? `<td class="shift-cell${hourMark}" colspan="${colspan}">${vols}</td>`
          : `<td class="shift-cell${hourMark}">${vols}</td>`
        s = endSlot
      }
      while (s < slots.length) {
        const cls = ["empty-cell", slots[s] % 60 === 0 ? "hour-mark" : "", showSlots.has(s) ? "show-active" : ""].filter(Boolean).join(" ")
        row += `<td class="${cls}"></td>`; s++
      }

      row += "</tr>"
      ganttRows += row
    }

    gi = roleEnd
  }

  // ── Show row ─────────────────────────────────────────────────────────────
  let showRow = ""
  if (shows.length > 0) {
    showRow = `<tr class="show-row"><td class="show-label-cell" colspan="2"></td>`
    let s = 0
    while (s < slots.length) {
      const show = shows.find((sh) => Math.round((toMin(sh.startTime) - dayStart) / STEP) === s)
      if (show) {
        const endSlot = Math.min(Math.round((toMin(show.endTime) - dayStart) / STEP), slots.length)
        const colspan = endSlot - s
        const label   = `🎪 ${esc(show.name)}`
        showRow += colspan > 1
          ? `<td class="show-band-cell" colspan="${colspan}">${label}</td>`
          : `<td class="show-band-cell">${label}</td>`
        s = endSlot
      } else {
        showRow += `<td class="show-empty-cell${slots[s] % 60 === 0 ? " hour-mark" : ""}"></td>`
        s++
      }
    }
    showRow += `</tr>`
  }

  const slotHeaders = slots.map((s) => `<th class="slot-th${s % 60 === 0 ? " hour-th" : ""}">${s % 60 === 0 ? fmtSlot(s) : ""}</th>`).join("")

  const gantt = `
    <table class="gantt-table">
      <thead>
        <tr>
          <th class="th-role">Rôle</th>
          <th class="th-label">Libellé</th>
          ${slotHeaders}
        </tr>
      </thead>
      <tbody>${ganttRows}${showRow}</tbody>
    </table>`

  // ── Recap ────────────────────────────────────────────────────────────────
  let recapRows = ""
  sorted.forEach((shift, i) => {
    const vols        = smartVolsList(shift.registrations)
    const lbl         = shift.label !== shift.roleName ? shift.label : ""
    const isFirstRole = i === 0 || sorted[i - 1].roleName !== shift.roleName
    const isLastRole  = i === sorted.length - 1 || sorted[i + 1].roleName !== shift.roleName
    const cls = [
      isFirstRole && i > 0 ? "role-start" : "",
      isLastRole            ? "role-end"   : "",
    ].filter(Boolean).join(" ")
    recapRows += `<tr${cls ? ` class="${cls}"` : ""}>
      <td>${esc(shift.roleName)}</td>
      <td>${esc(lbl)}</td>
      <td class="center">${fmtSlot(toMin(shift.startTime))}</td>
      <td class="center">${fmtSlot(toMin(shift.endTime))}</td>
      <td class="center">${shift.capacity}</td>
      <td class="center">${shift.registrations.length}</td>
      <td>${vols}</td>
    </tr>`
  })

  const recap = `
    <table class="recap-table">
      <thead>
        <tr>
          <th>Poste</th><th>Libellé</th><th class="center">Début</th><th class="center">Fin</th>
          <th class="center">Places</th><th class="center">Inscrits</th><th>Bénévoles</th>
        </tr>
      </thead>
      <tbody>${recapRows}</tbody>
    </table>`

  return `
    <section class="day-section">
      <h2 class="day-title">${fmtDate(date)}</h2>
      ${gantt}
      <h3 class="recap-title">Récap par poste</h3>
      ${recap}
    </section>`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      shifts: {
        where: { status: { not: "cancelled" } },
        include: {
          registrations: {
            where: { status: "active" },
            include: { volunteer: true },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { displayOrder: "asc" }],
      },
    },
  })

  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // ── Day sections ─────────────────────────────────────────────────────────
  const dayMap = new Map<string, { date: Date; shifts: ShiftRow[] }>()
  for (const shift of event.shifts) {
    const key = shift.date.toISOString().split("T")[0]
    if (!dayMap.has(key)) dayMap.set(key, { date: shift.date, shifts: [] })
    dayMap.get(key)!.shifts.push(shift as ShiftRow)
  }

  const showSchedule = (event.showSchedule as ShowEntry[] | null) ?? []

  let daySections = ""
  for (const [key, { date, shifts }] of dayMap) {
    const dayShows = showSchedule.filter((s) => s.date === key)
    daySections += buildDayHtml(date, shifts, dayShows)
  }

  // ── Bénévoles section ────────────────────────────────────────────────────
  const volMap = new Map<string, VolData>()
  for (const shift of event.shifts) {
    for (const reg of shift.registrations) {
      if (!volMap.has(reg.volunteer.email)) volMap.set(reg.volunteer.email, reg.volunteer)
    }
  }
  const allVols = [...volMap.values()].sort((a, b) =>
    a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")
  )
  const volRows = allVols.map((v) => `<tr>
    <td>${esc(v.lastName)}</td>
    <td>${esc(v.firstName)}</td>
    <td>${esc(v.email)}</td>
    <td>${esc(v.phone ?? "")}</td>
  </tr>`).join("")

  const ts = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${esc(event.title)} – Export</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 10px;
      color: #111827;
      background: #fff;
      padding: 20px;
    }

    /* ── Print button ─────────────────────────────────────────────────── */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 2px solid #E5E7EB;
    }
    .print-btn {
      background: #4F46E5;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.02em;
    }
    .print-btn:hover { background: #4338CA; }
    @media print { .toolbar { display: none; } }

    /* ── Header ───────────────────────────────────────────────────────── */
    .event-title { font-size: 18px; font-weight: 700; color: #111827; }
    .event-meta  { font-size: 10px; color: #6B7280; margin-top: 2px; }

    /* ── Day section ──────────────────────────────────────────────────── */
    .day-section { margin-bottom: 32px; page-break-inside: avoid; }
    .day-title {
      font-size: 13px;
      font-weight: 700;
      color: #4338CA;
      text-transform: capitalize;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 2px solid #E0E7FF;
    }
    .recap-title {
      font-size: 10px;
      font-weight: 700;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 14px 0 6px;
    }

    /* ── Tables ───────────────────────────────────────────────────────── */
    table { border-collapse: collapse; margin-bottom: 4px; }
    th, td {
      border: 1px solid #D1D5DB;
      padding: 3px 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
      vertical-align: middle;
    }
    th {
      background: #F3F4F6;
      font-weight: 600;
      font-size: 9px;
      color: #374151;
    }
    .center { text-align: center; }
    .text-muted { color: #9CA3AF; }

    /* ── Gantt ────────────────────────────────────────────────────────── */
    .gantt-table { table-layout: auto; }
    .th-role  { min-width: 100px; }
    .th-label { min-width: 130px; }
    .slot-th  { min-width: 22px; text-align: center; font-size: 8px; color: #6B7280; }
    .hour-th  { border-left: 2px solid #9CA3AF !important; font-weight: 700; color: #374151; }
    .hour-mark { border-left: 2px solid #D1D5DB !important; }

    .role-cell {
      background: #EEF2FF;
      color: #4338CA;
      font-weight: 700;
      font-size: 9px;
      border-left: 3px solid #6366F1;
      border-right: 1px solid #C7D2FE;
    }
    .label-cell {
      background: #EEF2FF;
      color: #6B7280;
      font-size: 9px;
      border-right: 1px solid #C7D2FE;
    }
    .shift-cell {
      background: #E0E7FF;
      color: #3730A3;
      font-size: 8px;
      text-align: left;
      vertical-align: top;
      white-space: normal;
      border-left: 2px solid #6366F1;
      border-right: 2px solid #6366F1;
    }
    .empty-cell { background: #FAFAFA; }
    .show-active { background: #F5F3FF !important; }
    tr.role-last td { border-bottom: 2px solid #6366F1 !important; }
    tr.label-last td:not(.role-cell) { border-bottom: 1px solid #C7D2FE !important; }

    /* ── Show row ─────────────────────────────────────────────────────── */
    .show-row td { border-top: 2px solid #C7D2FE; }
    .show-label-cell { }
    .show-band-cell {
      background: #EEF2FF;
      color: #4338CA;
      font-size: 8px;
      font-style: italic;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .show-empty-cell { }

    /* ── Recap ────────────────────────────────────────────────────────── */
    .recap-table td, .recap-table th { font-size: 9px; }
    .role-start td { border-top: 2px solid #9CA3AF !important; }
    .role-end   td { border-bottom: 2px solid #9CA3AF !important; }

    /* ── Bénévoles ────────────────────────────────────────────────────── */
    .vol-section { margin-top: 32px; page-break-before: always; }
    .insc-title { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 8px; }
    .vol-table td, .vol-table th { white-space: nowrap; font-size: 9px; }

    /* ── Page setup ───────────────────────────────────────────────────── */
    @page { size: A4 portrait; margin: 1.2cm 1cm; }
    @media print {
      body { padding: 0; }
      .day-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <div class="event-title">${esc(event.title)}</div>
      <div class="event-meta">Export du ${esc(ts)}</div>
    </div>
    <button class="print-btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>

  ${daySections}

  <section class="vol-section">
    <h2 class="insc-title">Liste des bénévoles</h2>
    <table class="vol-table">
      <thead>
        <tr>
          <th>Nom</th><th>Prénom</th><th>Email</th><th>Téléphone</th>
        </tr>
      </thead>
      <tbody>${volRows}</tbody>
    </table>
  </section>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
