import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
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

  // Compute duplicate first names across all volunteers in this day
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

  const T0 = 3 // 1-indexed: col1=Rôle, col2=Libellé, col3+=slots
  const totalCols = 2 + slots.length

  ws.columns = [
    { width: 18 },
    { width: 26 },
    ...slots.map(() => ({ width: 4 })),
  ]

  // ── Gantt header ───────────────────────────────────────────────────────────
  const hRow = ws.addRow(["Rôle", "Libellé", ...slots.map(s => s % 60 === 0 ? fmtSlot(s) : "")])
  hRow.height = 18
  hRow.eachCell({ includeEmpty: true }, (cell, col) => {
    const isHourCol = col >= T0 && slots[col - T0] % 60 === 0
    cell.font      = { bold: true, size: 9, color: { argb: "FF374151" } }
    cell.fill      = solidFill(C_HEAD_BG)
    cell.alignment = { horizontal: col >= T0 ? "center" : "left", vertical: "middle" }
    cell.border    = {
      top:    b("medium", C_STRONG),
      bottom: b("medium", C_STRONG),
      left:   col === 1 ? b("medium", C_STRONG) : (isHourCol ? b("medium", C_STRONG) : b("thin")),
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

  // Pre-compute slots covered by shows (for background highlight)
  const showSlots = new Set<number>()
  for (const show of shows) {
    const s0 = Math.round((toMin(show.startTime) - dayStart) / STEP)
    const s1 = Math.min(Math.round((toMin(show.endTime) - dayStart) / STEP), slots.length)
    for (let s = Math.max(0, s0); s < s1; s++) showSlots.add(s)
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
      const s0 = Math.round((toMin(sh.startTime) - dayStart) / STEP)
      const s1 = Math.min(slots.length, Math.max(s0 + 1, Math.round((toMin(sh.endTime) - dayStart) / STEP)))
      for (let s = s0; s < s1; s++) occupiedSlots.add(s)
    }

    // Empty slot borders (show background when show is active)
    for (let s = 0; s < slots.length; s++) {
      if (!occupiedSlots.has(s)) {
        const col  = T0 + s
        const cell = row.getCell(col)
        if (showSlots.has(s)) cell.fill = solidFill("FFF5F3FF")
        cell.border = {
          top:    isNewRole    ? b("medium", C_STRONG) : b("thin", "FFF3F4F6"),
          bottom: nextSameRole ? b("thin", "FFF3F4F6") : b("medium", C_STRONG),
          left:   slots[s] % 60 === 0 ? b("medium", C_BORDER) : b("thin", "FFF3F4F6"),
          right:  col === totalCols ? b("medium", C_STRONG) : b("thin", "FFF3F4F6"),
        }
      }
    }

    // One block per shift in the group — sort + skip overlaps to avoid duplicate mergeCells
    let cursor = 0
    const sortedGroupShifts = [...group.shifts].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))
    for (const shift of sortedGroupShifts) {
      const startSlot = Math.round((toMin(shift.startTime) - dayStart) / STEP)
      const endSlot   = Math.min(slots.length, Math.max(startSlot + 1, Math.round((toMin(shift.endTime) - dayStart) / STEP)))
      if (startSlot < cursor) continue

      const vols = [...shift.registrations]
        .sort((a, b) => a.volunteer.firstName.localeCompare(b.volunteer.firstName, "fr"))
        .map((r) => smartName(r.volunteer))
        .join("\n") || "—"

      for (let s = startSlot; s < endSlot; s++) {
        const col  = T0 + s
        const cell = row.getCell(col)
        cell.fill   = solidFill(C_SLOT_BG)
        cell.border = {
          top:    isNewRole    ? b("medium", C_INDIGO) : b("thin", C_SLOT_BG),
          bottom: nextSameRole ? b("thin",  C_SLOT_BG) : b("medium", C_INDIGO),
          left:   s === startSlot ? b("medium", C_INDIGO) : (slots[s] % 60 === 0 ? b("medium", C_BORDER) : b("thin", C_SLOT_BG)),
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
      cursor = endSlot
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

    // Show bands and empty cells — sort + skip overlaps
    const occupied = new Set<number>()
    let showCursor = 0
    for (const show of [...shows].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))) {
      const s0 = Math.round((toMin(show.startTime) - dayStart) / STEP)
      const s1 = Math.min(Math.round((toMin(show.endTime) - dayStart) / STEP), slots.length)
      if (s0 < showCursor) continue
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
      showCursor = s1
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

  // One row per volunteer — cols 1-5 merged across volunteers for the same shift
  // Role order preserved from roleOrder (Gantt order = chronological first appearance)
  let recapRowNum = ws.rowCount + 1

  sorted.forEach((shift, shiftIdx) => {
    const isLastShift  = shiftIdx === sorted.length - 1
    const isFirstRole  = shiftIdx === 0 || sorted[shiftIdx - 1].roleName !== shift.roleName
    const isLastRole   = isLastShift || sorted[shiftIdx + 1].roleName !== shift.roleName
    const volNames = [...shift.registrations]
      .sort((a, b) => a.volunteer.firstName.localeCompare(b.volunteer.firstName, "fr"))
      .map((r) => shortName(r.volunteer))
    const rowCount = Math.max(1, volNames.length)
    const firstRow = recapRowNum

    for (let vi = 0; vi < rowCount; vi++) {
      const isFirstVol = vi === 0
      const isLastVol  = vi === rowCount - 1
      const dRow = ws.addRow([
        isFirstVol ? shift.roleName : null,
        isFirstVol ? (shift.label !== shift.roleName ? shift.label : "") : null,
        isFirstVol ? `${fmtSlot(toMin(shift.startTime))}–${fmtSlot(toMin(shift.endTime))}` : null,
        isFirstVol ? shift.capacity : null,
        isFirstVol ? shift.registrations.length : null,
        volNames[vi] ?? (isFirstVol ? "—" : null),
      ])
      dRow.height = 15
      dRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font      = { size: 9 }
        cell.alignment = { vertical: "middle", horizontal: col >= 3 && col <= 5 ? "center" : "left" }
        const topRole    = isFirstVol && isFirstRole && shiftIdx > 0
        const bottomRole = isLastVol  && isLastRole
        cell.border    = {
          top:    topRole    ? b("medium", C_STRONG) : (isFirstVol ? b("thin") : b("thin", "FFFAFAFA")),
          bottom: bottomRole ? b("medium", C_STRONG) : (isLastVol  ? b("thin") : b("thin", "FFFAFAFA")),
          left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
          right:  col === 6 ? b("medium", C_STRONG) : b("thin"),
        }
      })
      recapRowNum++
    }

    if (rowCount > 1) {
      for (let col = 1; col <= 5; col++) {
        ws.mergeCells(firstRow, col, firstRow + rowCount - 1, col)
        const master = ws.getCell(firstRow, col)
        master.border = {
          top:    isFirstRole && shiftIdx > 0 ? b("medium", C_STRONG) : b("thin"),
          bottom: isLastRole ? b("medium", C_STRONG) : b("thin"),
          left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
          right:  b("thin"),
        }
        master.alignment = { vertical: "middle", horizontal: col >= 3 && col <= 5 ? "center" : "left" }
      }
    }
  })
}

