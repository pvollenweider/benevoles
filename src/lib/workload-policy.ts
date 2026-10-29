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
 * Lot 2 also adds meal protection (version 3): on the chosen days, when a person's duty touches a
 * meal window (local times inside one service day), the window must hold a stretch of the meal's
 * length free of any mission, except missions marked « repas sur le pouce possible » (the meal is
 * taken during them; they still count as work). A gap between two missions that holds that meal may
 * be longer than the idle limit by the meal's length, once per window.
 *
 * Version 4 adds the travel margin between places: two missions at different places of the event
 * (Shift.placeId) need at least the margin between them, and never at the same time. A mission
 * without a place is not checked (the organiser's screens say so).
 *
 * Version 5 adds stricter limits for minors (age on the service day of each mission, from the
 * stored birth date), and every policy also reads a person's own limits (`PersonalLimits`, stored
 * per event and person): the strictest of the event's, the minors' and the person's applies, never
 * looser than the event.
 *
 * Still out (follow-up): draft publication (#1146).
 */
import { fmtDay, fmtDuration } from "./signup-recap"
import { toMin, toMinEnd } from "./gantt-utils"
import { isValidTimeZone, localDateTimeToUtc } from "./time-zone"
import { mergeIntervals } from "./interval-union"

/**
 * The version written when every delivered section is answered. Older versions stay readable:
 * 1 (lot 1 only), 2 (with the days-off answer); 3 adds the meal answer.
 */
export const WORKLOAD_POLICY_VERSION = 5
export type WorkloadPolicyVersion = 1 | 2 | 3 | 4 | 5

/**
 * The days-off rule: an explicit answer, never a blank. `apply: false` is a saved « do not apply »;
 * a version-1 policy has no answer at all (« pas encore choisi », not applied).
 */
export type OffDayRule = { apply: false } | { apply: true; minOffDays: number; windowDays: number }

/** Accepted range of the period of the days-off rule, in service days. */
export const OFF_DAY_WINDOW_RANGE = { min: 2, max: 31 } as const

/** A meal window, local times "HH:MM", inside one service day. */
export type MealWindow = { start: string; end: string }

/**
 * The meal answer: `apply: false` is a saved « do not apply »; absent before version 3. `days` is
 * "all" (every service day) or the service days it applies to ("YYYY-MM-DD").
 */
export type MealRule = { apply: false } | { apply: true; minutes: number; windows: MealWindow[]; days: "all" | string[] }

export const MEAL_MINUTES_RANGE = { min: 10, max: 120 } as const
export const MEAL_WINDOWS_MAX = 3

/** The travel answer (#1171, lot 2, version 4): the margin between missions at different places. */
export type TravelRule = { apply: false } | { apply: true; minutes: number }

export const TRAVEL_MINUTES_RANGE = { min: 0, max: 15 } as const

/** The limits a stricter rule can set: for minors, or for one person (#1171, lot 2). */
export const STRICTER_FIELDS = ["maxContinuousMinutes", "minBreakMinutes", "maxDailyMinutes", "minRestMinutes"] as const
export type StricterField = (typeof STRICTER_FIELDS)[number]

/** The minors answer (version 5): apply with stricter values, or not. Never looser than the event. */
export type MinorsRule = { apply: false } | ({ apply: true } & Record<StricterField, number>)

/**
 * A person's own limits on an event (EventVolunteerLimit): each field overrides the event's when
 * stricter, and is ignored otherwise (the event, if tightened later, wins). No reason, ever.
 */
export type PersonalLimits = Partial<Record<StricterField | "maxEventMinutes", number>>
export const PERSONAL_FIELDS = [...STRICTER_FIELDS, "maxEventMinutes"] as const
export type PersonalField = (typeof PERSONAL_FIELDS)[number]

/** Whether a limit field is a maximum (stricter = smaller) or a minimum (stricter = larger). */
export const isMinimumField = (f: string) => f === "minBreakMinutes" || f === "minRestMinutes"

/** The stricter of two values of a field. */
export const stricterOf = (f: string, a: number, b: number) => (isMinimumField(f) ? Math.max(a, b) : Math.min(a, b))

/** The person a schedule belongs to, for the stricter rules: their birth date and own limits. */
export type WorkloadPerson = { birthDate?: Date | string | null; personal?: PersonalLimits | null }

/** Under 18 on that day ("YYYY-MM-DD"), from a birth date; unknown birth date: not known as a minor. */
export function minorOn(birthDate: Date | string | null | undefined, day: string): boolean {
  if (!birthDate) return false
  const b = typeof birthDate === "string" ? birthDate.slice(0, 10) : birthDate.toISOString().slice(0, 10)
  const eighteen = `${String(Number(b.slice(0, 4)) + 18).padStart(4, "0")}${b.slice(4)}`
  return day < eighteen
}

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
  version: WorkloadPolicyVersion
  /** IANA zone the boundary and the labels are read in, snapshotted when protection is turned on. */
  timeZone: string
  /** Local time a service day starts at, "HH:MM". Required: no hidden default. */
  serviceDayStart: string
  /** The days-off answer; absent only in a version-1 policy (not chosen yet, not applied). */
  offDay?: OffDayRule
  /** The meal answer; absent before version 3 (not chosen yet, not applied). */
  meal?: MealRule
  /** The travel answer; absent before version 4 (not chosen yet, not applied). */
  travel?: TravelRule
  /** The minors answer; absent before version 5 (not chosen yet, not applied). */
  minors?: MinorsRule
}

