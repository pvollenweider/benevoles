// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { canAdoptBeta } from "./beta-access"
import { COMMITTED_STATUSES } from "./registration-capacity"
import { orgTimeZone } from "./time-zone"
import { committedDuty, lockWorkloadExclusive, workloadGateOf } from "./workload-guard"
import { workloadProtectionShipped } from "./workload-shipped"
import {
  buildPolicy, checkPolicyValues, evaluateWorkload, EXISTING_WARNING_SUGGESTIONS, parseWorkloadPolicy, policyChangeNeedsScan, policyValues,
  serviceDayExamples, workloadFindingMessage, WORKLOAD_LIMIT_FIELDS,
  type PolicyProblem, type WorkloadFinding, type WorkloadPolicy, type WorkloadPolicyValues,
} from "./workload-policy"

/**
 * Settings of the workload protection (#1171), server only: the event's policy, its preview, the
 * scan of the commitments already held, and the organisation's default for new events. The
 * enforcement is in src/lib/workload-guard.ts.
 *
 * Writes take the event's EXCLUSIVE workload lock first, then scan in the same transaction: an
 * assignment running meanwhile either committed before the scan (and is in it) or waits and reads
 * the new policy. Turning protection on or tightening it is refused while a commitment already
 * breaks it (no silent grandfathering): the organiser sees who and why, changes the schedule, and
 * saves again. Turning it off is always possible.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** One person whose current schedule breaks the policy, for the organiser. */
export type PersonFindings = { volunteerId: string; name: string; findings: WorkloadFinding[]; messages: string[] }

/** Every committed person of the event judged with `policy`: those with findings, by name. */
export async function scanEventWorkload(db: Db, eventId: string, policy: WorkloadPolicy): Promise<PersonFindings[]> {
  const rows: { volunteerId: string; volunteer: { firstName: string; lastName: string }; shift: { id: string; date: Date; startTime: string; endTime: string } }[] = await db.registration.findMany({
    where: { eventId, status: { in: [...COMMITTED_STATUSES] }, shift: { status: { not: "cancelled" } } },
    select: { volunteerId: true, volunteer: { select: { firstName: true, lastName: true } }, shift: { select: { id: true, date: true, startTime: true, endTime: true } } },
  })
  const byPerson = new Map<string, { name: string; shifts: typeof rows[number]["shift"][] }>()
  for (const r of rows) {
    const entry = byPerson.get(r.volunteerId) ?? { name: `${r.volunteer.firstName} ${r.volunteer.lastName}`.trim(), shifts: [] }
    entry.shifts.push(r.shift)
    byPerson.set(r.volunteerId, entry)
  }
  const out: PersonFindings[] = []
  for (const [volunteerId, { name, shifts }] of byPerson) {
    const findings = evaluateWorkload(shifts, policy)
    if (findings.length > 0) out.push({ volunteerId, name, findings, messages: findings.map((f) => workloadFindingMessage(f, policy)) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"))
}

/** What the organiser's page reads: the state, the values, the suggestions and the current findings. */
export type WorkloadPolicyState = {
  enabled: boolean
  /** The stored values, when they parse; null otherwise (never shown as « no limit »). */
  values: WorkloadPolicyValues | null
  timeZone: string
  /** The event may turn protection on now (or already has it). */
  adoptable: boolean
  /** Enabled with a stored policy that does not parse: nothing new is accepted. */
  incomplete: boolean
  suggestions: typeof EXISTING_WARNING_SUGGESTIONS
  fields: typeof WORKLOAD_LIMIT_FIELDS
  serviceDayExamples: string[]
  /** People whose schedule breaks the enabled policy now (left by cancellations, say). */
  findings: Omit<PersonFindings, "findings">[]
}

/** A person's findings as the page reads them: the sentences, not the raw findings. */
const forPage = (people: PersonFindings[]): Omit<PersonFindings, "findings">[] => people.map((p) => ({ volunteerId: p.volunteerId, name: p.name, messages: p.messages }))

export async function loadWorkloadPolicyState(db: Db, organizationId: string, eventId: string): Promise<WorkloadPolicyState | null> {
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: { workloadProtectionEnabled: true, workloadPolicy: true, organization: { select: { timeZone: true } } },
  })
  if (!event) return null
  const parsed = parseWorkloadPolicy(event.workloadPolicy)
  const gate = workloadGateOf(event)
  const adoptable = event.workloadProtectionEnabled || (workloadProtectionShipped() && (await canAdoptBeta(organizationId, "workloadProtection")))
  const findings = gate.kind === "on" ? await scanEventWorkload(db, eventId, gate.policy) : []
  return {
    enabled: event.workloadProtectionEnabled,
    values: parsed.ok ? policyValues(parsed.policy) : null,
    timeZone: parsed.ok ? parsed.policy.timeZone : orgTimeZone(event.organization),
    adoptable,
    incomplete: gate.kind === "incomplete",
    suggestions: EXISTING_WARNING_SUGGESTIONS,
    fields: WORKLOAD_LIMIT_FIELDS,
    serviceDayExamples: parsed.ok ? serviceDayExamples(parsed.policy.serviceDayStart) : [],
    findings: forPage(findings),
  }
}

export type WorkloadPreview =
  | { ok: true; timeZone: string; serviceDayExamples: string[]; findings: Omit<PersonFindings, "findings">[] }
  | { ok: false; status: 400 | 404; error: string; problems?: PolicyProblem[] }

/**
 * « Aperçu avant activation »: the proposed values judged on the commitments held now, saving
 * nothing and protecting nothing. The zone is the one protection would use: the stored one while
 * enabled, else the organisation's.
 */
export async function previewWorkloadPolicy(db: Db, eventId: string, values: unknown): Promise<WorkloadPreview> {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { workloadProtectionEnabled: true, workloadPolicy: true, organization: { select: { timeZone: true } } } })
  if (!event) return { ok: false, status: 404, error: "Non trouvé" }
  const checked = checkPolicyValues(values)
  if (!checked.ok) return { ok: false, status: 400, error: checked.problems[0].message, problems: checked.problems }
  const policy = buildPolicy(checked.values, snapshotZone(event))
  const findings = await scanEventWorkload(db, eventId, policy)
  return { ok: true, timeZone: policy.timeZone, serviceDayExamples: serviceDayExamples(policy.serviceDayStart), findings: forPage(findings) }
}

