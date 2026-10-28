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
 * Lot 2 adds a rule on days off (« jours sans mission », policy version 2): at least N service
 * days without any mission in every P consecutive service days of the event. Version 1 policies
 * (saved before) keep reading: the rule is then « not chosen yet » and not applied.
 *
 * Still out (follow-ups): meal protection, travel margins, individual stricter limits, draft
 * publication (#1146).
 */
import { fmtDay, fmtDuration } from "./signup-recap"
import { toMin, toMinEnd } from "./gantt-utils"
import { isValidTimeZone, localDateTimeToUtc } from "./time-zone"
import { mergeIntervals } from "./interval-union"

/** The version written when every lot-2 section is answered; version 1 (lot 1 only) stays readable. */
export const WORKLOAD_POLICY_VERSION = 2

/**
 * The days-off rule: an explicit answer, never a blank. `apply: false` is a saved « do not apply »;
 * a version-1 policy has no answer at all (« pas encore choisi », not applied).
 */
export type OffDayRule = { apply: false } | { apply: true; minOffDays: number; windowDays: number }

/** Accepted range of the period of the days-off rule, in service days. */
export const OFF_DAY_WINDOW_RANGE = { min: 2, max: 31 } as const

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
  /** 1: lot 1 only (no `offDay`); 2: with the days-off answer. */
  version: 1 | 2
  /** IANA zone the boundary and the labels are read in, snapshotted when protection is turned on. */
  timeZone: string
  /** Local time a service day starts at, "HH:MM". Required: no hidden default. */
  serviceDayStart: string
  /** The days-off answer; absent only in a version-1 policy (not chosen yet, not applied). */
  offDay?: OffDayRule
}

/** What the organiser sets: the policy without its version and time zone (the server adds both). */
export type WorkloadPolicyValues = Omit<WorkloadPolicy, "version" | "timeZone">

export type WorkloadField = keyof WorkloadPolicyValues | "offDayMinOffDays" | "offDayWindowDays"

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

export const OFF_DAY_LABEL = "Jours sans mission"
export const OFF_DAY_MIN_LABEL = "Jours sans mission au minimum"
export const OFF_DAY_WINDOW_LABEL = "Période, en journées de service d'affilée"

/**
 * The values of the existing #465 warnings, offered as editable suggestions only: they are
 * « réglages d'avertissement existants », never legal, recommended or approved pilot thresholds.
 */
export const EXISTING_WARNING_SUGGESTIONS: Partial<WorkloadLimitsV1> = {
  maxContinuousMinutes: 6 * 60,
  minBreakMinutes: 30,
  maxDailyMinutes: 8 * 60,
}

/**
 * Benchmarks from employees' working-time law, offered as editable suggestions, each with its
 * source and exactly the fields it fills. They are never presented as obligations for volunteers.
 * Figures checked on 2026-10-28 against service-public.gouv.fr (F990, F18205), the European
 * Commission's page on directive 2003/88/EC and Swiss labour-office summaries of LTr art. 15 and 15a; the days-off one is an approximation (the directive
 * asks for 24 h + 11 h of uninterrupted rest per 7-day period, not an empty service day).
 */
export type WorkloadBenchmark = {
  id: "daily" | "rest" | "break" | "offDay"
  /** The value, as the organiser reads it. */
  text: string
  /** Where it comes from. */
  source: string
  /** Accessible name of its button. */
  action: string
  limits?: Partial<WorkloadLimitsV1>
  offDay?: OffDayRule
}

export const WORKLOAD_BENCHMARKS: WorkloadBenchmark[] = [
  { id: "daily", text: "10 h au plus par journée de service.", source: "Code du travail français, durée maximale quotidienne.", action: "Utiliser 10 h par journée de service", limits: { maxDailyMinutes: 10 * 60 } },
  { id: "rest", text: "11 h de repos au moins entre deux journées de service.", source: "Directive européenne 2003/88/CE, Code du travail français, loi suisse sur le travail.", action: "Utiliser 11 h de repos entre deux journées", limits: { minRestMinutes: 11 * 60 } },
  { id: "break", text: "Une pause d'au moins 20 min avant 6 h de missions d'affilée.", source: "Approximation du Code du travail français (20 min dès 6 h de travail dans la journée). La loi suisse sur le travail prévoit 15 min au-delà de 5 h 30, 30 min au-delà de 7 h et 1 h au-delà de 9 h.", action: "Utiliser une pause de 20 min avant 6 h d'affilée", limits: { maxContinuousMinutes: 6 * 60, minBreakMinutes: 20 } },
  { id: "offDay", text: "1 jour sans mission sur 7 journées de service d'affilée.", source: "Approximation du repos hebdomadaire de la directive européenne 2003/88/CE (24 h, plus les 11 h de repos quotidien, par période de 7 jours).", action: "Utiliser 1 jour sans mission sur 7", offDay: { apply: true, minOffDays: 1, windowDays: 7 } },
]