/** What the organiser sets: the policy without its version and time zone (the server adds both). */
export type WorkloadPolicyValues = Omit<WorkloadPolicy, "version" | "timeZone">

export type WorkloadField = keyof WorkloadPolicyValues | "offDayMinOffDays" | "offDayWindowDays" | "mealMinutes" | "mealWindows" | `mealWindow${number}` | "mealDays" | "travelMinutes" | `minors${string}`

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

export const MEAL_LABEL = "Pause repas"
export const MEAL_MINUTES_LABEL = "Durée du repas, en minutes"
export const MEAL_WINDOWS_LABEL = "Plages du repas"
export const MEAL_DAYS_LABEL = "Jours concernés"

export const TRAVEL_LABEL = "Trajet entre deux lieux"
export const TRAVEL_MINUTES_LABEL = "Marge entre deux lieux, en minutes"

export const MINORS_LABEL = "Moins de 18 ans"
/** The label of each stricter field, for minors and personal limits. */
export const STRICTER_LABELS: Record<PersonalField, string> = {
  maxContinuousMinutes: "Durée maximale sans vraie pause",
  minBreakMinutes: "Durée minimale d'une vraie pause",
  maxDailyMinutes: "Durée maximale par journée de service",
  minRestMinutes: "Repos minimum entre deux journées de service",
  maxEventMinutes: "Durée maximale sur tout l'événement",
}

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
  id: "daily" | "rest" | "break" | "offDay" | "meal" | "travel" | "minors"
  /** The value, as the organiser reads it. */
  text: string
  /** Where it comes from. */
  source: string
  /** Accessible name of its button. */
  action: string
  limits?: Partial<WorkloadLimitsV1>
  offDay?: OffDayRule
  meal?: MealRule
  travel?: TravelRule
  minors?: MinorsRule
}

