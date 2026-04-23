import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

type VolData = { firstName: string; lastName: string; email: string; phone: string | null }
type RegData  = { volunteer: VolData; comment: string | null; source: string }
type ShiftRow = {
  id: string; roleName: string; label: string; date: Date
  startTime: string; endTime: string; capacity: number; status: string
  registrations: RegData[]
}

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

function buildDayHtml(date: Date, shifts: ShiftRow[]): string {
  const allMins = shifts.flatMap((s) => [toMin(s.startTime), toMin(s.endTime)])
  const dayStart = Math.floor(Math.min(...allMins) / 30) * 30
  const dayEnd   = Math.ceil(Math.max(...allMins)  / 30) * 30

  const slots: number[] = []
  for (let t = dayStart; t < dayEnd; t += 30) slots.push(t)

  const roleOrder: string[] = []
  for (const s of shifts) if (!roleOrder.includes(s.roleName)) roleOrder.push(s.roleName)
  const sorted = [...shifts].sort((a, b) => {
    const ri = roleOrder.indexOf(a.roleName) - roleOrder.indexOf(b.roleName)
    return ri !== 0 ? ri : a.startTime.localeCompare(b.startTime)
  })

  // ── Gantt ────────────────────────────────────────────────────────────────
  let ganttRows = ""
  let i = 0
  while (i < sorted.length) {
    const role = sorted[i].roleName
    let j = i + 1
    while (j < sorted.length && sorted[j].roleName === role) j++
    const span = j - i

    for (let k = i; k < j; k++) {
      const shift = sorted[k]
      const startSlot = (toMin(shift.startTime) - dayStart) / 30
      const endSlot   = (toMin(shift.endTime)   - dayStart) / 30
      const colspan   = endSlot - startSlot
      const vols      = shift.registrations.map((r) => shortName(r.volunteer)).join(", ") || "—"
      const isLastInRole = k === j - 1

      let row = `<tr class="${isLastInRole ? "role-last" : ""}">`

      if (k === i) {
        row += `<td class="role-cell" rowspan="${span}">${esc(role)}</td>`
      }

      const lbl = shift.label !== shift.roleName ? shift.label : ""
      row += `<td class="label-cell">${esc(lbl)}</td>`

      for (let s = 0; s < slots.length; ) {
        if (s < startSlot) {
          row += `<td class="empty-cell"></td>`
          s++
        } else if (s === startSlot) {
          row += `<td class="shift-cell" colspan="${colspan}">${esc(vols)}</td>`
          s = endSlot
        } else {
          row += `<td class="empty-cell"></td>`
          s++
        }
      }

      row += "</tr>"
      ganttRows += row
    }

    i = j
  }

  const slotHeaders = slots.map((s) => `<th class="slot-th">${fmtSlot(s)}</th>`).join("")

  const gantt = `
    <table class="gantt-table">
      <thead>
        <tr>
          <th class="th-role">Rôle</th>
          <th class="th-label">Libellé</th>
          ${slotHeaders}
        </tr>
      </thead>
      <tbody>${ganttRows}</tbody>
    </table>`

  // ── Recap ────────────────────────────────────────────────────────────────
  let recapRows = ""
  for (const shift of sorted) {
    const vols = shift.registrations.map((r) => shortName(r.volunteer)).join(", ") || "—"
    const lbl  = shift.label !== shift.roleName ? shift.label : ""
    recapRows += `<tr>
      <td>${esc(shift.roleName)}</td>
      <td>${esc(lbl)}</td>
      <td class="center">${fmtSlot(toMin(shift.startTime))}–${fmtSlot(toMin(shift.endTime))}</td>
      <td class="center">${shift.capacity}</td>
      <td class="center">${shift.registrations.length}</td>
      <td>${esc(vols)}</td>
    </tr>`
  }

  const recap = `
    <table class="recap-table">
      <thead>
        <tr>
          <th>Poste</th><th>Libellé</th><th class="center">Horaires</th>
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
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      shifts: {
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

  let daySections = ""
  for (const [, { date, shifts }] of dayMap) {
    daySections += buildDayHtml(date, shifts)
  }

  // ── Inscriptions section ─────────────────────────────────────────────────
  let inscRows = ""
  for (const shift of event.shifts) {
    const day   = fmtDate(shift.date)
    const hours = `${fmtSlot(toMin(shift.startTime))}–${fmtSlot(toMin(shift.endTime))}`
    if (shift.registrations.length === 0) {
      inscRows += `<tr>
        <td>${esc(day)}</td><td class="center">${hours}</td>
        <td>${esc(shift.roleName)}</td><td>${esc(shift.label)}</td>
        <td colspan="4" class="center text-muted">—</td>
      </tr>`
    } else {
      for (const reg of shift.registrations) {
        inscRows += `<tr>
          <td>${esc(day)}</td><td class="center">${hours}</td>
          <td>${esc(shift.roleName)}</td><td>${esc(shift.label)}</td>
          <td>${esc(reg.volunteer.firstName)} ${esc(reg.volunteer.lastName)}</td>
          <td>${esc(reg.volunteer.email)}</td>
          <td>${esc(reg.volunteer.phone ?? "")}</td>
          <td>${esc(reg.comment ?? "")}</td>
        </tr>`
      }
    }
  }

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
    table { border-collapse: collapse; width: 100%; margin-bottom: 4px; }
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
    .slot-th  { min-width: 36px; text-align: center; font-size: 8px; color: #6B7280; }

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
      text-align: center;
      border-left: 2px solid #6366F1;
      border-right: 2px solid #6366F1;
    }
    .empty-cell { background: #FAFAFA; }
    tr.role-last td { border-bottom: 2px solid #6366F1 !important; }

    /* ── Recap ────────────────────────────────────────────────────────── */
    .recap-table td, .recap-table th { font-size: 9px; }

    /* ── Inscriptions ─────────────────────────────────────────────────── */
    .insc-section { margin-top: 32px; page-break-before: always; }
    .insc-title {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    .insc-table td, .insc-table th { white-space: nowrap; font-size: 9px; }

    /* ── Page setup ───────────────────────────────────────────────────── */
    @page { size: A4 landscape; margin: 1.2cm 1cm; }
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

  <section class="insc-section">
    <h2 class="insc-title">Inscriptions complètes</h2>
    <table class="insc-table">
      <thead>
        <tr>
          <th>Jour</th><th class="center">Horaires</th><th>Rôle</th><th>Libellé</th>
          <th>Prénom Nom</th><th>Email</th><th>Téléphone</th><th>Commentaire</th>
        </tr>
      </thead>
      <tbody>${inscRows}</tbody>
    </table>
  </section>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
