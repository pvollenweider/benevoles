/**
 * Pure logic of the admin shifts page (ShiftsManager, #291): event days, time input
 * normalization, role order, rename/delete of a role, grouping and sorting. Kept out of the
 * component so it can be tested on its own.
 */

type ShiftLike = {
  id: string
  roleName: string
  label: string
  date: string
  startTime: string
  status?: string | null
  displayOrder?: number | null
  registrationCount: number
}

function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Every calendar day of the event, "YYYY-MM-DD", from start to end inclusive. */
export function eventDates(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + "T00:00:00")
  const last = new Date(end + "T00:00:00")
  while (cur <= last) {
    dates.push(localISO(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

/**
 * "9" → "09:00", "9:5" → "09:05". Out-of-range values (24, 26, -2, 75 minutes) are kept as typed
 * so the server reports them, instead of being silently changed to a different time.
 */
export function normalizeTime(val: string): string {
  const clean = val.trim()
  if (!clean) return ""
  const [h, m] = clean.split(":")
  const hours = parseInt(h, 10)
  const minutes = m !== undefined ? parseInt(m, 10) : 0
  if (isNaN(hours)) return clean
  if (hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) return clean
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

/** "samedi 1 juin". */
export function fmtLongDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
}

const active = <S extends ShiftLike>(shifts: S[]) => shifts.filter((s) => s.status !== "cancelled")

/** Roles in their display order (first shift's displayOrder), cancelled shifts ignored. */
export function roleOrder(shifts: ShiftLike[]): string[] {
  return [...new Set(
    [...active(shifts)].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((s) => s.roleName),
  )]
}

/** The list with the item at `from` moved to `to` (drag and drop). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Shifts with displayOrder set from a role order (role index × 100), as the server does. */
export function applyRoleOrder<S extends ShiftLike>(shifts: S[], order: string[]): S[] {
  return shifts.map((s) => {
    const idx = order.indexOf(s.roleName)
    return idx >= 0 ? { ...s, displayOrder: idx * 100 } : s
  })
}

/** Shifts after renaming a role; a label equal to the old role name follows it. */
export function renameRole<S extends ShiftLike>(shifts: S[], oldName: string, newName: string): S[] {
  return shifts.map((s) => (s.roleName === oldName ? { ...s, roleName: newName, label: s.label === oldName ? newName : s.label } : s))
}

/** Confirmation text before deleting a role, warning about the volunteers who'll be emailed. */
export function roleDeletionWarning(shifts: ShiftLike[], role: string): string {
  const roleShifts = active(shifts).filter((s) => s.roleName === role)
  const n = roleShifts.length
  const regs = roleShifts.reduce((sum, s) => sum + s.registrationCount, 0)
  const base = `Supprimer le poste « ${role} » (${n} créneau${n > 1 ? "x" : ""}) ?`
  if (regs === 0) return base
  const p = regs > 1 ? "s" : ""
  return `${base} ${regs} bénévole${p} inscrit${p} ${regs > 1 ? "seront" : "sera"} prévenu${p} par email.`
}

/** Active shifts grouped by day. */
export function activeShiftsByDay<S extends ShiftLike>(shifts: S[]): Record<string, S[]> {
  return active(shifts).reduce<Record<string, S[]>>((acc, s) => {
    ;(acc[s.date] ??= []).push(s)
    return acc
  }, {})
}

/** Active shifts sorted by day, then role order, then start time. */
export function sortShifts<S extends ShiftLike>(shifts: S[]): S[] {
  return [...active(shifts)].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.startTime.localeCompare(b.startTime),
  )
}
