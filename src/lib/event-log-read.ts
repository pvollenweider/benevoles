/**
 * Read side of EventLog: query with filters, and resolve actor display names at render time
 * (never stored — see event-log.ts). A missing join (removed admin, RGPD-purged volunteer)
 * falls back to a generic label per actorType, not an error.
 */
import { prisma } from "./prisma"
import type { EventLog as EventLogRow } from "@/generated/prisma/client"
import { fmtRange } from "./gantt-utils"

const shiftDateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" })
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export interface EventLogEntry {
  id: string
  eventId: string
  actorType: string
  actorId: string | null
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  causedByLogId: string | null
  createdAt: Date
}

export interface ShiftLabel {
  /** "Bar · 25/06 18:15–19:00" — for the diff list and picker options. */
  compact: string
  /** "Bar du 25/06, 18:15–19:00" — reads naturally spliced into a narrative sentence. */
  prose: string
}

export interface EventLogFilters {
  entityType?: string
  entityId?: string
  actorId?: string
  actorType?: string
  /** action or action prefix, e.g. "shift" matches "shift.created", "shift.updated", ... */
  action?: string
  since?: Date
  until?: Date
  cursor?: string
  limit?: number
}

const GENERIC_LABEL: Record<string, string> = {
  admin: "Admin (compte supprimé)",
  volunteer: "Bénévole (compte supprimé)",
  system: "Système",
}

export async function listEventLogs(eventId: string, filters: EventLogFilters = {}): Promise<{
  entries: EventLogEntry[]
  nextCursor: string | null
  shiftLabels: Record<string, ShiftLabel>
}> {
  const limit = Math.min(filters.limit ?? 50, 200)

  const where: Record<string, unknown> = { eventId }
  if (filters.entityType) where.entityType = filters.entityType
  if (filters.entityId) where.entityId = filters.entityId
  if (filters.actorId) where.actorId = filters.actorId
  if (filters.actorType) where.actorType = filters.actorType
  if (filters.action) where.action = { startsWith: filters.action }
  if (filters.since || filters.until) {
    where.createdAt = {
      ...(filters.since ? { gte: filters.since } : {}),
      ...(filters.until ? { lte: filters.until } : {}),
    }
  }

  const rows = await prisma.eventLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const [entries, shiftLabels] = await Promise.all([resolveActorLabels(page), resolveShiftLabels(page)])

  return { entries, nextCursor: hasMore ? page[page.length - 1].id : null, shiftLabels }
}

/** Fetches one entry plus the full chain of entries it caused, transitively, oldest first. */
export async function getCausalChain(rootLogId: string): Promise<{ entries: EventLogEntry[]; shiftLabels: Record<string, ShiftLabel> }> {
  const collected: EventLogRow[] = []
  let frontier = [rootLogId]
  const seen = new Set<string>()

  while (frontier.length > 0) {
    const rows = await prisma.eventLog.findMany({ where: { id: { in: frontier } } })
    for (const row of rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      collected.push(row)
    }
    const next = await prisma.eventLog.findMany({
      where: { causedByLogId: { in: frontier } },
      select: { id: true },
    })
    frontier = next.map((n) => n.id).filter((id) => !seen.has(id))
  }

  collected.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const [entries, shiftLabels] = await Promise.all([resolveActorLabels(collected), resolveShiftLabels(collected)])
  return { entries, shiftLabels }
}

function formatShiftLabel(s: { roleName: string; label: string; date: Date; startTime: string; endTime: string }): ShiftLabel {
  const name = s.roleName === s.label ? s.label : `${s.roleName} · ${s.label}`
  const dateLabel = shiftDateFmt.format(s.date)
  const range = fmtRange(s.startTime, s.endTime)
  return { compact: `${name} · ${dateLabel} ${range}`, prose: `${name} du ${dateLabel}, ${range}` }
}

const SHIFT_SELECT = { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true } as const

