// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Protection des pauses et de la charge » (#1171, lot 1): a per-event policy, chosen by the
 * organiser, that BLOCKS any assignment leaving a person with too much continuous duty, too much
 * duty in a service day or over the event, too little rest between two service days, or a too long
 * gap between two missions of the same service day. Unlike the #465 warnings (src/lib/workload.ts),
 * nothing here is a default: every value is the organiser's, and a missing value makes the policy
 * incomplete, never « no limit ».
 *
 * Pure and Prisma-free (the sign-up page and the organiser pages read it too). One evaluator,
 * `evaluateWorkload`, runs on a person's whole resulting schedule:
 * - duty is every committed mission (an explicit « standby » poste is a mission like any other: it
 *   counts as work, never as a break); missions running at the same time count once (#986);
 * - durations are measured on real instants, so a night across a daylight saving change lasts what
 *   it really lasts; the policy's own time zone (snapshotted when protection is turned on) only
 *   places the service-day boundary and writes the labels;
 * - a service day starts at the event's boundary (`serviceDayStart`, local time), not at midnight:
 *   with 08:00, a night task at 01:00 belongs to the service day of the evening before.
 *
 * Out of lot 1 (follow-ups): meal protection, travel margins, individual stricter limits, a rule
 * on days off, draft publication (#1146).
 */
import { fmtDay, fmtDuration } from "./signup-recap"
import { toMin, toMinEnd } from "./gantt-utils"
import { isValidTimeZone, localDateTimeToUtc } from "./time-zone"
import { mergeIntervals } from "./interval-union"

export const WORKLOAD_POLICY_VERSION = 1

/** The limits of a policy, in minutes. Every one is required to turn protection on. */
export type WorkloadLimitsV1 = {
  /** Longest duty without a real break. */
  maxContinuousMinutes: number
  /** Shortest gap that counts as a real break and ends continuous duty. */
  minBreakMinutes: number
  /** Most duty in one service day. */
  maxDailyMinutes: number
  /** Most duty over the whole event. */
  maxEventMinutes: number
  /** Shortest rest between the last mission of a service day and the first of the next. */
  minRestMinutes: number
  /** Longest gap between two missions of the same service day. */
  maxIdleGapMinutes: number
}

export type WorkloadPolicy = WorkloadLimitsV1 & {
  version: typeof WORKLOAD_POLICY_VERSION
  /** IANA zone the boundary and the labels are read in, snapshotted when protection is turned on. */
  timeZone: string
  /** Local time a service day starts at, "HH:MM". Required: no hidden default. */
  serviceDayStart: string
}

/** What the organiser sets: the policy without its version and time zone (the server adds both). */
export type WorkloadPolicyValues = Omit<WorkloadPolicy, "version" | "timeZone">

export type WorkloadField = keyof WorkloadPolicyValues

type LimitField = keyof WorkloadLimitsV1

/** Each limit, its label on the organiser's pages and its accepted range (minutes). */
export const WORKLOAD_LIMIT_FIELDS: { key: LimitField; label: string; min: number; max: number }[] = [
  { key: "maxContinuousMinutes", label: "Durée maximale sans vraie pause", min: 30, max: 24 * 60 },
  { key: "minBreakMinutes", label: "Durée minimale d'une vraie pause", min: 5, max: 12 * 60 },
  { key: "maxDailyMinutes", label: "Durée maximale de missions par journée de service", min: 30, max: 24 * 60 },
  { key: "maxEventMinutes", label: "Durée maximale de missions sur tout l'événement", min: 30, max: 30 * 24 * 60 },
  { key: "minRestMinutes", label: "Repos minimum entre deux journées de service", min: 0, max: 24 * 60 },
  { key: "maxIdleGapMinutes", label: "Attente maximale entre deux missions d'une même journée", min: 0, max: 24 * 60 },
]

export const SERVICE_DAY_START_LABEL = "Début de la journée de service"

/**
 * The values of the existing #465 warnings, offered as editable suggestions only: they are
 * « réglages d'avertissement existants », never legal, recommended or approved pilot thresholds.
 */
export const EXISTING_WARNING_SUGGESTIONS: Partial<WorkloadLimitsV1> = {
  maxContinuousMinutes: 6 * 60,
  minBreakMinutes: 30,
  maxDailyMinutes: 8 * 60,
}

export type PolicyProblem = { field: WorkloadField | "timeZone" | "version"; message: string }

export type PolicyParse = { ok: true; policy: WorkloadPolicy } | { ok: false; problems: PolicyProblem[] }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Checks the organiser's values (no version, no zone): every field present, whole minutes in range, consistent. */
export function checkPolicyValues(value: unknown): { ok: true; values: WorkloadPolicyValues } | { ok: false; problems: PolicyProblem[] } {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  const problems: PolicyProblem[] = []
  if (typeof v.serviceDayStart !== "string" || !HHMM.test(v.serviceDayStart)) {
    problems.push({ field: "serviceDayStart", message: `${SERVICE_DAY_START_LABEL} : indiquez une heure (par exemple 08:00).` })
  }
  for (const f of WORKLOAD_LIMIT_FIELDS) {
    const n = v[f.key]
    if (n === undefined || n === null || n === "") {
      problems.push({ field: f.key, message: `${f.label} : à compléter. Une valeur vide ne veut pas dire « sans limite ».` })
    } else if (typeof n !== "number" || !Number.isInteger(n)) {
      problems.push({ field: f.key, message: `${f.label} : indiquez un nombre entier de minutes.` })
    } else if (n < f.min || n > f.max) {
      problems.push({ field: f.key, message: `${f.label} : entre ${fmtDuration(f.min)} et ${fmtDuration(f.max)}.` })
    }
  }
  if (problems.length > 0) return { ok: false, problems }
  const values = {
    serviceDayStart: v.serviceDayStart as string,
    ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, v[f.key] as number])),
  } as WorkloadPolicyValues
  // Consistency: a smaller daily or event cap than the one it contains is almost always hours typed
  // as minutes (or the reverse); refused rather than guessed.
  if (values.maxContinuousMinutes > values.maxDailyMinutes) {
    problems.push({ field: "maxContinuousMinutes", message: "La durée maximale sans vraie pause ne peut pas dépasser la durée maximale par journée de service." })
  }
  if (values.maxDailyMinutes > values.maxEventMinutes) {
    problems.push({ field: "maxEventMinutes", message: "La durée maximale sur tout l'événement ne peut pas être inférieure à la durée maximale par journée de service." })
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, values }
}

