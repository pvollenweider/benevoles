import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"

type VolData       = { firstName: string; lastName: string; email: string | null; phone: string | null }
type RegData       = { volunteer: VolData; comment: string | null; source: string }
type WaitlistEntry = { volunteer: VolData; status: string; position: number | null }
type ShiftRow = {
  id: string; roleName: string; label: string; date: Date
  startTime: string; endTime: string; capacity: number; status: string
  registrations: RegData[]
  waitlistEntries: WaitlistEntry[]
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

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Returns {gantt, recap} HTML fragments for one day
function buildDayParts(
  date: Date,
  shifts: ShiftRow[],
  shows: ShowEntry[],
  showWaitlist: boolean,
): { gantt: string; recap: string } {
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

  // Smart name: first name only if unique across the day, else "Prénom N."
  const uniqueVols = new Map<string, VolData>()
  for (const s of shifts) for (const reg of s.registrations) {
    const key = reg.volunteer.email ?? ""
    if (!uniqueVols.has(key)) uniqueVols.set(key, reg.volunteer)
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

  // ── Gantt ──────────────────────────────────────────────────────────────────

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

  const showSlots = new Set<number>()
  for (const show of shows) {
    const s0 = Math.round((toMin(show.startTime) - dayStart) / STEP)
    const s1 = Math.min(Math.round((toMin(show.endTime) - dayStart) / STEP), slots.length)
    for (let s = Math.max(0, s0); s < s1; s++) showSlots.add(s)
  }

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

      let s = 0
      const sortedShifts = [...group.shifts].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))
      for (const sh of sortedShifts) {
        const startSlot = Math.round((toMin(sh.startTime) - dayStart) / STEP)
        const endSlot   = Math.min(slots.length, Math.max(startSlot + 1, Math.round((toMin(sh.endTime) - dayStart) / STEP)))
        if (startSlot < s) continue
        while (s < startSlot) {
          const cls = ["empty-cell", slots[s] % 60 === 0 ? "hour-mark" : "", showSlots.has(s) ? "show-active" : ""].filter(Boolean).join(" ")
          row += `<td class="${cls}"></td>`; s++
        }
        const colspan = endSlot - startSlot
        const vols    = smartVolsList(sh.registrations)
        row += colspan > 1
          ? `<td class="shift-cell" colspan="${colspan}">${vols}</td>`
          : `<td class="shift-cell">${vols}</td>`
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

  const ganttHtml = `
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

  // ── Recap ──────────────────────────────────────────────────────────────────

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
    const waitlist = (shift.waitlistEntries ?? [])
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    const waitlistCell = showWaitlist
      ? `<td class="waitlist-cell">${waitlist.length > 0
          ? waitlist.map((e, idx) =>
              `${idx + 1}. ${esc(e.volunteer.firstName)} ${esc(e.volunteer.lastName.charAt(0))}.${e.status === "offered" ? " ✓" : ""}`
            ).join("<br>")
          : ""}</td>`
      : ""
    recapRows += `<tr${cls ? ` class="${cls}"` : ""}>
      <td>${esc(shift.roleName)}</td>
      <td>${esc(lbl)}</td>
      <td class="center">${fmtSlot(toMin(shift.startTime))}</td>
      <td class="center">${fmtSlot(toMin(shift.endTime))}</td>
      <td class="center">${shift.capacity}</td>
      <td class="center">${shift.registrations.length}</td>
      <td>${vols}</td>
      ${waitlistCell}
    </tr>`
  })

  const waitlistHeader = showWaitlist ? `<th class="waitlist-th">File d'attente</th>` : ""
  const recapHtml = `
    <table class="recap-table">
      <thead>
        <tr>
          <th>Poste</th><th>Libellé</th><th class="center">Début</th><th class="center">Fin</th>
          <th class="center">Places</th><th class="center">Inscrits</th><th>Bénévoles</th>
          ${waitlistHeader}
        </tr>
      </thead>
      <tbody>${recapRows}</tbody>
    </table>`

  const dayLabel = `<h3 class="day-sub-title">${fmtDate(date)}</h3>`

  return {
    gantt: `<div class="day-block">${dayLabel}${ganttHtml}</div>`,
    recap: `<div class="day-block">${dayLabel}${recapHtml}</div>`,
  }
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
            where: { status: { in: ["active", "waiting", "offered"] } },
            include: { volunteer: true },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { displayOrder: "asc" }],
      },
    },
  })

  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // ── Build 3 global sections ───────────────────────────────────────────────
  const dayMap = new Map<string, { date: Date; shifts: ShiftRow[] }>()
  for (const shift of event.shifts) {
    const key = shift.date.toISOString().split("T")[0]
    if (!dayMap.has(key)) dayMap.set(key, { date: shift.date, shifts: [] })
    const shiftRow: ShiftRow = {
      ...(shift as unknown as ShiftRow),
      registrations: shift.registrations.filter((r: { status: string }) => r.status === "active"),
      waitlistEntries: shift.registrations
        .filter((r: { status: string }) => r.status === "waiting" || r.status === "offered")
        .map((r: { volunteer: VolData; status: string; waitingPosition?: number | null }) => ({
          volunteer: r.volunteer,
          status: r.status,
          position: r.waitingPosition ?? null,
        })),
    }
    dayMap.get(key)!.shifts.push(shiftRow)
  }

  const showWaitlist = [...dayMap.values()].some(({ shifts }) =>
    shifts.some((s) => s.waitlistEntries.length > 0)
  )

  const showSchedule = (event.showSchedule as ShowEntry[] | null) ?? []

  let allGantts = ""
  let allRecaps = ""
  for (const [key, { date, shifts }] of dayMap) {
    const dayShows = showSchedule.filter((s) => s.date === key)
    const { gantt, recap } = buildDayParts(date, shifts, dayShows, showWaitlist)
    allGantts += gantt
    allRecaps += recap
  }

  const volMap = new Map<string, VolData>()
  for (const shift of event.shifts) {
    for (const reg of shift.registrations) {
      const volEmail = reg.volunteer.email ?? ""
      if (!volMap.has(volEmail)) volMap.set(volEmail, reg.volunteer)
    }
  }
  const allVols = [...volMap.values()].sort((a, b) =>
    a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")
  )
  const volRows = allVols.map((v) => `<tr>
    <td>${esc(v.lastName)}</td>
    <td>${esc(v.firstName)}</td>
    <td>${esc(v.email ?? "")}</td>
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
      font-size: 11px;
      color: #111827;
      background: #fff;
      padding: 20px 24px;
    }

    /* ── Print button ─────────────────────────────────────────────────── */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 2px solid #E5E7EB;
    }
    .print-btn {
      background: #1E40AF;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { background: #1E3A8A; }
    @media print { .toolbar { display: none; } }

    /* ── Header ───────────────────────────────────────────────────────── */
    .event-title { font-size: 17px; font-weight: 700; color: #111827; }
    .event-meta  { font-size: 10px; color: #374151; margin-top: 3px; }

    /* ── Sections ─────────────────────────────────────────────────────── */
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #1E40AF;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 2px solid #BFDBFE;
    }
    .day-block { margin-bottom: 14px; page-break-inside: avoid; }
    .day-sub-title {
      font-size: 11px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 5px;
      text-transform: capitalize;
    }

    /* ── Tables ───────────────────────────────────────────────────────── */
    table { border-collapse: collapse; margin-bottom: 4px; width: 100%; }
    th, td {
      border: 1px solid #9CA3AF;
      padding: 4px 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
    }
    th {
      background: #E5E7EB;
      font-weight: 700;
      font-size: 10px;
      color: #111827;
      white-space: nowrap;
    }
    tr { page-break-inside: avoid; }
    .center { text-align: center; }

    /* ── Gantt ────────────────────────────────────────────────────────── */
    .gantt-table { table-layout: auto; width: auto; }
    .th-role  { min-width: 90px; }
    .th-label { min-width: 100px; }
    .slot-th  {
      min-width: 20px; text-align: center; font-size: 8px;
      color: #374151; border-left: 1px solid #9CA3AF; border-right: 1px solid #9CA3AF;
    }
    .hour-th  { border-left: 2px solid #374151 !important; font-weight: 700; color: #111827; font-size: 9px; }
    .hour-mark { border-left: 2px solid #9CA3AF !important; }

    .role-cell {
      background: #DBEAFE;
      color: #1E3A8A;
      font-weight: 700;
      font-size: 10px;
      border: 1px solid #93C5FD;
      border-top: 2px solid #1E40AF;
      white-space: normal;
    }
    .label-cell {
      background: #DBEAFE;
      color: #1E3A8A;
      font-size: 9px;
      border-right: 1px solid #93C5FD;
      white-space: normal;
    }
    /* Shift cells: darker blue for clear print contrast (survives B&W) */
    .shift-cell {
      background: #1E40AF;
      color: #FFFFFF;
      font-size: 9px;
      font-weight: 600;
      text-align: left;
      vertical-align: top;
      white-space: normal;
      line-height: 1.35;
      border-left: 2px solid #FFFFFF !important;
      border-right: 2px solid #FFFFFF !important;
    }
    .empty-cell { background: #F9FAFB; border-left: 1px solid #D1D5DB; border-right: 1px solid #D1D5DB; }
    .show-active { background: #EFF6FF !important; }
    tr.role-last td { border-bottom: 2px solid #FFFFFF !important; }
    tr.role-last .shift-cell { border-bottom: 2px solid #FFFFFF !important; }

    /* ── Show row ─────────────────────────────────────────────────────── */
    .show-row td { border-top: 2px solid #93C5FD; }
    .show-band-cell {
      background: #DBEAFE;
      color: #1E3A8A;
      font-size: 9px;
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .show-empty-cell { border-left: 1px solid #D1D5DB; border-right: 1px solid #D1D5DB; }
    .show-label-cell { background: #DBEAFE; border: 1px solid #93C5FD; }

    /* ── Recap ────────────────────────────────────────────────────────── */
    .recap-table { width: 100%; }
    .recap-table td { font-size: 10px; white-space: normal; }
    .recap-table th { font-size: 10px; }
    .role-start td { border-top: 2px solid #374151 !important; }
    .role-end   td { border-bottom: 2px solid #374151 !important; }

    /* ── File d'attente ──────────────────────────────────────────────── */
    .waitlist-th  { color: #78350F; background: #FEF3C7 !important; min-width: 120px; font-size: 10px; }
    .waitlist-cell { font-size: 9px; font-style: italic; color: #374151; white-space: normal; vertical-align: top; }

    /* ── Bénévoles ────────────────────────────────────────────────────── */
    .vol-table { width: 100%; }
    .vol-table td { font-size: 10px; white-space: normal; word-break: break-word; }
    .vol-table th { font-size: 10px; }

    /* ── Page breaks ──────────────────────────────────────────────────── */
    .section-planning { page-break-after: always; }
    .section-recap    { page-break-after: always; }

    /* ── Page setup ───────────────────────────────────────────────────── */
    /* Planning section: landscape for wide Gantt tables */
    @page          { size: A4 portrait;  margin: 1cm 1.2cm; }
    @page planning { size: A4 landscape; margin: 1cm 1.5cm; }
    @page recap    { size: A4 portrait;  margin: 1cm 1.2cm; }
    @page vols     { size: A4 portrait;  margin: 1cm 1.2cm; }

    .section-planning { page: planning; }
    .section-recap    { page: recap; }
    .section-vols     { page: vols; }

    @media print {
      body { padding: 0; }
      .section-title { color: #000 !important; border-bottom-color: #000 !important; }
    }

    /* ── Print color fallback (force background printing) ─────────────── */
    @media print {
      .role-cell, .label-cell, .show-band-cell, .show-label-cell { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .shift-cell { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .empty-cell, .show-active { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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

  <section class="section section-planning" aria-label="Planning">
    <h2 class="section-title">Planning</h2>
    ${allGantts}
  </section>

  <section class="section section-recap" aria-label="Récap par poste">
    <h2 class="section-title">Récap par poste</h2>
    ${allRecaps}
  </section>

  <section class="section section-vols" aria-label="Liste des bénévoles">
    <h2 class="section-title">Liste des bénévoles</h2>
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