// ── Main handler ─────────────────────────────────────────────────────────────

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
    { width: 28 }, { width: 12 },
  ]

  const iHeaders = ["Jour", "Début", "Fin", "Rôle", "Libellé", "Statut", "Prénom", "Nom", "Commentaire", "Source"]
  const INSC_COLS = iHeaders.length
  const ihRow = wsI.addRow(iHeaders)
  ihRow.height = 18
  ihRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font      = { bold: true, size: 9 }
    cell.fill      = solidFill(C_HEAD_BG)
    cell.alignment = { vertical: "middle" }
    cell.border    = {
      top:    b("medium", C_STRONG),
      bottom: b("medium", C_STRONG),
      left:   col === 1         ? b("medium", C_STRONG) : b("thin"),
      right:  col === INSC_COLS ? b("medium", C_STRONG) : b("thin"),
    }
  })

  const iRows: (string | number)[][] = []
  for (const shift of event.shifts) {
    const day   = fmtDate(shift.date)
    const start = fmtSlot(toMin(shift.startTime))
    const end   = fmtSlot(toMin(shift.endTime))
    const sortedRegs = [...shift.registrations].sort((a, b) =>
      a.volunteer.firstName.localeCompare(b.volunteer.firstName, "fr")
    )
    if (sortedRegs.length === 0) {
      iRows.push([day, start, end, shift.roleName, shift.label, shift.status, "", "", "", ""])
    } else {
      for (const reg of sortedRegs) {
        iRows.push([
          day, start, end, shift.roleName, shift.label, shift.status,
          reg.volunteer.firstName, reg.volunteer.lastName, reg.comment ?? "", reg.source,
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
        left:   col === 1         ? b("medium", C_STRONG) : b("thin"),
        right:  col === INSC_COLS ? b("medium", C_STRONG) : b("thin"),
      }
    })
  })

  // ── Bénévoles sheet ───────────────────────────────────────────────────────
  const wsV = wb.addWorksheet("Bénévoles")
  wsV.columns = [{ width: 16 }, { width: 18 }, { width: 32 }, { width: 18 }]

  const vHeaders = ["Nom", "Prénom", "Email", "Téléphone"]
  const vhRow = wsV.addRow(vHeaders)
  vhRow.height = 18
  vhRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font      = { bold: true, size: 9 }
    cell.fill      = solidFill(C_HEAD_BG)
    cell.alignment = { vertical: "middle" }
    cell.border    = {
      top:    b("medium", C_STRONG),
      bottom: b("medium", C_STRONG),
      left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
      right:  col === 4 ? b("medium", C_STRONG) : b("thin"),
    }
  })

  const volMap = new Map<string, VolData>()
  for (const shift of event.shifts) {
    for (const reg of shift.registrations) {
      if (!volMap.has(reg.volunteer.email)) volMap.set(reg.volunteer.email, reg.volunteer)
    }
  }
  const allVols = [...volMap.values()].sort((a, b) =>
    a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")
  )

  allVols.forEach((vol, idx) => {
    const isLast = idx === allVols.length - 1
    const row    = wsV.addRow([vol.lastName, vol.firstName, vol.email, vol.phone ?? ""])
    row.height   = 15
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font      = { size: 9 }
      cell.alignment = { vertical: "middle" }
      cell.border    = {
        top:    b("thin"),
        bottom: isLast ? b("medium", C_STRONG) : b("thin"),
        left:   col === 1 ? b("medium", C_STRONG) : b("thin"),
        right:  col === 4 ? b("medium", C_STRONG) : b("thin"),
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
