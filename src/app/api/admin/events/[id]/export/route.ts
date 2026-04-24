import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"

// ── Types ────────────────────────────────────────────────────────────────────

type VolData = { firstName: string; lastName: string; email: string; phone: string | null }
type RegData  = { volunteer: VolData; comment: string | null; source: string }
type ShiftRow = {
  id: string; roleName: string; label: string; date: Date
  startTime: string; endTime: string; capacity: number; status: string
  registrations: RegData[]
}
type ShowEntry = { name: string; date: string; startTime: string; endTime: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Style constants ───────────────────────────────────────────────────────────

const C_BORDER  = "FFD1D5DB" // gray-300
const C_STRONG  = "FF9CA3AF" // gray-400
const C_INDIGO  = "FF6366F1" // indigo-500
const C_ROLE_BG = "FFEEF2FF" // indigo-50
const C_SLOT_BG = "FFE0E7FF" // indigo-100
const C_HEAD_BG = "FFF3F4F6" // gray-100

const thin   = (c = C_BORDER): ExcelJS.BorderStyle => "thin"   // eslint-disable-line @typescript-eslint/no-unused-vars
const medium = (): ExcelJS.BorderStyle => "medium"              // eslint-disable-line @typescript-eslint/no-unused-vars

function b(style: ExcelJS.BorderStyle, argb = C_BORDER): ExcelJS.Border {
  return { style, color: { argb } }
}

const THIN_ALL = { top: b("thin"), left: b("thin"), bottom: b("thin"), right: b("thin") }
const HEAD_BORDER = {
  top: b("medium", C_STRONG), left: b("medium", C_STRONG),
  bottom: b("medium", C_STRONG), right: b("medium", C_STRONG),
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } }
}

// ── Day sheet builder ─────────────────────────────────────────────────────────