export const WORKLOAD_BENCHMARKS: WorkloadBenchmark[] = [
  { id: "daily", text: "10 h au plus par journée de service.", source: "Code du travail français, durée maximale quotidienne.", action: "Utiliser 10 h par journée de service", limits: { maxDailyMinutes: 10 * 60 } },
  { id: "rest", text: "11 h de repos au moins entre deux journées de service.", source: "Directive européenne 2003/88/CE, Code du travail français, loi suisse sur le travail.", action: "Utiliser 11 h de repos entre deux journées", limits: { minRestMinutes: 11 * 60 } },
  { id: "break", text: "Une pause d'au moins 20 min avant 6 h de missions d'affilée.", source: "Approximation du Code du travail français (20 min dès 6 h de travail dans la journée). La loi suisse sur le travail prévoit 15 min au-delà de 5 h 30, 30 min au-delà de 7 h et 1 h au-delà de 9 h.", action: "Utiliser une pause de 20 min avant 6 h d'affilée", limits: { maxContinuousMinutes: 6 * 60, minBreakMinutes: 20 } },
  { id: "offDay", text: "1 jour sans mission sur 7 journées de service d'affilée.", source: "Approximation du repos hebdomadaire de la directive européenne 2003/88/CE (24 h, plus les 11 h de repos quotidien, par période de 7 jours).", action: "Utiliser 1 jour sans mission sur 7", offDay: { apply: true, minOffDays: 1, windowDays: 7 } },
  { id: "meal", text: "30 min de repas entre 11 h 30 et 14 h et entre 18 h et 21 h, tous les jours.", source: "Suggestion pour l'événementiel, pas une règle du droit du travail.", action: "Utiliser 30 min de repas entre 11 h 30 et 14 h et entre 18 h et 21 h", meal: { apply: true, minutes: 30, windows: [{ start: "11:30", end: "14:00" }, { start: "18:00", end: "21:00" }], days: "all" } },
  { id: "travel", text: "15 min entre deux missions à des lieux différents.", source: "Suggestion pour l'événementiel, pas une règle du droit du travail : le temps d'aller d'une scène à l'autre.", action: "Utiliser 15 min entre deux lieux", travel: { apply: true, minutes: 15 } },
  { id: "minors", text: "Moins de 18 ans (France) : 8 h au plus par journée de service, une pause d'au moins 30 min avant 4 h 30 d'affilée, 12 h de repos entre deux journées.", source: "Code du travail français pour les travailleurs de moins de 18 ans : 8 h par jour, une pause de 30 min dès 4 h 30 de travail continu, 12 h de repos (14 h avant 16 ans).", action: "Utiliser les repères pour les moins de 18 ans", minors: { apply: true, maxDailyMinutes: 8 * 60, maxContinuousMinutes: 4 * 60 + 30, minBreakMinutes: 30, minRestMinutes: 12 * 60 } },
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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Minutes of a window's bounds counted from the service-day boundary: [start, end), end 0 read as 24 h. */
export function mealWindowOffsets(w: MealWindow, serviceDayStart: string): { start: number; end: number } {
  const b = toMin(serviceDayStart)
  const off = (t: string) => (toMin(t) - b + 1440) % 1440
  const end = off(w.end)
  return { start: off(w.start), end: end === 0 ? 1440 : end }
}

/** Checks the meal answer against the service-day boundary; `undefined` comes back as « not answered ». */
function checkMeal(value: unknown, serviceDayStart: unknown, problems: PolicyProblem[]): MealRule | undefined {
  if (value === undefined || value === null) return undefined
  const v = (typeof value === "object" ? value : {}) as Record<string, unknown>
  if (Object.keys(v).some((k) => !["apply", "minutes", "windows", "days"].includes(k))) {
    problems.push({ field: "meal", message: `${MEAL_LABEL} : réglage inconnu.` })
    return undefined
  }
  if (v.apply === false) {
    if (v.minutes !== undefined || v.windows !== undefined || v.days !== undefined) problems.push({ field: "meal", message: `${MEAL_LABEL} : sans règle, aucune valeur n'est attendue.` })
    return { apply: false }
  }
  if (v.apply !== true) {
    problems.push({ field: "meal", message: `${MEAL_LABEL} : choisissez d'appliquer ou non cette règle.` })
    return undefined
  }
  let ok = true
  const { min, max } = MEAL_MINUTES_RANGE
  if (v.minutes === undefined || v.minutes === null || v.minutes === "") {
    problems.push({ field: "mealMinutes", message: `${MEAL_MINUTES_LABEL} : à compléter.` }); ok = false
  } else if (!isInt(v.minutes) || v.minutes < min || v.minutes > max) {
    problems.push({ field: "mealMinutes", message: `${MEAL_MINUTES_LABEL} : un nombre entier de ${min} à ${max} minutes.` }); ok = false
  }
  const windows = Array.isArray(v.windows) ? v.windows : null
  if (!windows || windows.length === 0) {
    problems.push({ field: "mealWindows", message: `${MEAL_WINDOWS_LABEL} : indiquez au moins une plage.` }); ok = false
  } else if (windows.length > MEAL_WINDOWS_MAX) {
    problems.push({ field: "mealWindows", message: `${MEAL_WINDOWS_LABEL} : ${MEAL_WINDOWS_MAX} plages au plus.` }); ok = false
  } else {
    windows.forEach((w, i) => {
      if (!w || typeof w !== "object" || Object.keys(w).some((k) => k !== "start" && k !== "end") || typeof w.start !== "string" || typeof w.end !== "string" || !HHMM.test(w.start) || !HHMM.test(w.end)) {
        problems.push({ field: `mealWindow${i}`, message: `Plage ${i + 1} : indiquez son début et sa fin (par exemple 11:30 et 14:00).` }); ok = false
      }
    })
  }
  // The windows are checked against each other and the boundary even when another part is missing,
  // so every row says its own problem at once (accessibility review).
  const windowsOk = !!windows && windows.length > 0 && windows.length <= MEAL_WINDOWS_MAX && !problems.some((p) => p.field.startsWith("mealWindow"))
  const minutesOk = isInt(v.minutes) && v.minutes >= min && v.minutes <= max
  if (windowsOk && typeof serviceDayStart === "string" && HHMM.test(serviceDayStart)) {
    // Each problem on its own row: the row's two fields carry it.
    const offsets = (windows as MealWindow[]).map((w) => mealWindowOffsets(w, serviceDayStart))
    offsets.forEach((o, i) => {
      if (o.start >= o.end) { problems.push({ field: `mealWindow${i}`, message: `Plage ${i + 1} : elle ne peut pas passer le début de la journée de service (${serviceDayStart}) ni finir avant de commencer.` }); ok = false }
      else if (minutesOk && o.end - o.start < (v.minutes as number)) { problems.push({ field: `mealWindow${i}`, message: `Plage ${i + 1} : elle doit durer au moins le temps du repas.` }); ok = false }
      else {
        const other = offsets.findIndex((p, j) => j < i && p.start < p.end && o.start < p.end && p.start < o.end)
        if (other >= 0) { problems.push({ field: `mealWindow${i}`, message: `La plage ${i + 1} chevauche la plage ${other + 1}.` }); ok = false }
      }
    })
  }
  // The days last, in the order of the form (the first problem takes the focus).
  const days = v.days
  if (days === undefined || days === null) {
    problems.push({ field: "mealDays", message: `${MEAL_DAYS_LABEL} : choisissez tous les jours ou certains jours.` }); ok = false
  } else if (days !== "all" && (!Array.isArray(days) || days.length === 0 || days.length > 62 || days.some((d) => typeof d !== "string" || !ISO_DAY.test(d)) || new Set(days).size !== days.length)) {
    problems.push({ field: "mealDays", message: `${MEAL_DAYS_LABEL} : cochez au moins un jour.` }); ok = false
  }
  if (!ok) return undefined
  const rule = { apply: true as const, minutes: v.minutes as number, windows: (windows as MealWindow[]).map((w) => ({ start: w.start, end: w.end })), days: days === "all" ? "all" as const : [...(days as string[])].sort() }
  return rule
}

/** Checks the travel answer; `undefined` comes back as « not answered ». */
function checkTravel(value: unknown, problems: PolicyProblem[]): TravelRule | undefined {
  if (value === undefined || value === null) return undefined
  const v = (typeof value === "object" ? value : {}) as Record<string, unknown>
  if (Object.keys(v).some((k) => k !== "apply" && k !== "minutes")) {
    problems.push({ field: "travel", message: `${TRAVEL_LABEL} : réglage inconnu.` })
    return undefined
  }
  if (v.apply === false) {
    if (v.minutes !== undefined) problems.push({ field: "travel", message: `${TRAVEL_LABEL} : sans règle, aucune valeur n'est attendue.` })
    return { apply: false }
  }
  if (v.apply !== true) {
    problems.push({ field: "travel", message: `${TRAVEL_LABEL} : choisissez d'appliquer ou non cette règle.` })
    return undefined
  }
  const { min, max } = TRAVEL_MINUTES_RANGE
  if (v.minutes === undefined || v.minutes === null || v.minutes === "") {
    problems.push({ field: "travelMinutes", message: `${TRAVEL_MINUTES_LABEL} : à compléter. Une valeur vide ne veut pas dire « sans limite ».` })
    return undefined
  }
  if (!isInt(v.minutes) || v.minutes < min || v.minutes > max) {
    problems.push({ field: "travelMinutes", message: `${TRAVEL_MINUTES_LABEL} : indiquez une marge de ${min} à ${max} minutes.` })
    return undefined
  }
  return { apply: true, minutes: v.minutes }
}

/** Why stricter values are not valid against the event's (minors or a person): one problem per field. */
export function stricterProblems(values: Partial<Record<PersonalField, unknown>>, event: Pick<WorkloadLimitsV1, PersonalField>, fieldOf: (f: PersonalField) => string, who: string, required: boolean): PolicyProblem[] {
  const problems: PolicyProblem[] = []
  for (const f of PERSONAL_FIELDS) {
    const v = values[f]
    if (v === undefined || v === null || v === "") {
      if (required && f !== "maxEventMinutes") problems.push({ field: fieldOf(f) as WorkloadField, message: `${who} — ${STRICTER_LABELS[f]} : à compléter.` })
      continue
    }
    const range = WORKLOAD_LIMIT_FIELDS.find((x) => x.key === f)!
    if (!isInt(v) || v < range.min || v > range.max) {
      problems.push({ field: fieldOf(f) as WorkloadField, message: `${who} — ${STRICTER_LABELS[f]} : entre ${fmtDuration(range.min)} et ${fmtDuration(range.max)}.` })
    } else if (isMinimumField(f) ? v < event[f] : v > event[f]) {
      problems.push({ field: fieldOf(f) as WorkloadField, message: `${who} — ${STRICTER_LABELS[f]} : jamais moins stricte que la limite de l'événement (${fmtDuration(event[f])}).` })
    }
  }
  return problems
}

/** Checks the minors answer against the event's limits; `undefined` comes back as « not answered ». */
function checkMinors(value: unknown, event: Partial<WorkloadLimitsV1>, problems: PolicyProblem[]): MinorsRule | undefined {
  if (value === undefined || value === null) return undefined
  const v = (typeof value === "object" ? value : {}) as Record<string, unknown>
  if (Object.keys(v).some((k) => k !== "apply" && !(STRICTER_FIELDS as readonly string[]).includes(k))) {
    problems.push({ field: "minors", message: `${MINORS_LABEL} : réglage inconnu.` })
    return undefined
  }
  if (v.apply === false) {
    if (Object.keys(v).length > 1) problems.push({ field: "minors", message: `${MINORS_LABEL} : sans règle, aucune valeur n'est attendue.` })
    return { apply: false }
  }
  if (v.apply !== true) {
    problems.push({ field: "minors", message: `${MINORS_LABEL} : choisissez d'appliquer ou non cette règle.` })
    return undefined
  }
  // Compared with the event's values only when those are valid (their own problems come first).
  const known = WORKLOAD_LIMIT_FIELDS.every((f) => isInt(event[f.key]))
  const base = known ? (event as WorkloadLimitsV1) : { maxContinuousMinutes: 24 * 60, minBreakMinutes: 0, maxDailyMinutes: 24 * 60, minRestMinutes: 0, maxEventMinutes: 30 * 24 * 60 }
  const before = problems.length
  problems.push(...stricterProblems(v, base, (f) => `minors${f.charAt(0).toUpperCase()}${f.slice(1)}`, MINORS_LABEL, true))
  if (problems.length > before) return undefined
  const rule = { apply: true as const, ...Object.fromEntries(STRICTER_FIELDS.map((f) => [f, v[f] as number])) } as Extract<MinorsRule, { apply: true }>
  if (rule.maxContinuousMinutes > rule.maxDailyMinutes) {
    problems.push({ field: "minorsMaxContinuousMinutes", message: `${MINORS_LABEL} — la durée sans vraie pause ne peut pas dépasser la durée par journée.` })
    return undefined
  }
  return rule
}

/** What a write must answer: every section of the current version. */
export const WRITE_SECTIONS = { requireOffDay: true, requireMeal: true, requireTravel: true, requireMinors: true } as const

/**
 * Checks the organiser's values (no version, no zone): every field present, whole minutes in range,
 * consistent. `requireOffDay`: the days-off answer is required (every write from the forms); only a
 * stored version-1 policy or default is read without it.
 */
export function checkPolicyValues(value: unknown, opts: { requireOffDay?: boolean; requireMeal?: boolean; requireTravel?: boolean; requireMinors?: boolean } = {}): { ok: true; values: WorkloadPolicyValues } | { ok: false; problems: PolicyProblem[] } {
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
  const meal = checkMeal(v.meal, v.serviceDayStart, problems)
  if (meal === undefined && opts.requireMeal && !problems.some((p) => p.field.startsWith("meal"))) {
    problems.push({ field: "meal", message: `${MEAL_LABEL} : choisissez d'appliquer ou non cette règle. Rien n'est choisi à votre place.` })
  }
  const travel = checkTravel(v.travel, problems)
  if (travel === undefined && opts.requireTravel && !problems.some((p) => p.field.startsWith("travel"))) {
    problems.push({ field: "travel", message: `${TRAVEL_LABEL} : choisissez d'appliquer ou non cette règle. Rien n'est choisi à votre place.` })
  }
  const minors = checkMinors(v.minors, v as Partial<WorkloadLimitsV1>, problems)
  if (minors === undefined && opts.requireMinors && !problems.some((p) => p.field.startsWith("minors"))) {
    problems.push({ field: "minors", message: `${MINORS_LABEL} : choisissez d'appliquer ou non cette règle. Rien n'est choisi à votre place.` })
  }
  if (problems.length > 0) return { ok: false, problems }
  const values = {
    serviceDayStart: v.serviceDayStart as string,
    ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, v[f.key] as number])),
    ...(offDay ? { offDay } : {}),
    ...(meal ? { meal } : {}),
    ...(travel ? { travel } : {}),
    ...(minors ? { minors } : {}),
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
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) problems.push({ field: "version", message: "Version de réglage inconnue." })
  if (typeof v.timeZone !== "string" || !isValidTimeZone(v.timeZone)) problems.push({ field: "timeZone", message: "Fuseau horaire inconnu." })
  // A key this version does not know is a rule it cannot enforce: never silently ignored. Version 1
  // has no days-off answer; version 2 must have one.
  const known = new Set<string>(["version", "timeZone", "serviceDayStart", ...WORKLOAD_LIMIT_FIELDS.map((f) => f.key), ...(version !== 1 ? ["offDay"] : []), ...(typeof version === "number" && version >= 3 ? ["meal"] : []), ...(typeof version === "number" && version >= 4 ? ["travel"] : []), ...(version === 5 ? ["minors"] : [])])
  if (Object.keys(v).some((k) => !known.has(k))) problems.push({ field: "version", message: "Réglage inconnu de cette version." })
  const n = typeof version === "number" ? version : 0
  const values = checkPolicyValues(v, { requireOffDay: n >= 2, requireMeal: n >= 3, requireTravel: n >= 4, requireMinors: n >= 5 })
  if (!values.ok) problems.push(...values.problems)
  if (problems.length > 0 || !values.ok) return { ok: false, problems }
  return { ok: true, policy: { version: version as WorkloadPolicyVersion, timeZone: v.timeZone as string, ...values.values } }
}

