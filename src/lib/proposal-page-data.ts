// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { usesAvailability } from "./availability-assist"
import { readAnswersForFit, readAvailabilityGate } from "./availability-assist-data"
import { canAdoptBeta } from "./beta-access"
import { shiftEndsAt } from "./cancel-deadline"
import { suggestedTargetMinutes } from "./proposal-input"
import { latestConfiguration, listRuns, readRun, runCoverages, type RunView } from "./proposal-runs-server"
import type { OrgScopedPrisma } from "./prisma-org"
import { OCCUPYING_STATUSES } from "./registration-capacity"
import { spokenShift } from "./spoken-time"
import { orgTimeZone } from "./time-zone"
import { WORKLOAD_EVENT_SELECT, workloadGateOf } from "./workload-guard"

/**
 * Reads of the page « Proposition d'affectations » (#1172), server only: the event's open shifts
 * and postes, the people to choose from with their answers, targets and the suggestion, the latest
 * runs, the run shown and the words its report needs (names, shifts). Null when the page is not
 * available: event not this organisation's, not using dated availability, or proposals not open to
 * the organisation and never used on this event.
 */

type Db = OrgScopedPrisma

export type ProposalPageShift = { id: string; roleName: string; label: string; date: string; startTime: string; endTime: string; capacity: number; held: number; sector: string | null; open: boolean }

export type ProposalPagePerson = {
  volunteerId: string
  firstName: string
  lastName: string
  answered: boolean
  /** Minutes; null: no target saved yet. */
  targetMinutes: number | null
  targetRevision: number | null
  suggestionMinutes: number
}

export type ProposalPageData = {
  eventId: string
  dates: string[]
  shifts: ProposalPageShift[]
  postes: { roleName: string; sector: string | null; capacity: number }[]
  people: ProposalPagePerson[]
  protection: "off" | "on" | "incomplete"
  maxEventMinutes: number | null
  lastConfiguration: unknown
  /** The latest runs, each with the coverage of its report when it has one. */
  runs: (Awaited<ReturnType<typeof listRuns>>[number] & { coverage: { filled: number; seats: number } | null })[]
  /** Unlocked proposed drafts still pending, by shift: what a new run on those shifts replaces. */
  proposedByShift: Record<string, number>
  run: RunView | null
  /** Words of the run shown: people and shifts by id. */
  names: Record<string, string>
  shiftWords: Record<string, string>
}

export async function proposalAvailable(db: Db, organizationId: string, eventId: string): Promise<boolean> {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { availabilityEnabled: true, availabilityAdoptedAt: true } })
  if (!event || !usesAvailability(event)) return false
  if ((await db.proposalRun.count({ where: { eventId } })) > 0) return true
  return canAdoptBeta(organizationId, "assignmentProposals")
}

const day = (d: Date) => d.toISOString().slice(0, 10)