/**
 * Strict read of a stored or submitted policy. Anything else than a complete version-1 policy with a
 * known time zone is refused: an enabled event whose policy does not parse fails closed (see
 * `workloadGate`), it never becomes an unrestricted schedule.
 */
export function parseWorkloadPolicy(value: unknown): PolicyParse {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  const problems: PolicyProblem[] = []
  if (v.version !== WORKLOAD_POLICY_VERSION) problems.push({ field: "version", message: "Version de réglage inconnue." })
  if (typeof v.timeZone !== "string" || !isValidTimeZone(v.timeZone)) problems.push({ field: "timeZone", message: "Fuseau horaire inconnu." })
  // A key this version does not know is a rule it cannot enforce: never silently ignored.
  const known = new Set<string>(["version", "timeZone", "serviceDayStart", ...WORKLOAD_LIMIT_FIELDS.map((f) => f.key)])
  if (Object.keys(v).some((k) => !known.has(k))) problems.push({ field: "version", message: "Réglage inconnu de cette version." })
  const values = checkPolicyValues(v)
  if (!values.ok) problems.push(...values.problems)
  if (problems.length > 0 || !values.ok) return { ok: false, problems }
  return { ok: true, policy: { version: WORKLOAD_POLICY_VERSION, timeZone: v.timeZone as string, ...values.values } }
}

/** The organiser's values of a policy (no version, no zone). */
export function policyValues(p: WorkloadPolicy): WorkloadPolicyValues {
  return {
    serviceDayStart: p.serviceDayStart,
    ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, p[f.key]])),
  } as WorkloadPolicyValues
}

/** The policy to store: the organiser's values, the version, and the zone snapshotted now. */
export function buildPolicy(values: WorkloadPolicyValues, timeZone: string): WorkloadPolicy {
  return { version: WORKLOAD_POLICY_VERSION, timeZone, ...values }
}