/** The organiser's values of a policy (no version, no zone). */
export function policyValues(p: WorkloadPolicy): WorkloadPolicyValues {
  return {
    serviceDayStart: p.serviceDayStart,
    ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, p[f.key]])),
    ...(p.offDay ? { offDay: p.offDay } : {}),
    ...(p.meal ? { meal: p.meal } : {}),
    ...(p.travel ? { travel: p.travel } : {}),
    ...(p.minors ? { minors: p.minors } : {}),
  } as WorkloadPolicyValues
}

/**
 * The policy to store: the organiser's values, the version, and the zone snapshotted now. Values
 * without the days-off answer (an organisation default saved before lot 2) stay a version-1 policy,
 * so that what is stored always parses.
 */
export function buildPolicy(values: WorkloadPolicyValues, timeZone: string): WorkloadPolicy {
  const { offDay, meal, travel, minors, ...rest } = values
  if (offDay && meal && travel && minors) return { version: 5, timeZone, ...rest, offDay, meal, travel, minors }
  if (offDay && meal && travel) return { version: 4, timeZone, ...rest, offDay, meal, travel }
  if (offDay && meal) return { version: 3, timeZone, ...rest, offDay, meal }
  return offDay ? { version: 2, timeZone, ...rest, offDay } : { version: 1, timeZone, ...rest }
}