export type PolicyProblem = { field: WorkloadField | "timeZone" | "version"; message: string }

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n)

/** Checks the days-off answer; `undefined` comes back as « not answered ». */
function checkOffDay(value: unknown, problems: PolicyProblem[]): OffDayRule | undefined {
  if (value === undefined || value === null) return undefined
  const v = (typeof value === "object" ? value : {}) as Record<string, unknown>
  if (Object.keys(v).some((k) => !["apply", "minOffDays", "windowDays"].includes(k))) {
    problems.push({ field: "offDay", message: `${OFF_DAY_LABEL} : réglage inconnu.` })
    return undefined
  }
  if (v.apply === false) {
    if (v.minOffDays !== undefined || v.windowDays !== undefined) problems.push({ field: "offDay", message: `${OFF_DAY_LABEL} : sans règle, aucune valeur n'est attendue.` })
    return { apply: false }
  }
  if (v.apply !== true) {
    problems.push({ field: "offDay", message: `${OFF_DAY_LABEL} : choisissez d'appliquer ou non cette règle.` })
    return undefined
  }
  const { min, max } = OFF_DAY_WINDOW_RANGE
  let ok = true
  if (v.windowDays === undefined || v.windowDays === null || v.windowDays === "") {
    problems.push({ field: "offDayWindowDays", message: `${OFF_DAY_WINDOW_LABEL} : à compléter. Une valeur vide ne veut pas dire « sans limite ».` }); ok = false
  } else if (!isInt(v.windowDays) || v.windowDays < min || v.windowDays > max) {
    problems.push({ field: "offDayWindowDays", message: `${OFF_DAY_WINDOW_LABEL} : un nombre entier de ${min} à ${max} journées.` }); ok = false
  }
  if (v.minOffDays === undefined || v.minOffDays === null || v.minOffDays === "") {
    problems.push({ field: "offDayMinOffDays", message: `${OFF_DAY_MIN_LABEL} : à compléter. Une valeur vide ne veut pas dire « sans limite ».` }); ok = false
  } else if (!isInt(v.minOffDays) || v.minOffDays < 1) {
    problems.push({ field: "offDayMinOffDays", message: `${OFF_DAY_MIN_LABEL} : un nombre entier, au moins 1.` }); ok = false
  }
  if (!ok) return undefined
  const rule = { apply: true as const, minOffDays: v.minOffDays as number, windowDays: v.windowDays as number }
  if (rule.minOffDays >= rule.windowDays) {
    problems.push({ field: "offDayMinOffDays", message: "Le nombre de jours sans mission doit être plus petit que la période : sinon personne ne pourrait avoir de mission." })
    return undefined
  }
  return rule
}

export type PolicyParse = { ok: true; policy: WorkloadPolicy } | { ok: false; problems: PolicyProblem[] }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Checks the organiser's values (no version, no zone): every field present, whole minutes in range,
 * consistent. `requireOffDay`: the days-off answer is required (every write from the forms); only a
 * stored version-1 policy or default is read without it.
 */
export function checkPolicyValues(value: unknown, opts: { requireOffDay?: boolean } = {}): { ok: true; values: WorkloadPolicyValues } | { ok: false; problems: PolicyProblem[] } {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  const problems: PolicyProblem[] = []
  if (v.serviceDayStart === undefined || v.serviceDayStart === null || v.serviceDayStart === "") {
    problems.push({ field: "serviceDayStart", message: `${SERVICE_DAY_START_LABEL} : à compléter. Aucune heure n'est choisie à votre place.` })
  } else if (typeof v.serviceDayStart !== "string" || !HHMM.test(v.serviceDayStart)) {
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
  const offDay = checkOffDay(v.offDay, problems)
  if (offDay === undefined && opts.requireOffDay && !problems.some((p) => p.field.startsWith("offDay"))) {
    problems.push({ field: "offDay", message: `${OFF_DAY_LABEL} : choisissez d'appliquer ou non cette règle. Rien n'est choisi à votre place.` })
  }
  if (problems.length > 0) return { ok: false, problems }
  const values = {
    serviceDayStart: v.serviceDayStart as string,
    ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, v[f.key] as number])),
    ...(offDay ? { offDay } : {}),
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
  const version = v.version
  if (version !== 1 && version !== 2) problems.push({ field: "version", message: "Version de réglage inconnue." })
  if (typeof v.timeZone !== "string" || !isValidTimeZone(v.timeZone)) problems.push({ field: "timeZone", message: "Fuseau horaire inconnu." })
  // A key this version does not know is a rule it cannot enforce: never silently ignored. Version 1
  // has no days-off answer; version 2 must have one.
  const known = new Set<string>(["version", "timeZone", "serviceDayStart", ...WORKLOAD_LIMIT_FIELDS.map((f) => f.key), ...(version === 2 ? ["offDay"] : [])])
  if (Object.keys(v).some((k) => !known.has(k))) problems.push({ field: "version", message: "Réglage inconnu de cette version." })
  const values = checkPolicyValues(v, { requireOffDay: version === 2 })
  if (!values.ok) problems.push(...values.problems)
  if (problems.length > 0 || !values.ok) return { ok: false, problems }
  return { ok: true, policy: { version: version as 1 | 2, timeZone: v.timeZone as string, ...values.values } }
}