function buildDaySheet(wb: ExcelJS.Workbook, name: string, shifts: ShiftRow[], shows: ShowEntry[]) {
  const ws = wb.addWorksheet(name)

  const allMins = [
    ...shifts.flatMap((s) => [toMin(s.startTime), toMin(s.endTime)]),
    ...shows.flatMap((s) => [toMin(s.startTime), toMin(s.endTime)]),
  ]
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

  const T0 = 3 // 1-indexed: col1=Rôle, col2=Libellé, col3+=slots
  const totalCols = 2 + slots.length

  ws.columns = [
    { width: 18 },
    { width: 26 },
    ...slots.map(() => ({ width: 6.5 })),
  ]

  // ── Gantt header ───────────────────────────────────────────────────────────
  const hRow = ws.addRow(["Rôle", "Libellé", ...slots.map(fmtSlot)])
  hRow.height = 18
  hRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font      = { bold: true, size: 9, color: { argb: "FF374151" } }
    cell.fill      = solidFill(C_HEAD_BG)
    cell.alignment = { horizontal: col >= T0 ? "center" : "left", vertical: "middle" }
    cell.border    = {
      top:    b("medium", C_STRONG),
      bottom: b("medium", C_STRONG),
      left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
      right:  col === totalCols ? b("medium", C_STRONG) : b("thin"),
    }
  })

  // Group by (roleName, label) — one Gantt row per group
  type LabelGroup = { roleName: string; label: string; shifts: ShiftRow[] }
  const groups: LabelGroup[] = []
  const groupMap = new Map<string, LabelGroup>()
  for (const shift of sorted) {
    const key = `${shift.roleName}\0${shift.label}`
    if (!groupMap.has(key)) {
      const g: LabelGroup = { roleName: shift.roleName, label: shift.label, shifts: [] }
      groups.push(g)
      groupMap.set(key, g)
    }
    groupMap.get(key)!.shifts.push(shift)
  }

  // ── Gantt rows ─────────────────────────────────────────────────────────────
  groups.forEach((group, idx) => {
    const rowNum       = idx + 2
    const isNewRole    = idx === 0 || groups[idx - 1].roleName !== group.roleName
    const nextSameRole = idx < groups.length - 1 && groups[idx + 1].roleName === group.roleName

    const maxPax = Math.max(1, ...group.shifts.map((s) => s.registrations.length))
    const row = ws.addRow(new Array(totalCols).fill(null))
    row.height = Math.max(20, maxPax * 12)

    // Role cell
    const roleCell = row.getCell(1)
    roleCell.value     = isNewRole ? group.roleName : null
    roleCell.font      = { bold: true, size: 9, color: { argb: "FF4338CA" } }
    roleCell.fill      = solidFill(C_ROLE_BG)
    roleCell.alignment = { vertical: "middle", wrapText: false }
    roleCell.border    = {
      top:    isNewRole    ? b("medium", C_INDIGO) : b("thin", C_ROLE_BG),
      bottom: nextSameRole ? b("thin",  C_ROLE_BG) : b("medium", C_INDIGO),
      left:   b("medium", C_INDIGO),
      right:  b("thin"),
    }

    // Label cell
    const labelCell = row.getCell(2)
    labelCell.value     = group.label !== group.roleName ? group.label : null
    labelCell.font      = { size: 9, color: { argb: "FF6B7280" } }
    labelCell.fill      = solidFill(C_ROLE_BG)
    labelCell.alignment = { vertical: "middle" }
    labelCell.border    = {
      top:    isNewRole    ? b("medium", C_INDIGO) : b("thin"),
      bottom: nextSameRole ? b("thin")             : b("medium", C_INDIGO),
      left:   b("thin"),
      right:  b("thin"),
    }

    // Mark occupied slots
    const occupiedSlots = new Set<number>()
    for (const sh of group.shifts) {
      const s0 = (toMin(sh.startTime) - dayStart) / 30
      const s1 = (toMin(sh.endTime)   - dayStart) / 30
      for (let s = s0; s < s1; s++) occupiedSlots.add(s)
    }

    // Empty slot borders
    for (let s = 0; s < slots.length; s++) {
      if (!occupiedSlots.has(s)) {
        const col  = T0 + s
        const cell = row.getCell(col)
        cell.border = {
          top:    isNewRole    ? b("medium", C_STRONG) : b("thin", "FFF3F4F6"),
          bottom: nextSameRole ? b("thin", "FFF3F4F6") : b("medium", C_STRONG),
          left:   b("thin", "FFF3F4F6"),
          right:  col === totalCols ? b("medium", C_STRONG) : b("thin", "FFF3F4F6"),
        }
      }
    }

    // One block per shift in the group
    for (const shift of group.shifts) {
      const startSlot = (toMin(shift.startTime) - dayStart) / 30
      const endSlot   = (toMin(shift.endTime)   - dayStart) / 30

      const vols = [...shift.registrations]
        .sort((a, b) => a.volunteer.firstName.localeCompare(b.volunteer.firstName, "fr"))
        .map((r) => shortName(r.volunteer))
        .join("\n") || "—"

      for (let s = startSlot; s < endSlot; s++) {
        const col  = T0 + s
        const cell = row.getCell(col)
        cell.fill   = solidFill(C_SLOT_BG)
        cell.border = {
          top:    isNewRole    ? b("medium", C_INDIGO) : b("thin", C_SLOT_BG),
          bottom: nextSameRole ? b("thin",  C_SLOT_BG) : b("medium", C_INDIGO),
          left:   s === startSlot   ? b("medium", C_INDIGO) : b("thin", C_SLOT_BG),
          right:  s === endSlot - 1 ? b("medium", C_INDIGO) : (col === totalCols ? b("medium", C_STRONG) : b("thin", C_SLOT_BG)),
        }
      }

      const startCell = row.getCell(T0 + startSlot)
      startCell.value     = vols
      startCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
      startCell.font      = { size: 8, color: { argb: "FF3730A3" } }

      if (endSlot - startSlot > 1) {
        ws.mergeCells(rowNum, T0 + startSlot, rowNum, T0 + endSlot - 1)
      }
    }
  })

  // Vertical merge for role column
  let i = 0
  while (i < groups.length) {
    const role = groups[i].roleName
    let j = i + 1
    while (j < groups.length && groups[j].roleName === role) j++
    if (j - i > 1) {
      ws.mergeCells(i + 2, 1, j + 1, 1)
      ws.getCell(i + 2, 1).alignment = { vertical: "middle" }
    }
    i = j
  }

  // ── Show row ─────────────────────────────────────────────────────────────
  if (shows.length > 0) {
    const showRowNum = groups.length + 2
    const sRow = ws.addRow(new Array(totalCols).fill(null))
    sRow.height = 14

    // Merge role + label cells
    ws.mergeCells(showRowNum, 1, showRowNum, 2)
    const labelCell = sRow.getCell(1)
    labelCell.fill   = solidFill("FFF5F3FF")
    labelCell.border = { top: b("medium", "FFC7D2FE"), bottom: b("thin", "FFE0E7FF"), left: b("thin"), right: b("thin") }

    // Show bands and empty cells
    const occupied = new Set<number>()
    for (const show of shows) {
      const s0 = Math.round((toMin(show.startTime) - dayStart) / 30)
      const s1 = Math.min(Math.round((toMin(show.endTime) - dayStart) / 30), slots.length)
      for (let s = s0; s < s1; s++) occupied.add(s)

      const startCell = sRow.getCell(T0 + s0)
      startCell.value     = `🎪 ${show.name}`
      startCell.font      = { size: 8, italic: true, color: { argb: "FF4338CA" } }
      startCell.fill      = solidFill("FFEEF2FF")
      startCell.alignment = { horizontal: "center", vertical: "middle" }
      startCell.border    = { top: b("medium", "FFC7D2FE"), bottom: b("thin", "FFE0E7FF"), left: b("medium", C_INDIGO), right: b("medium", C_INDIGO) }

      if (s1 - s0 > 1) {
        ws.mergeCells(showRowNum, T0 + s0, showRowNum, T0 + s1 - 1)
      }
    }

    for (let s = 0; s < slots.length; s++) {
      if (!occupied.has(s)) {
        const cell = sRow.getCell(T0 + s)
        cell.fill   = solidFill("FFF5F3FF")
        cell.border = { top: b("medium", "FFC7D2FE"), bottom: b("thin", "FFE0E7FF"), left: b("thin"), right: T0 + s === totalCols ? b("medium", C_STRONG) : b("thin") }
      }
    }
  }

  // ── Recap section ──────────────────────────────────────────────────────────
  ws.addRow([])
  ws.addRow([])

  const titleRow = ws.addRow(["RÉCAP PAR POSTE"])
  titleRow.height = 16
  titleRow.getCell(1).font = { bold: true, size: 10, color: { argb: "FF374151" } }

  const recapCols = ["Poste", "Libellé", "Horaires", "Places", "Inscrits", "Bénévoles"]
  const rhRow = ws.addRow(recapCols)
  rhRow.height = 18
  rhRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font      = { bold: true, size: 9, color: { argb: "FF374151" } }
    cell.fill      = solidFill(C_HEAD_BG)
    cell.alignment = { horizontal: col >= 3 ? "center" : "left", vertical: "middle" }
    cell.border    = {
      top:    b("medium", C_STRONG),
      bottom: b("medium", C_STRONG),
      left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
      right:  col === 6 ? b("medium", C_STRONG) : b("thin"),
    }
  })

  sorted.forEach((shift, idx) => {
    const isLast = idx === sorted.length - 1
    const vols   = [...shift.registrations]
      .sort((a, b) => a.volunteer.firstName.localeCompare(b.volunteer.firstName, "fr"))
      .map((r) => shortName(r.volunteer))
      .join("\n") || "—"
    const dRow = ws.addRow([
      shift.roleName,
      shift.label !== shift.roleName ? shift.label : "",
      `${fmtSlot(toMin(shift.startTime))}–${fmtSlot(toMin(shift.endTime))}`,
      shift.capacity,
      shift.registrations.length,
      vols,
    ])
    dRow.height = Math.max(16, shift.registrations.length * 12 || 16)
    dRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font      = { size: 9 }
      cell.alignment = {
        vertical: "middle",
        horizontal: col >= 3 && col <= 5 ? "center" : "left",
        wrapText: col === 6,
      }
      cell.border    = {
        top:    b("thin"),
        bottom: isLast ? b("medium", C_STRONG) : b("thin"),
        left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
        right:  col === 6 ? b("medium", C_STRONG) : b("thin"),
      }
    })
  })
}