/** Whether minors' limits are enforced. */
export function minorsApply(p: Pick<WorkloadPolicy, "minors">): p is { minors: Extract<MinorsRule, { apply: true }> } {
  return p.minors?.apply === true
}

/** Whether a travel margin is enforced. */
export function travelApplies(p: Pick<WorkloadPolicy, "travel">): p is { travel: Extract<TravelRule, { apply: true }> } {
  return p.travel?.apply === true
}

/** Whether a meal rule is enforced. */
export function mealApplies(p: Pick<WorkloadPolicy, "meal">): p is { meal: Extract<MealRule, { apply: true }> } {
  return p.meal?.apply === true
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
    // Any change of an applied meal rule, turning it off included (it also takes away the meal's
    // credit against waiting), is checked: no loosening is proven for it.
    || ((mealApplies(prev) || mealApplies(next)) && JSON.stringify(prev.meal) !== JSON.stringify(next.meal))
    // Travel: turning it on or a longer margin can create findings; off or shorter cannot.
    || (travelApplies(next) && (!travelApplies(prev) || next.travel.minutes > prev.travel.minutes))
    // Minors: turning it on, or any change while on (conservative).
    || (minorsApply(next) && JSON.stringify(prev.minors) !== JSON.stringify(next.minors))
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/**
 * A committed mission of the person (confirmed place or pending request). `mealOnTheGo`: the
 * organiser marked it « repas sur le pouce possible » (the meal can be taken during it).
 */
export type DutyShift = {
  id: string; date: string | Date; startTime: string; endTime: string; mealOnTheGo?: boolean | null
  /** The mission's place (#1171, lot 2, EventPlace), and its name for the messages; null: not checked for travel. */
  placeId?: string | null; placeName?: string | null
}

export type WorkloadRule = "continuous" | "daily" | "event" | "rest" | "idle" | "meal" | "offday" | "travel" | "places"

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
  /** For « travel » and « places »: the names of the two places, in time order. */
  places?: [string, string]
  /** The limit applied came from the minors' rule or from the person's own limits, not the event's. */
  scope?: "minor" | "personal"
}