export async function loadProposalPage(db: Db, organizationId: string, eventId: string, runId: string | null, now: Date = new Date()): Promise<ProposalPageData | null> {
  if (!(await proposalAvailable(db, organizationId, eventId))) return null
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true, organization: { select: { timeZone: true } }, ...WORKLOAD_EVENT_SELECT } })
  if (!event) return null
  const gate = await readAvailabilityGate(db as never, eventId)
  if (!gate.inUse) return null
  const timeZone = orgTimeZone(event.organization)
  const workload = workloadGateOf(event)

  const rows = await db.shift.findMany({
    where: { eventId, status: { not: "cancelled" } },
    select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, displayOrder: true, sector: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }, { roleName: "asc" }, { id: "asc" }],
  })
  const occupied = await db.registration.groupBy({ by: ["shiftId"], where: { eventId, status: { in: [...OCCUPYING_STATUSES] } }, _count: { _all: true } })
  const heldOf = new Map(occupied.map((o) => [o.shiftId, o._count._all]))
  const shifts: ProposalPageShift[] = rows.map((s) => ({
    id: s.id, roleName: s.roleName, label: s.label, date: day(s.date), startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, held: heldOf.get(s.id) ?? 0,
    sector: s.sector?.name ?? null, open: shiftEndsAt({ date: s.date, startTime: s.startTime, endTime: s.endTime }, timeZone).getTime() > now.getTime(),
  }))
  const postes = [...new Map(rows.map((s) => [s.roleName, s])).values()]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.roleName.localeCompare(b.roleName, "fr"))
    .map((s) => ({ roleName: s.roleName, sector: s.sector?.name ?? null, capacity: Math.max(...rows.filter((r) => r.roleName === s.roleName).map((r) => r.capacity)) }))

  // People: those asked for their availability, and anyone with a target on the event.
  const [asked, targets] = await Promise.all([
    db.availabilityRequest.findMany({ where: { eventId }, select: { volunteerId: true } }),
    db.eventVolunteerTarget.findMany({ where: { eventId }, select: { volunteerId: true, targetMinutes: true, revision: true } }),
  ])
  const ids = [...new Set([...asked.map((a) => a.volunteerId), ...targets.map((t) => t.volunteerId)])]
  const members = await db.volunteer.findMany({ where: { id: { in: ids }, organizationId, active: true, erasedAt: null, mergedIntoId: null }, select: { id: true, firstName: true, lastName: true } })
  const answers = await readAnswersForFit(db as never, eventId, members.map((m) => m.id))
  const targetOf = new Map(targets.map((t) => [t.volunteerId, t]))
  const cap = workload.kind === "on" ? workload.policy.maxEventMinutes : null
  const people: ProposalPagePerson[] = members.map((m) => {
    const answer = answers.get(m.id) ?? null
    const t = targetOf.get(m.id)
    return {
      volunteerId: m.id, firstName: m.firstName, lastName: m.lastName, answered: !!answer && answer.days.length > 0,
      targetMinutes: t?.targetMinutes ?? null, targetRevision: t?.revision ?? null, suggestionMinutes: suggestedTargetMinutes(answer, gate.dates, cap),
    }
  }).sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr") || (a.volunteerId < b.volunteerId ? -1 : 1))

  const listed = await listRuns(db, eventId)
  const coverages = await runCoverages(db, eventId, listed.map((r) => r.id))
  const runs = listed.map((r) => ({ ...r, coverage: coverages.get(r.id) ?? null }))
  // The replacement set of a new run (src/lib/proposal-runs-data.ts): pending, unlocked, proposed.
  const proposed = await db.draftAssignment.groupBy({ by: ["shiftId"], where: { eventId, status: "draft", locked: false, source: "proposal" }, _count: { _all: true } })
  const proposedByShift = Object.fromEntries(proposed.map((p) => [p.shiftId, p._count._all]))
  const shownId = runId && runs.some((r) => r.id === runId) ? runId : runs[0]?.id ?? null
  const run = shownId ? await readRun(db, eventId, shownId) : null

  const names: Record<string, string> = {}
  const nameIds = new Set<string>()
  for (const a of run?.report?.assignments ?? []) nameIds.add(a.volunteerId)
  for (const p of run?.report?.people ?? []) nameIds.add(p.volunteerId)
  for (const m of members) names[m.id] = `${m.firstName} ${m.lastName}`.trim()
  const missing = [...nameIds].filter((id) => !names[id])
  if (missing.length > 0) {
    for (const v of await db.volunteer.findMany({ where: { id: { in: missing } }, select: { id: true, firstName: true, lastName: true } })) names[v.id] = `${v.firstName} ${v.lastName}`.trim()
  }
  const shiftWords: Record<string, string> = {}
  for (const s of shifts) shiftWords[s.id] = spokenShift({ roleName: s.roleName, label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime })

  return {
    eventId, dates: gate.dates, shifts, postes, people, protection: workload.kind, maxEventMinutes: cap,
    lastConfiguration: await latestConfiguration(db, eventId), runs, proposedByShift, run, names, shiftWords,
  }
}