/** The organiser's values of a policy (no version, no zone). */
export function policyValues(p: WorkloadPolicy): WorkloadPolicyValues {
  return {
    serviceDayStart: p.serviceDayStart,
    ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, p[f.key]])),
    ...(p.offDay ? { offDay: p.offDay } : {}),
  } as WorkloadPolicyValues
}

/**
 * The policy to store: the organiser's values, the version, and the zone snapshotted now. Values
 * without the days-off answer (an organisation default saved before lot 2) stay a version-1 policy,
 * so that what is stored always parses.
 */
export function buildPolicy(values: WorkloadPolicyValues, timeZone: string): WorkloadPolicy {
  const { offDay, ...rest } = values
  return offDay ? { version: WORKLOAD_POLICY_VERSION, timeZone, ...rest, offDay } : { version: 1, timeZone, ...rest }
}

/** Whether a days-off rule is enforced (a saved « apply »; « do not apply » and « not chosen » are not). */
export function offDayApplies(p: Pick<WorkloadPolicy, "offDay">): p is { offDay: Extract<OffDayRule, { apply: true }> } {
  return p.offDay?.apply === true
}

/**
 * Whether `next` days-off rule can find something `prev` does not. N days off in every P days is
 * looser when N does not grow and P does not shrink: every window of P' ≥ P days holds a window of
 * P days, with at least N ≥ N' days off.
 */
function offDayTightens(prev: WorkloadPolicy, next: WorkloadPolicy): boolean {
  if (!offDayApplies(next)) return false
  if (!offDayApplies(prev)) return true
  return next.offDay.minOffDays > prev.offDay.minOffDays || next.offDay.windowDays < prev.offDay.windowDays
}

/**
 * Whether saving `next` over `prev` needs a scan of the commitments already held (Codex, PR 1):
 * turning protection on, repairing a policy that does not parse, any stricter limit, or a new
 * boundary or time zone. A change that only raises maxima and lowers minima (or changes nothing)
 * cannot create a finding, so it needs none.
 */