const MIN = 60_000
const DAY_MS = 86_400_000
const dayKey = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

type Duty = { id: string; start: number; end: number; mealOnTheGo?: boolean | null; placeId?: string | null; placeName?: string | null; minor?: boolean }

/** A mission's real instants; an end at or before the start is on the next day (a night). */
export function dutyInterval(s: DutyShift, timeZone: string): Duty {
  const base = new Date(`${dayKey(s.date)}T00:00:00Z`)
  const start = localDateTimeToUtc(base, hhmm(toMin(s.startTime)), timeZone).getTime()
  const end = localDateTimeToUtc(base, hhmm(toMinEnd(s.endTime, s.startTime)), timeZone).getTime()
  return { id: s.id, start, end, ...(s.mealOnTheGo ? { mealOnTheGo: true } : {}), ...(s.placeId ? { placeId: s.placeId, placeName: s.placeName ?? null } : {}) }
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

type Block = { start: number; end: number; ids: string[]; minor?: boolean }

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
  return merged.map((m) => {
    const inside = duties.filter((d) => d.end > d.start && d.start < m.end && d.end > m.start)
    return { start: m.start, end: m.end, ids: inside.map((d) => d.id), minor: inside.some((d) => d.minor) }
  })
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
export function evaluateWorkload(shifts: DutyShift[], policy: ActivePolicy, person?: WorkloadPerson | null): WorkloadFinding[] {
  const minorRule = minorsApply(policy) && person?.birthDate ? policy.minors : null
  const duties = shifts.map((s) => {
    const d = dutyInterval(s, policy.timeZone)
    return minorRule && minorOn(person?.birthDate, serviceDayOf(d.start, policy)) ? { ...d, minor: true } : d
  })
  const blocks = dutyBlocks(duties)
  const findings: WorkloadFinding[] = []
  if (blocks.length === 0) return findings
  // The limits that apply (#1171, lot 2): the event's, made stricter by the person's own limits,
  // and by the minors' rule on minor duty. `limit(f, minor)` gives the value and where it came from.
  const personal = person?.personal ?? null
  const limit = (f: PersonalField, minor: boolean): { value: number; scope?: "minor" | "personal" } => {
    let value = policy[f]
    let scope: "minor" | "personal" | undefined
    const own = personal?.[f]
    if (typeof own === "number" && stricterOf(f, value, own) !== value) { value = own; scope = "personal" }
    if (minor && minorRule && f !== "maxEventMinutes") {
      const m = minorRule[f]
      if (stricterOf(f, value, m) !== value) { value = m; scope = "minor" }
    }
    return { value, scope }
  }
  const scoped = (scope?: "minor" | "personal") => (scope ? { scope } : {})

  // Continuous duty: blocks separated by less than a real break form one run, gaps included.
  let run: Block[] = []
  const flushRun = () => {
    if (run.length === 0) return
    const start = run[0].start
    const end = run[run.length - 1].end
    const minutes = Math.round((end - start) / MIN)
    const max = limit("maxContinuousMinutes", run.some((b) => b.minor))
    if (minutes > max.value) {
      findings.push({ rule: "continuous", serviceDay: serviceDayOf(start, policy), start, end, minutes, limit: max.value, shiftIds: run.flatMap((b) => b.ids), ...scoped(max.scope) })
    }
  }
  for (const b of blocks) {
    const last = run[run.length - 1]
    // A real break next to minor duty is the minors' (longer) one.
    if (last && b.start - last.end < limit("minBreakMinutes", !!(last.minor || b.minor)).value * MIN) run.push(b)
    else {
      flushRun()
      run = [b]
    }
  }
  flushRun()

  // Meals: the windows the person's duty touches, each checked, and their credit against waiting.
  const mealMinutes = mealApplies(policy) ? policy.meal.minutes : null
  const meals = mealApplies(policy) ? mealWindowsTouched(duties, policy) : []
  for (const m of meals) {
    if (mealMinutes !== null && m.longest < mealMinutes) findings.push({ rule: "meal", serviceDay: m.day, start: m.start, end: m.end, minutes: m.longest, limit: mealMinutes, shiftIds: m.ids })
  }
  // Credit against waiting: every window of the gap's service day counts, touched or not (a wait
  // across lunch holds lunch), each window once.
  const creditUsed = new Set<string>()

  // Gaps between two blocks: within a service day, the wait between missions; across, the rest.
  for (let i = 0; i + 1 < blocks.length; i++) {
    const a = blocks[i], b = blocks[i + 1]
    const minutes = Math.round((b.start - a.end) / MIN)
    // The day of the last minute worked: a mission ending exactly at the boundary closes the day before.
    const dayA = serviceDayOf(a.end - 1, policy)
    const dayB = serviceDayOf(b.start, policy)
    const ids = [...a.ids, ...b.ids]
    if (dayA === dayB) {
      // A gap that holds a protected meal may be longer by the meal's length, once per window.
      let limit = policy.maxIdleGapMinutes
      if (minutes > limit && mealMinutes !== null) {
        const meal = mealMinutes
        const w = mealWindowsOf(dayA, policy as ActivePolicy & { meal: Extract<MealRule, { apply: true }> })
          .find((m) => !creditUsed.has(m.key) && (Math.min(b.start, m.end) - Math.max(a.end, m.start)) / MIN >= meal)
        if (w) { creditUsed.add(w.key); limit += meal }
      }
      if (minutes > limit) findings.push({ rule: "idle", serviceDay: dayA, start: a.end, end: b.start, minutes, limit, shiftIds: ids })
    } else {
      const rest = limit("minRestMinutes", !!(a.minor || b.minor))
      if (minutes < rest.value) findings.push({ rule: "rest", serviceDay: dayA, start: a.end, end: b.start, minutes, limit: rest.value, shiftIds: ids, ...scoped(rest.scope) })
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
    // Minor on that service day: the minors' daily cap.
    const max = limit("maxDailyMinutes", !!minorRule && minorOn(person?.birthDate, day))
    if (minutes > max.value) findings.push({ rule: "daily", serviceDay: day, start: null, end: null, minutes, limit: max.value, shiftIds: [...entry.ids], ...scoped(max.scope) })
  }

  // The whole event.
  const total = Math.round(blocks.reduce((n, b) => n + (b.end - b.start), 0) / MIN)
  const eventMax = limit("maxEventMinutes", false)
  if (total > eventMax.value) findings.push({ rule: "event", serviceDay: null, start: null, end: null, minutes: total, limit: eventMax.value, shiftIds: blocks.flatMap((b) => b.ids), ...scoped(eventMax.scope) })

  // Travel between places (Codex, lot 2): two missions at known, different places at the same time,
  // or with less than the margin between them. Original missions, not merged blocks, so a place
  // keeps its identity through overlaps. A mission without a place is never checked.
  if (travelApplies(policy)) findings.push(...travelFindings(duties, policy))

  // Days off: a service day with any minute of duty is worked (a standby or a night task included).
  if (offDayApplies(policy)) findings.push(...offDayFindings(byDay, policy))

  const order: Record<WorkloadRule, number> = { continuous: 0, places: 1, travel: 2, idle: 3, meal: 4, rest: 5, daily: 6, offday: 7, event: 8 }
  return findings.sort((a, b) => (a.serviceDay ?? "~").localeCompare(b.serviceDay ?? "~") || order[a.rule] - order[b.rule] || (a.start ?? 0) - (b.start ?? 0))
}

/** Missions at two places at once, or too close: one finding per pair, in time order. */
function travelFindings(duties: Duty[], policy: ActivePolicy & { travel: Extract<TravelRule, { apply: true }> }): WorkloadFinding[] {
  const placed = duties.filter((d) => d.placeId && d.end > d.start).sort((a, b) => a.start - b.start || a.end - b.end)
  const margin = policy.travel.minutes * MIN
  const out: WorkloadFinding[] = []
  const name = (d: Duty) => d.placeName ?? "lieu sans nom"
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j]
      if (a.placeId === b.placeId) continue
      if (a.start < b.end && b.start < a.end) {
        const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end)
        out.push({ rule: "places", serviceDay: serviceDayOf(start, policy), start, end, minutes: Math.round((end - start) / MIN), limit: 0, shiftIds: [a.id, b.id], places: [name(a), name(b)] })
        continue
      }
      // Not overlapping: the earlier-ending one first.
      const [x, y] = a.end <= b.start ? [a, b] : [b, a]
      const gap = y.start - x.end
      if (gap < margin) out.push({ rule: "travel", serviceDay: serviceDayOf(x.end - 1, policy), start: x.end, end: y.start, minutes: Math.round(gap / MIN), limit: policy.travel.minutes, shiftIds: [x.id, y.id], places: [name(x), name(y)] })
    }
  }
  return out
}

