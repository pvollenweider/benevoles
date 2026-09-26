/**
 * Pure HTML-fragment builder for the admin PDF export's per-day Gantt + recap tables
 * (src/app/api/admin/events/[id]/export/pdf/route.ts). Split out into its own module, with no
 * Next.js or auth imports, so it can be unit-tested directly — importing the route file itself
 * pulls in next-auth (via requireOrgSession), which fails to resolve in vitest's plain node
 * environment.
 */
import { toMin, toMinEnd } from "@/lib/gantt-utils"

export type VolData       = { firstName: string; lastName: string; email: string | null; phone: string | null }
export type RegData       = { volunteer: VolData; comment: string | null; source: string }
export type WaitlistEntry = { volunteer: VolData; status: string; position: number | null }
export type ShiftRow = {
  id: string; roleName: string; label: string; date: Date
  startTime: string; endTime: string; capacity: number; status: string
  displayOrder: number
  registrations: RegData[]
  waitlistEntries: WaitlistEntry[]
}
export type ShowEntry = { name: string; date: string; startTime: string; endTime: string }

// `mins` is minutes since the export's day-relative start and can exceed 1440 — both a raw slot
// position on the axis when the day's shifts run past midnight, and a shift's own endTime read as
// "HH:MM" when it's stored with an hour above 23 (e.g. "26:00" for 2am the next morning, the same
// overnight convention `fmt()` in gantt-utils.ts already reads modulo 24 — see its own comment).
// Without the wrap here, the axis header and the recap table's Début/Fin columns printed the raw
// hour past 24 ("24h", "25h", "26h") instead of wrapping back to "00h", "01h", "02h".
function fmtSlot(mins: number) {
  const h = Math.floor(mins / 60) % 24
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
export function buildDayParts(
  date: Date,
  shifts: ShiftRow[],
  shows: ShowEntry[],
  showWaitlist: boolean,
): { gantt: string; recap: string } {
  // toMinEnd (not a raw toMin) for every end time: an overnight shift's end (e.g. "02:00") is a
  // small raw minute value with no +1440 rollover, which used to drag dayStart toward 0 and
  // dayEnd toward the end of the day — reproducing a full 00:00–24:00 range whenever an
  // overnight shift landed on the exported day, instead of the intended day.startTime-day.endTime
  // bound (#221).
  const allMins = [
    ...shifts.flatMap((s) => [toMin(s.startTime), toMinEnd(s.endTime, s.startTime)]),
    ...shows.flatMap((s) => [toMin(s.startTime), toMinEnd(s.endTime, s.startTime)]),
  ]
  const STEP = 15
  const dayStart = Math.floor(Math.min(...allMins) / STEP) * STEP
  const dayEnd   = Math.ceil(Math.max(...allMins)  / STEP) * STEP

  const slots: number[] = []
  for (let t = dayStart; t < dayEnd; t += STEP) slots.push(t)

  // Role order must follow "Réordonner les postes" (Shift.displayOrder, set uniformly per role —
  // see reorder-roles/route.ts), not first chronological appearance: the shifts array here is
  // sorted primarily by date/startTime (see the Prisma query in route.ts), so building roleOrder
  // by first-appearance-in-that-array silently ignored the admin's chosen order whenever a
  // later-listed role's shift happened to start earlier in the day (#222). Falls back to first
  // appearance for roles that were never reordered (displayOrder defaults to 0 for all of them).
  const roleFirstIndex = new Map<string, number>()
  const roleMinOrder = new Map<string, number>()
  shifts.forEach((s, i) => {
    if (!roleFirstIndex.has(s.roleName)) roleFirstIndex.set(s.roleName, i)
    roleMinOrder.set(s.roleName, Math.min(roleMinOrder.get(s.roleName) ?? Infinity, s.displayOrder ?? 0))
  })
  const roleOrder = [...roleFirstIndex.keys()].sort((a, b) => {
    const d = (roleMinOrder.get(a) ?? 0) - (roleMinOrder.get(b) ?? 0)
    return d !== 0 ? d : roleFirstIndex.get(a)! - roleFirstIndex.get(b)!
  })
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
    const s1 = Math.min(Math.round((toMinEnd(show.endTime, show.startTime) - dayStart) / STEP), slots.length)
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
        const endSlot   = Math.min(slots.length, Math.max(startSlot + 1, Math.round((toMinEnd(sh.endTime, sh.startTime) - dayStart) / STEP)))
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
        const endSlot = Math.min(Math.round((toMinEnd(show.endTime, show.startTime) - dayStart) / STEP), slots.length)
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