// ── Main handler ─────────────────────────────────────────────────────────────

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

  const wb = new ExcelJS.Workbook()
  wb.creator  = "Bénévoles"
  wb.created  = new Date()

  // One sheet per day
  const dayMap = new Map<string, { date: Date; shifts: ShiftRow[] }>()
  for (const shift of event.shifts) {
    const key = shift.date.toISOString().split("T")[0]
    if (!dayMap.has(key)) dayMap.set(key, { date: shift.date, shifts: [] })
    dayMap.get(key)!.shifts.push(shift as ShiftRow)
  }

  const showSchedule = (event.showSchedule as ShowEntry[] | null) ?? []

  for (const [key, { date, shifts }] of dayMap) {
    const name = date
      .toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
      .replace(/\./g, "").trim().slice(0, 31)
    const dayShows = showSchedule.filter((s) => s.date === key)
    buildDaySheet(wb, name, shifts, dayShows)
  }

  // ── Inscriptions sheet ────────────────────────────────────────────────────
  const wsI = wb.addWorksheet("Inscriptions")
  wsI.columns = [
    { width: 28 }, { width: 7 },  { width: 7 },  { width: 16 },
    { width: 30 }, { width: 10 }, { width: 14 }, { width: 14 },
    { width: 28 }, { width: 14 }, { width: 28 }, { width: 12 },
  ]

  const iHeaders = [
    "Jour", "Début", "Fin", "Rôle", "Libellé", "Statut",
    "Prénom", "Nom", "Email", "Téléphone", "Commentaire", "Source",
  ]
  const ihRow = wsI.addRow(iHeaders)
  ihRow.height = 18
  ihRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font      = { bold: true, size: 9 }
    cell.fill      = solidFill(C_HEAD_BG)
    cell.alignment = { vertical: "middle" }
    cell.border    = {
      top:    b("medium", C_STRONG),
      bottom: b("medium", C_STRONG),
      left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
      right:  col === 12 ? b("medium", C_STRONG) : b("thin"),
    }
  })

  const iRows: (string | number)[][] = []
  for (const shift of event.shifts) {
    const day   = fmtDate(shift.date)
    const start = fmtSlot(toMin(shift.startTime))
    const end   = fmtSlot(toMin(shift.endTime))
    if (shift.registrations.length === 0) {
      iRows.push([day, start, end, shift.roleName, shift.label, shift.status, "", "", "", "", "", ""])
    } else {
      for (const reg of shift.registrations) {
        iRows.push([
          day, start, end, shift.roleName, shift.label, shift.status,
          reg.volunteer.firstName, reg.volunteer.lastName, reg.volunteer.email,
          reg.volunteer.phone ?? "", reg.comment ?? "", reg.source,
        ])
      }
    }
  }

  iRows.forEach((data, idx) => {
    const isLast = idx === iRows.length - 1
    const row    = wsI.addRow(data)
    row.height   = 15
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font      = { size: 9 }
      cell.alignment = { vertical: "middle" }
      cell.border    = {
        top:    b("thin"),
        bottom: isLast ? b("medium", C_STRONG) : b("thin"),
        left:   col === 1  ? b("medium", C_STRONG) : b("thin"),
        right:  col === 12 ? b("medium", C_STRONG) : b("thin"),
      }
    })
  })

  const buf = Buffer.from(await wb.xlsx.writeBuffer())

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16)
  const filename = `${event.slug}-${ts}.xlsx`

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