/** One meal window a person's duty touches, with the longest stretch free of missions that do not allow a meal. */
type MealWindowCheck = { day: string; start: number; end: number; longest: number; ids: string[] }

/** The instant of a minute counted from the start of service day `day`. */
function serviceDayInstant(day: string, offset: number, policy: Pick<WorkloadPolicy, "timeZone" | "serviceDayStart">): number {
  const minutes = toMin(policy.serviceDayStart) + offset
  const date = minutes >= 1440 ? addDays(day, Math.floor(minutes / 1440)) : day
  return localDateTimeToUtc(new Date(`${date}T00:00:00Z`), hhmm(minutes % 1440), policy.timeZone).getTime()
}

/** The meal windows of one service day, as instants, when the rule applies to that day. */
function mealWindowsOf(day: string, policy: ActivePolicy & { meal: Extract<MealRule, { apply: true }> }): { key: string; start: number; end: number }[] {
  if (policy.meal.days !== "all" && !policy.meal.days.includes(day)) return []
  return policy.meal.windows.map((w, i) => {
    const o = mealWindowOffsets(w, policy.serviceDayStart)
    return { key: `${day}|${i}`, start: serviceDayInstant(day, o.start, policy), end: serviceDayInstant(day, o.end, policy) }
  })
}

/**
 * The meal windows (Codex, lot 2): on each applicable service day, a window is required when any
 * mission has a positive overlap with it (touching an end does not count). Missions marked
 * « repas sur le pouce possible » may hold the meal, so only the others take time out of it.
 */