/** The zone a policy uses: kept once snapshotted (an organisation setting change reinterprets nothing). */
function snapshotZone(event: { workloadProtectionEnabled: boolean; workloadPolicy: unknown; organization: { timeZone: string | null } }): string {
  const stored = parseWorkloadPolicy(event.workloadPolicy)
  return event.workloadProtectionEnabled && stored.ok ? stored.policy.timeZone : orgTimeZone(event.organization)
}

export const WORKLOAD_NOT_ADOPTABLE = "La protection des pauses et de la charge ne peut pas être activée pour cette organisation."

export type WorkloadSetResult =
  | { ok: true; enabled: boolean; policy: WorkloadPolicy | null; changes: Record<string, { from: unknown; to: unknown }> }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string; problems?: PolicyProblem[]; findings?: Omit<PersonFindings, "findings">[] }

/** A short, PII-free summary of a policy for the event log. */
export function policySummary(p: WorkloadPolicy | null): string {
  if (!p) return "(aucune)"
  const h = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`
  return `journée dès ${p.serviceDayStart}, ${h(p.maxContinuousMinutes)} sans pause de ${p.minBreakMinutes} min, ${h(p.maxDailyMinutes)}/journée, ${h(p.maxEventMinutes)} au total, repos ${h(p.minRestMinutes)}, attente ${h(p.maxIdleGapMinutes)}`
}

/**
 * Turns protection on or off, or changes its values, under the exclusive workload lock. On:
 * every value required (empty = incomplete), a new adoption needs the beta gate, and a scan must
 * find nothing unless the change only loosens limits. Off: always, the values kept for later.
 */
export async function setWorkloadPolicy(db: Db, organizationId: string, eventId: string, input: { enabled: boolean; values?: unknown }): Promise<WorkloadSetResult> {
  return db.$transaction(async (tx: Db): Promise<WorkloadSetResult> => {
    await lockWorkloadExclusive(tx, eventId)
    const event = await tx.event.findFirst({ where: { id: eventId }, select: { workloadProtectionEnabled: true, workloadPolicy: true, organization: { select: { timeZone: true } } } })
    if (!event) return { ok: false, status: 404, error: "Non trouvé" }
    const stored = parseWorkloadPolicy(event.workloadPolicy)
    const prev = event.workloadProtectionEnabled && stored.ok ? stored.policy : null

    if (!input.enabled) {
      if (!event.workloadProtectionEnabled) return { ok: true, enabled: false, policy: stored.ok ? stored.policy : null, changes: {} }
      await tx.event.update({ where: { id: eventId }, data: { workloadProtectionEnabled: false } })
      return { ok: true, enabled: false, policy: stored.ok ? stored.policy : null, changes: { workloadProtectionEnabled: { from: true, to: false } } }
    }

    const checked = checkPolicyValues(input.values)
    if (!checked.ok) return { ok: false, status: 400, error: checked.problems[0].message, problems: checked.problems }
    // A new adoption (BE06): only while the capability is shipped and the beta gate allows it; an
    // event that has protection keeps it, and its values can still change, after an opt-out.
    if (!event.workloadProtectionEnabled && !(workloadProtectionShipped() && (await canAdoptBeta(organizationId, "workloadProtection", tx)))) {
      return { ok: false, status: 403, error: WORKLOAD_NOT_ADOPTABLE }
    }
    const next = buildPolicy(checked.values, snapshotZone(event))
    if (policyChangeNeedsScan(prev, next)) {
      const findings = await scanEventWorkload(tx, eventId, next)
      if (findings.length > 0) {
        const who = findings.length === 1 ? findings[0].name : `${findings.length} personnes`
        return {
          ok: false,
          status: 409,
          error: `Ces limites ne sont pas respectées aujourd'hui par le programme de ${who}. Modifiez ces programmes ou les limites, puis enregistrez à nouveau : rien n'a été activé ni modifié.`,
          findings: forPage(findings),
        }
      }
    }
    await tx.event.update({ where: { id: eventId }, data: { workloadProtectionEnabled: true, workloadPolicy: next } })
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (!event.workloadProtectionEnabled) changes.workloadProtectionEnabled = { from: false, to: true }
    if (policySummary(prev) !== policySummary(next)) changes.workloadPolicy = { from: policySummary(prev), to: policySummary(next) }
    return { ok: true, enabled: true, policy: next, changes }
  })
}

// ── Organisation default (new events only) ──────────────────────────────────

/** The organisation's default as stored: `{ enabled, values }`. */
export type WorkloadDefault = { enabled: boolean; values: WorkloadPolicyValues }

/** Strict read of the stored default; anything else is no default. */
export function parseWorkloadDefault(value: unknown): WorkloadDefault | null {
  const v = (value && typeof value === "object" ? value : null) as { enabled?: unknown; values?: unknown } | null
  if (!v || typeof v.enabled !== "boolean") return null
  const checked = checkPolicyValues(v.values)
  return checked.ok ? { enabled: v.enabled, values: checked.values } : null
}

/**
 * What a NEW event starts with (shiftRosterDefault pattern): the organisation's values copied, the
 * zone snapshotted now, only while the capability can be adopted. Never a live inheritance.
 */
export async function newEventWorkload(organizationId: string, org: { workloadPolicyDefault?: unknown; timeZone?: string | null } | null | undefined): Promise<{ workloadProtectionEnabled: boolean; workloadPolicy?: WorkloadPolicy }> {
  const def = parseWorkloadDefault(org?.workloadPolicyDefault)
  if (!def || !workloadProtectionShipped() || !(await canAdoptBeta(organizationId, "workloadProtection"))) return { workloadProtectionEnabled: false }
  return { workloadProtectionEnabled: def.enabled, workloadPolicy: buildPolicy(def.values, orgTimeZone(org)) }
}

/**
 * A person's findings on the protected events among `eventIds`, for an organiser: after a member
 * merge (Codex, PR 1: allowed, never blocked, since it reconciles one person's records and creates
 * no duty, but reported). Events without protection give nothing.
 */
export async function personWorkloadReport(db: Db, volunteerId: string, eventIds: string[]): Promise<{ eventId: string; eventTitle: string; messages: string[] }[]> {
  if (eventIds.length === 0) return []
  const events: { id: string; title: string; workloadProtectionEnabled: boolean; workloadPolicy: unknown }[] = await db.event.findMany({
    where: { id: { in: [...new Set(eventIds)] }, workloadProtectionEnabled: true },
    select: { id: true, title: true, workloadProtectionEnabled: true, workloadPolicy: true },
  })
  const out: { eventId: string; eventTitle: string; messages: string[] }[] = []
  for (const event of events) {
    const gate = workloadGateOf(event)
    if (gate.kind !== "on") continue
    const shifts = await committedDuty(db, event.id, volunteerId)
    const findings = evaluateWorkload(shifts, gate.policy)
    if (findings.length > 0) out.push({ eventId: event.id, eventTitle: event.title, messages: findings.map((f) => workloadFindingMessage(f, gate.policy)) })
  }
  return out
}