export function policyChangeNeedsScan(prev: WorkloadPolicy | null, next: WorkloadPolicy): boolean {
  if (!prev) return true
  // Version 1 → 2 alone changes nothing enforced (a version-1 policy has no days-off rule).
  if (prev.serviceDayStart !== next.serviceDayStart || prev.timeZone !== next.timeZone) return true
  return next.maxContinuousMinutes < prev.maxContinuousMinutes
    || next.minBreakMinutes > prev.minBreakMinutes
    || next.maxDailyMinutes < prev.maxDailyMinutes
    || next.maxEventMinutes < prev.maxEventMinutes
    || next.minRestMinutes > prev.minRestMinutes
    || next.maxIdleGapMinutes < prev.maxIdleGapMinutes
    || offDayTightens(prev, next)
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/** A committed mission of the person (confirmed place or pending request). */
export type DutyShift = { id: string; date: string | Date; startTime: string; endTime: string }

export type WorkloadRule = "continuous" | "daily" | "event" | "rest" | "idle" | "offday"

/**
 * One rule broken by a schedule. `start`/`end` are instants (ms): the continuous run, the gap for
 * rest and idle, or the service days concerned for « offday »; `minutes` what was measured (for
 * « offday », the fewest days without mission found in one period) and `limit` the policy's value.
 * `serviceDay` is the service day the finding belongs to ("YYYY-MM-DD"; for a gap, the one of the
 * mission before it; for « offday », the first day concerned).
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

/**
 * The service days of the event, from its first to its last date (shifts always lie within them).
 * The days-off rule looks at every complete period of P days inside them, empty days included, and
 * never at days outside the event (other commitments are not known here).
 */
export type EventHorizon = { firstDay: string; lastDay: string }

/** A stored policy with the event it judges: what the evaluator needs. */
export type ActivePolicy = WorkloadPolicy & { horizon: EventHorizon }

/** The horizon of an event's dates. */
export function eventHorizon(event: { startDate: string | Date; endDate: string | Date }): EventHorizon {
  return { firstDay: dayKey(event.startDate), lastDay: dayKey(event.endDate) }
}

/** The policy, ready to judge the event's schedules. */
export function activePolicy(policy: WorkloadPolicy, event: { startDate: string | Date; endDate: string | Date }): ActivePolicy {
  return { ...policy, horizon: eventHorizon(event) }
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)

/** Number of service days of a horizon. */
export function horizonDays(h: EventHorizon): number {
  return daysBetween(h.firstDay, h.lastDay) + 1
}

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
export function evaluateWorkload(shifts: DutyShift[], policy: ActivePolicy): WorkloadFinding[] {
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

  // Days off: a service day with any minute of duty is worked (a standby or a night task included).
  if (offDayApplies(policy)) findings.push(...offDayFindings(byDay, policy))

  const order: Record<WorkloadRule, number> = { continuous: 0, idle: 1, rest: 2, daily: 3, offday: 4, event: 5 }
  return findings.sort((a, b) => (a.serviceDay ?? "~").localeCompare(b.serviceDay ?? "~") || order[a.rule] - order[b.rule] || (a.start ?? 0) - (b.start ?? 0))
}

/**
 * « Au moins N jours sans mission sur toute période de P journées de service d'affilée » (Codex,
 * lot 2): every complete period of P days inside the event (widened to the person's own service days
 * outside it, if any) is checked; periods that fail and overlap or touch are reported as one finding,
 * from its first to its last day, with the fewest days off found. An event shorter than P days has
 * no complete period: nothing to check, which the organiser's form says before saving.
 */
function offDayFindings(byDay: Map<string, { minutes: number; ids: Set<string> }>, policy: ActivePolicy & { offDay: Extract<OffDayRule, { apply: true }> }): WorkloadFinding[] {
  const { minOffDays: n, windowDays: p } = policy.offDay
  const worked = new Set([...byDay].filter(([, e]) => e.minutes > 0).map(([d]) => d))
  if (worked.size === 0) return []
  const days = [...worked].sort()
  const first = days[0] < policy.horizon.firstDay ? days[0] : policy.horizon.firstDay
  const last = days[days.length - 1] > policy.horizon.lastDay ? days[days.length - 1] : policy.horizon.lastDay
  const span = daysBetween(first, last) + 1
  const out: WorkloadFinding[] = []
  let run: { from: string; to: string; minOff: number } | null = null
  const flush = () => {
    if (!run) return
    const ids = new Set<string>()
    for (let d = run.from; d <= run.to; d = addDays(d, 1)) byDay.get(d)?.ids.forEach((id) => ids.add(id))
    out.push({ rule: "offday", serviceDay: run.from, start: serviceDayStartsAt(run.from, policy), end: serviceDayStartsAt(addDays(run.to, 1), policy), minutes: run.minOff, limit: n, shiftIds: [...ids] })
    run = null
  }
  for (let i = 0; i + p <= span; i++) {
    const from = addDays(first, i)
    const to = addDays(from, p - 1)
    let workedInWindow = 0
    for (let d = from; d <= to; d = addDays(d, 1)) if (worked.has(d)) workedInWindow++
    const off = p - workedInWindow
    if (off >= n) { flush(); continue }
    if (run && from <= addDays(run.to, 1)) run = { from: run.from, to, minOff: Math.min(run.minOff, off) }
    else { flush(); run = { from, to, minOff: off } }
  }
  flush()
  return out
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
export function workloadChange(before: DutyShift[], after: DutyShift[], policy: ActivePolicy): WorkloadFinding[] {
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
export function workloadFindingMessage(f: WorkloadFinding, policy: Pick<WorkloadPolicy, "timeZone" | "offDay">): string {
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
    case "offday": {
      const lastDay = f.end === null ? (f.serviceDay ?? "") : addDays(localParts(f.end, policy.timeZone).date, -1)
      const from = f.serviceDay ?? lastDay
      const span = `Du ${lowerFirst(fmtDay(from))} au ${lowerFirst(fmtDay(lastDay))}`
      const window = policy.offDay?.apply ? policy.offDay.windowDays : null
      const per = window === null ? "" : ` sur ${window}`
      const ask = `Cet événement demande au moins ${f.limit} jour${f.limit > 1 ? "s" : ""} sans mission${per}${window === null ? "" : " journées de service"}.`
      if (f.minutes === 0) return `${span} : ${daysBetween(from, lastDay) + 1} journées de service d'affilée, toutes avec une mission. ${ask}`
      return `${span} : seulement ${f.minutes} jour${f.minutes > 1 ? "s" : ""} sans mission${window === null ? "" : ` sur ${window} journées de service d'affilée`}. ${ask}`
    }
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