/**
 * Resolves `changes.shiftId` values (the only current id-shaped reference field) to a display
 * label — e.g. "Bar · 14/06 18:00–20:00" — so the UI shows something readable and unambiguous
 * instead of a raw cuid by default. The date/time is included on purpose: a role name alone
 * ("Bar") is worthless in a log when the event has several "Bar" shifts at different times —
 * the whole point of a log is to tell them apart. The raw id stays in `changes` untouched — a
 * future "debug mode" toggle could show it instead of the label without needing any change here.
 */
async function resolveShiftLabels(rows: EventLogRow[]): Promise<Record<string, ShiftLabel>> {
  const shiftIds = new Set<string>()
  for (const row of rows) {
    const changes = row.changes as Record<string, { from: unknown; to: unknown }> | null
    const value = changes?.shiftId
    if (!value) continue
    if (typeof value.from === "string") shiftIds.add(value.from)
    if (typeof value.to === "string") shiftIds.add(value.to)
  }
  if (shiftIds.size === 0) return {}

  const shifts = await prisma.shift.findMany({ where: { id: { in: [...shiftIds] } }, select: SHIFT_SELECT })
  return Object.fromEntries(shifts.map((s) => [s.id, formatShiftLabel(s)]))
}

export interface ReplayCandidate {
  entityType: string
  entityId: string
  label: string
  count: number
}

/**
 * Entities with more than one log entry — the only ones worth offering in the Replay picker,
 * since stepping through a single-entry "history" is meaningless. Lets Replay be used directly
 * from its own tab instead of only reachable via a row's "Rejouer" button in Explorer.
 */
export async function listReplayCandidates(eventId: string): Promise<ReplayCandidate[]> {
  const groups = await prisma.eventLog.groupBy({
    by: ["entityType", "entityId"],
    where: { eventId },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    orderBy: { _count: { id: "desc" } },
    take: 100,
  })
  if (groups.length === 0) return []

  const shiftIds = groups.filter((g) => g.entityType === "Shift").map((g) => g.entityId)
  const shifts = shiftIds.length ? await prisma.shift.findMany({ where: { id: { in: shiftIds } }, select: SHIFT_SELECT }) : []
  const shiftLabelById = new Map(shifts.map((s) => [s.id, formatShiftLabel(s)]))

  // A Registration has no non-PII label of its own — show which shift it's for instead, taken
  // from that registration's own logged changes (every registration.* action records shiftId).
  const registrationIds = groups.filter((g) => g.entityType === "Registration").map((g) => g.entityId)
  const registrationShiftLabel = new Map<string, ShiftLabel>()
  if (registrationIds.length > 0) {
    const regRows = await prisma.eventLog.findMany({
      where: { eventId, entityType: "Registration", entityId: { in: registrationIds } },
      select: { entityId: true, changes: true },
    })
    const referencedShiftIds = new Set<string>()
    for (const row of regRows) {
      const to = (row.changes as Record<string, { to: unknown }> | null)?.shiftId?.to
      if (typeof to === "string") referencedShiftIds.add(to)
    }
    const referencedShifts = referencedShiftIds.size
      ? await prisma.shift.findMany({ where: { id: { in: [...referencedShiftIds] } }, select: SHIFT_SELECT })
      : []
    const refShiftLabelById = new Map(referencedShifts.map((s) => [s.id, formatShiftLabel(s)]))
    for (const row of regRows) {
      const to = (row.changes as Record<string, { to: unknown }> | null)?.shiftId?.to
      if (typeof to === "string" && refShiftLabelById.has(to) && !registrationShiftLabel.has(row.entityId)) {
        registrationShiftLabel.set(row.entityId, refShiftLabelById.get(to)!)
      }
    }
  }

  return groups.map((g) => {
    let label: string
    if (g.entityType === "Shift") {
      label = shiftLabelById.get(g.entityId)?.compact ?? `Créneau (${g.entityId.slice(0, 8)}…)`
    } else if (g.entityType === "Registration") {
      const shift = registrationShiftLabel.get(g.entityId)
      label = shift ? `Inscription — ${shift.compact}` : `Inscription (${g.entityId.slice(0, 8)}…)`
    } else if (g.entityType === "Event") {
      label = "L'événement"
    } else {
      label = `${ENTITY_TYPE_LABEL[g.entityType] ?? g.entityType} (${g.entityId.slice(0, 8)}…)`
    }
    return { entityType: g.entityType, entityId: g.entityId, label, count: g._count.id }
  })
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  Shift: "Créneau",
  Registration: "Inscription",
  Event: "Événement",
  MemberInvite: "Invitation",
  EventPage: "Page",
  SectorLeader: "Responsable de secteur",
}