/**
 * Whether saving `next` over `prev` needs a scan of the commitments already held (Codex, PR 1):
 * turning protection on, repairing a policy that does not parse, any stricter limit, or a new
 * boundary or time zone. A change that only raises maxima and lowers minima (or changes nothing)
 * cannot create a finding, so it needs none.
 */
export function policyChangeNeedsScan(prev: WorkloadPolicy | null, next: WorkloadPolicy): boolean {
  if (!prev) return true
  if (prev.serviceDayStart !== next.serviceDayStart || prev.timeZone !== next.timeZone || prev.version !== next.version) return true
  return next.maxContinuousMinutes < prev.maxContinuousMinutes
    || next.minBreakMinutes > prev.minBreakMinutes
    || next.maxDailyMinutes < prev.maxDailyMinutes
    || next.maxEventMinutes < prev.maxEventMinutes
    || next.minRestMinutes > prev.minRestMinutes
    || next.maxIdleGapMinutes < prev.maxIdleGapMinutes
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/** A committed mission of the person (confirmed place or pending request). */
export type DutyShift = { id: string; date: string | Date; startTime: string; endTime: string }

export type WorkloadRule = "continuous" | "daily" | "event" | "rest" | "idle"

/**
 * One rule broken by a schedule. `start`/`end` are instants (ms): the continuous run, or the gap
 * for rest and idle; `minutes` what was measured and `limit` the policy's value. `serviceDay` is the
 * service day the finding belongs to ("YYYY-MM-DD"; for a gap, the one of the mission before it).
 */
export type WorkloadFinding = {
  rule: WorkloadRule
  serviceDay: string | null
  start: number | null
  end: number | null
  minutes: number
  limit: number
  shiftIds: string[]
}

const MIN = 60_000
const DAY_MS = 86_400_000
const dayKey = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

type Duty = { id: string; start: number; end: number }

/** A mission's real instants; an end at or before the start is on the next day (a night). */
export function dutyInterval(s: DutyShift, timeZone: string): Duty {
  const base = new Date(`${dayKey(s.date)}T00:00:00Z`)
  const start = localDateTimeToUtc(base, hhmm(toMin(s.startTime)), timeZone).getTime()
  const end = localDateTimeToUtc(base, hhmm(toMinEnd(s.endTime, s.startTime)), timeZone).getTime()
  return { id: s.id, start, end }
}

/** The local civil date and minutes since local midnight of an instant. */
export function localParts(ms: number, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** The service day ("YYYY-MM-DD") an instant belongs to: before the boundary, the previous date. */
export function serviceDayOf(ms: number, policy: Pick<WorkloadPolicy, "timeZone" | "serviceDayStart">): string {
  const local = localParts(ms, policy.timeZone)
  return local.minutes < toMin(policy.serviceDayStart) ? addDays(local.date, -1) : local.date
}

/** The instant service day `day` starts at. */
export function serviceDayStartsAt(day: string, policy: Pick<WorkloadPolicy, "timeZone" | "serviceDayStart">): number {
  return localDateTimeToUtc(new Date(`${day}T00:00:00Z`), policy.serviceDayStart, policy.timeZone).getTime()
}

type Block = { start: number; end: number; ids: string[] }

/** Missions merged where they overlap or touch: time on two missions at once counts once. */
function dutyBlocks(duties: Duty[]): Block[] {
  const merged = mergeIntervals(duties)
  return merged.map((m) => ({
    start: m.start,
    end: m.end,
    ids: duties.filter((d) => d.end > d.start && d.start < m.end && d.end > m.start).map((d) => d.id),
  }))
}

/** Duty time of a block per service day, the block cut at each boundary it crosses. */
function splitByServiceDay(block: Block, policy: WorkloadPolicy): { day: string; minutes: number }[] {
  const out: { day: string; minutes: number }[] = []
  let cur = block.start
  let day = serviceDayOf(cur, policy)
  // A block never spans more than a few days; the bound only guards a malformed input.
  for (let i = 0; i < 400 && cur < block.end; i++) {
    const next = Math.max(serviceDayStartsAt(addDays(day, 1), policy), cur + MIN)
    const until = Math.min(next, block.end)
    out.push({ day, minutes: (until - cur) / MIN })
    cur = until
    day = addDays(day, 1)
  }
  return out
}

/** Every rule the schedule breaks, in time order. Pure; the same shifts always give the same findings. */
export function evaluateWorkload(shifts: DutyShift[], policy: WorkloadPolicy): WorkloadFinding[] {
  const duties = shifts.map((s) => dutyInterval(s, policy.timeZone))
  const blocks = dutyBlocks(duties)
  const findings: WorkloadFinding[] = []
  if (blocks.length === 0) return findings

  // Continuous duty: blocks separated by less than a real break form one run, gaps included.
  let run: Block[] = []
  const flushRun = () => {
    if (run.length === 0) return
    const start = run[0].start
    const end = run[run.length - 1].end
    const minutes = Math.round((end - start) / MIN)
    if (minutes > policy.maxContinuousMinutes) {
      findings.push({ rule: "continuous", serviceDay: serviceDayOf(start, policy), start, end, minutes, limit: policy.maxContinuousMinutes, shiftIds: run.flatMap((b) => b.ids) })
    }
  }
  for (const b of blocks) {
    const last = run[run.length - 1]
    if (last && b.start - last.end < policy.minBreakMinutes * MIN) run.push(b)
    else {
      flushRun()
      run = [b]
    }
  }
  flushRun()

  // Gaps between two blocks: within a service day, the wait between missions; across, the rest.
  for (let i = 0; i + 1 < blocks.length; i++) {
    const a = blocks[i], b = blocks[i + 1]
    const minutes = Math.round((b.start - a.end) / MIN)
    // The day of the last minute worked: a mission ending exactly at the boundary closes the day before.
    const dayA = serviceDayOf(a.end - 1, policy)
    const dayB = serviceDayOf(b.start, policy)
    const ids = [...a.ids, ...b.ids]
    if (dayA === dayB) {
      if (minutes > policy.maxIdleGapMinutes) findings.push({ rule: "idle", serviceDay: dayA, start: a.end, end: b.start, minutes, limit: policy.maxIdleGapMinutes, shiftIds: ids })
    } else if (minutes < policy.minRestMinutes) {
      findings.push({ rule: "rest", serviceDay: dayA, start: a.end, end: b.start, minutes, limit: policy.minRestMinutes, shiftIds: ids })
    }
  }

  // Duty per service day, each block cut at the boundaries it crosses.
  const byDay = new Map<string, { minutes: number; ids: Set<string> }>()
  for (const b of blocks) {
    for (const part of splitByServiceDay(b, policy)) {
      const entry = byDay.get(part.day) ?? { minutes: 0, ids: new Set<string>() }
      entry.minutes += part.minutes
      b.ids.forEach((id) => entry.ids.add(id))
      byDay.set(part.day, entry)
    }
  }
  for (const [day, entry] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const minutes = Math.round(entry.minutes)
    if (minutes > policy.maxDailyMinutes) findings.push({ rule: "daily", serviceDay: day, start: null, end: null, minutes, limit: policy.maxDailyMinutes, shiftIds: [...entry.ids] })
  }

  // The whole event.
  const total = Math.round(blocks.reduce((n, b) => n + (b.end - b.start), 0) / MIN)
  if (total > policy.maxEventMinutes) findings.push({ rule: "event", serviceDay: null, start: null, end: null, minutes: total, limit: policy.maxEventMinutes, shiftIds: blocks.flatMap((b) => b.ids) })

  const order: Record<WorkloadRule, number> = { continuous: 0, idle: 1, rest: 2, daily: 3, event: 4 }
  return findings.sort((a, b) => (a.serviceDay ?? "~").localeCompare(b.serviceDay ?? "~") || order[a.rule] - order[b.rule] || (a.start ?? 0) - (b.start ?? 0))
}

/** What identifies a finding: the same rule, place in time and measured amount. */
export function findingKey(f: WorkloadFinding): string {
  return `${f.rule}|${f.serviceDay ?? ""}|${f.start ?? ""}|${f.end ?? ""}|${f.minutes}`
}

/**
 * The findings a change creates or worsens: those of the schedule after it that the schedule before
 * it did not have exactly. A change is refused when this is not empty; findings already there and
 * left as they were (an idle gap left by a cancellation, say) do not block an unrelated change, and
 * a change that removes a finding is welcome.
 */
export function newFindings(before: WorkloadFinding[], after: WorkloadFinding[]): WorkloadFinding[] {
  const known = new Set(before.map(findingKey))
  return after.filter((f) => !known.has(findingKey(f)))
}

/** The prospective check of a change on one person: their schedule before, and after the change. */
export function workloadChange(before: DutyShift[], after: DutyShift[], policy: WorkloadPolicy): WorkloadFinding[] {
  return newFindings(evaluateWorkload(before, policy), evaluateWorkload(after, policy))
}

/** Whether every shift of the finding is among `ids` (a finding about the submission alone). */
export function findingOnlyAbout(f: WorkloadFinding, ids: Set<string>): boolean {
  return f.shiftIds.every((id) => ids.has(id))
}

// ── Messages ────────────────────────────────────────────────────────────────

/** « 3 h », « 8 h 30 », local to the policy's zone. */
export function clockLabel(ms: number, timeZone: string): string {
  const { minutes } = localParts(ms, timeZone)
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase("fr-FR") + s.slice(1)

/**
 * One sentence per finding, the same on every page (no « tu » nor « vous »): the rule, the service
 * day, the times, what was measured and the event's limit.
 */
export function workloadFindingMessage(f: WorkloadFinding, policy: Pick<WorkloadPolicy, "timeZone">): string {
  const day = f.serviceDay ? `Journée de service du ${lowerFirst(fmtDay(f.serviceDay))}` : ""
  const at = (ms: number | null) => (ms === null ? "" : clockLabel(ms, policy.timeZone))
  switch (f.rule) {
    case "continuous":
      return `${day} : ${fmtDuration(f.minutes)} de missions d'affilée, de ${at(f.start)} à ${at(f.end)}, sans vraie pause. La limite de cet événement est de ${fmtDuration(f.limit)}.`
    case "idle":
      return `${day} : ces deux missions laissent ${fmtDuration(f.minutes)} entre elles, de ${at(f.start)} à ${at(f.end)}. La limite de cet événement est de ${fmtDuration(f.limit)}.`
    case "rest":
      return `${day} : seulement ${fmtDuration(f.minutes)} de repos avant la journée suivante, de ${at(f.start)} à ${at(f.end)}. Le repos minimum de cet événement est de ${fmtDuration(f.limit)}.`
    case "daily":
      return `${day} : ${fmtDuration(f.minutes)} de missions. La limite de cet événement est de ${fmtDuration(f.limit)} par journée de service.`
    case "event":
      return `Sur tout l'événement : ${fmtDuration(f.minutes)} de missions. La limite de cet événement est de ${fmtDuration(f.limit)}.`
  }
}

/** The configuration of an enabled event does not parse: nothing new is accepted until it is fixed. */
export const WORKLOAD_POLICY_INCOMPLETE = "La protection des pauses et de la charge de cet événement est incomplète : aucune nouvelle inscription n'est possible tant que l'organisation ne l'a pas complétée."

/** Public sign-up without proof of the address, when the finding involves registrations already held. */
export const WORKLOAD_PRIVATE_REFUSAL = "Avec les inscriptions déjà enregistrées à cette adresse, ces créneaux ne respecteraient pas les pauses et limites de charge de cet événement. Ouvre ton lien personnel pour voir le détail."

/** Examples of the boundary, shown before saving it: which service day typical missions belong to. */
export function serviceDayExamples(serviceDayStart: string): string[] {
  if (!HHMM.test(serviceDayStart)) return []
  const b = toMin(serviceDayStart)
  const label = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return mm === 0 ? `${h} h` : `${h} h ${String(mm).padStart(2, "0")}` }
  const examples: string[] = [`Une journée de service va de ${label(b)} à ${label(b)} le lendemain.`]
  if (b === 0) {
    examples.push("Une mission qui commence à 1 h compte dans la journée qui commence à minuit, pas dans celle de la veille.")
  } else {
    const night = Math.max(0, b - 7 * 60)
    examples.push(`Une mission qui commence à ${label(night)} compte dans la journée de service de la veille : l'attente depuis une mission du soir y est une attente, pas un repos.`)
    examples.push(`Entre une mission qui finit avant ${label(b)} et une mission qui commence à ${label(b)} ou plus tard, c'est le repos entre deux journées qui compte.`)
  }
  return examples
}