function mealWindowsTouched(duties: Duty[], policy: ActivePolicy & { meal: Extract<MealRule, { apply: true }> }): MealWindowCheck[] {
  const days = new Set<string>()
  for (const d of duties) {
    if (d.end <= d.start) continue
    const last = serviceDayOf(d.end - 1, policy)
    for (let day = serviceDayOf(d.start, policy), i = 0; day <= last && i < 400; day = addDays(day, 1), i++) days.add(day)
  }
  const out: MealWindowCheck[] = []
  for (const day of [...days].sort()) {
    for (const { start, end } of mealWindowsOf(day, policy).sort((x, y) => x.start - y.start)) {
      const touching = duties.filter((d) => d.start < end && d.end > start)
      if (touching.length === 0) continue
      const busy = mergeIntervals(touching.filter((d) => !d.mealOnTheGo).map((d) => ({ start: Math.max(d.start, start), end: Math.min(d.end, end) })))
      let longest = 0, cur = start
      for (const b of busy) { longest = Math.max(longest, b.start - cur); cur = Math.max(cur, b.end) }
      longest = Math.max(longest, end - cur)
      out.push({ day, start, end, longest: Math.round(longest / MIN), ids: touching.map((d) => d.id) })
    }
  }
  return out
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
export function workloadChange(before: DutyShift[], after: DutyShift[], policy: ActivePolicy, person?: WorkloadPerson | null): WorkloadFinding[] {
  return newFindings(evaluateWorkload(before, policy, person), evaluateWorkload(after, policy, person))
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
export function workloadFindingMessage(f: WorkloadFinding, policy: Pick<WorkloadPolicy, "timeZone" | "offDay" | "meal"> & Partial<Pick<WorkloadPolicy, "maxIdleGapMinutes">>): string {
  const day = f.serviceDay ? `Journée de service du ${lowerFirst(fmtDay(f.serviceDay))}` : ""
  const at = (ms: number | null) => (ms === null ? "" : clockLabel(ms, policy.timeZone))
  // Whose limit: the event's, the minors' or the person's own.
  const of = f.scope === "minor" ? "La limite de cet événement pour les moins de 18 ans" : f.scope === "personal" ? "La limite personnelle de cette personne" : "La limite de cet événement"
  const restOf = f.scope === "minor" ? "Le repos minimum de cet événement pour les moins de 18 ans" : f.scope === "personal" ? "Le repos minimum personnel de cette personne" : "Le repos minimum de cet événement"
  switch (f.rule) {
    case "continuous":
      return `${day} : ${fmtDuration(f.minutes)} de missions d'affilée, de ${at(f.start)} à ${at(f.end)}, sans vraie pause. ${of} est de ${fmtDuration(f.limit)}.`
    case "idle": {
      const withMeal = policy.meal?.apply && f.limit > (policy.maxIdleGapMinutes ?? f.limit) ? ", pause repas comprise" : ""
      return `${day} : ces deux missions laissent ${fmtDuration(f.minutes)} entre elles, de ${at(f.start)} à ${at(f.end)}. La limite de cet événement est de ${fmtDuration(f.limit)}${withMeal}.`
    }
    case "places": {
      const [p1, p2] = f.places ?? ["un lieu", "un autre lieu"]
      return `${day} : deux missions en même temps à deux lieux différents, « ${p1} » et « ${p2} », de ${at(f.start)} à ${at(f.end)}. Une personne ne peut pas être à deux endroits à la fois.`
    }
    case "travel": {
      const [p1, p2] = f.places ?? ["un lieu", "un autre lieu"]
      const gap = f.minutes === 0 ? "aucun temps" : `seulement ${fmtDuration(f.minutes)}`
      return `${day} : ${gap} entre une mission à « ${p1} » qui finit à ${at(f.start)} et une mission à « ${p2} » qui commence à ${at(f.end)}. Cet événement demande ${fmtDuration(f.limit)} entre deux lieux différents.`
    }
    case "meal": {
      const found = f.minutes === 0 ? "aucun moment sans mission" : `au plus ${fmtDuration(f.minutes)} sans mission`
      return `${day} : pas de pause repas de ${fmtDuration(f.limit)} entre ${at(f.start)} et ${at(f.end)} (${found} dans cette plage). Cet événement demande ${fmtDuration(f.limit)} de repas dans cette plage, ou une mission où le repas sur le pouce est possible.`
    }
    case "rest":
      return `${day} : seulement ${fmtDuration(f.minutes)} de repos avant la journée suivante, de ${at(f.start)} à ${at(f.end)}. ${restOf} est de ${fmtDuration(f.limit)}.`
    case "daily":
      return `${day} : ${fmtDuration(f.minutes)} de missions. ${of} est de ${fmtDuration(f.limit)} par journée de service.`
    case "event":
      return `Sur tout l'événement : ${fmtDuration(f.minutes)} de missions. ${of} est de ${fmtDuration(f.limit)}.`
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


/** Minors protected and the birth date unknown: no new commitment until it is given. */
export const WORKLOAD_BIRTHDATE_REQUIRED = "Cet événement protège les moins de 18 ans : une date de naissance est nécessaire pour cette inscription."

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