export interface StoryCandidate {
  logId: string
  label: string
  entryCount: number
}

/**
 * Roots of an actual causal chain (an entry with no cause of its own, that itself caused at
 * least one other entry) — the only entries worth offering in the Récit picker. A single
 * isolated entry still "narrates" (one sentence), but isn't a story; nothing here is picked at
 * random or ranked by relevance, just genuinely chained sequences.
 */
export async function listStoryCandidates(eventId: string): Promise<StoryCandidate[]> {
  const roots = await prisma.eventLog.findMany({
    where: { eventId, causedByLogId: null },
    select: { id: true, action: true, actorType: true, actorId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })
  if (roots.length === 0) return []

  const rootIds = roots.map((r) => r.id)
  const children = await prisma.eventLog.findMany({
    where: { causedByLogId: { in: rootIds } },
    select: { causedByLogId: true },
  })
  const chainSize = new Map<string, number>()
  for (const c of children) {
    if (!c.causedByLogId) continue
    chainSize.set(c.causedByLogId, (chainSize.get(c.causedByLogId) ?? 0) + 1)
  }

  const candidates = roots.filter((r) => chainSize.has(r.id))
  if (candidates.length === 0) return []

  const actorLabelById = await buildActorLabelMap(candidates)

  return candidates
    .slice(0, 100)
    .map((c) => ({
      logId: c.id,
      label: `${actorLabelById.get(c.id) ?? c.actorType} · ${dateTimeFmt.format(c.createdAt)} (${(chainSize.get(c.id) ?? 0) + 1} étapes)`,
      entryCount: (chainSize.get(c.id) ?? 0) + 1,
    }))
}

/** Resolves each row's actorType/actorId to a display label, keyed by the row's own id. */
async function buildActorLabelMap(rows: { id: string; actorType: string; actorId: string | null }[]): Promise<Map<string, string>> {
  const adminIds = [...new Set(rows.filter((r) => r.actorType === "admin" && r.actorId).map((r) => r.actorId!))]
  const volunteerIds = [...new Set(rows.filter((r) => r.actorType === "volunteer" && r.actorId).map((r) => r.actorId!))]

  const [admins, volunteers] = await Promise.all([
    adminIds.length
      ? prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    volunteerIds.length
      ? prisma.volunteer.findMany({ where: { id: { in: volunteerIds } }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
  ])

  const adminNames = new Map(admins.map((a) => [a.id, a.name]))
  const volunteerNames = new Map(volunteers.map((v) => [v.id, `${v.firstName} ${v.lastName}`]))

  return new Map(
    rows.map((row) => {
      let actorLabel = GENERIC_LABEL[row.actorType] ?? row.actorType
      if (row.actorType === "admin" && row.actorId && adminNames.has(row.actorId)) {
        actorLabel = adminNames.get(row.actorId)!
      } else if (row.actorType === "volunteer" && row.actorId && volunteerNames.has(row.actorId)) {
        actorLabel = volunteerNames.get(row.actorId)!
      }
      return [row.id, actorLabel]
    }),
  )
}

async function resolveActorLabels(rows: EventLogRow[]): Promise<EventLogEntry[]> {
  const actorLabelById = await buildActorLabelMap(rows)
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    actorType: row.actorType,
    actorId: row.actorId,
    actorLabel: actorLabelById.get(row.id) ?? row.actorType,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    changes: row.changes as EventLogEntry["changes"],
    causedByLogId: row.causedByLogId,
    createdAt: row.createdAt,
  }))
}
