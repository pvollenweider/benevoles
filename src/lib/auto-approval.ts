// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { APP_TIME_ZONE, localDateTimeToUtc } from "@/lib/time-zone"
import { signupOwnerEmails } from "@/lib/org-approval"

/**
 * « Validation automatique des nouveaux espaces » (#1371): a temporary, default-off option of the
 * hosted service. While it is on, a space created by the self-service sign-up is validated by the
 * scheduled job once its owner account has been active for a few minutes, without any check; a
 * hard daily ceiling cuts the option off and alerts the operator.
 *
 * This module is pure (no Prisma, no clock: the caller passes `now`), shared by the super admin
 * screen, the routes and the job. Dates are calendar days in the platform's zone (`APP_TIME_ZONE`,
 * the zone the super admin space already shows: see `localNow` in the admin forms), because « the
 * option is on until the end of that day » must mean the operator's day, not UTC. The daily budget
 * is counted in UTC days, the outbox job's own day.
 */

/** One setting row of the platform, the same model the sign-up switch uses. */
export const AUTO_APPROVAL_SETTING_KEY = "signup.autoApproval"

/** The option can be turned on for at most 30 calendar days, today included. */
export const AUTO_APPROVAL_MAX_DAYS = 30
/** At most this many automatic validations per UTC day: reached, the option is cut off. */
export const AUTO_APPROVAL_DAILY_CEILING = 20
/** The owner account must have been active for this long before its space is validated. */
export const AUTO_APPROVAL_MIN_AGE_MINUTES = 5

/** The operator's log target of a decision about the option itself. */
export const AUTO_APPROVAL_TARGET = "Validation automatique des nouveaux espaces"

/** The filtered organisations list: spaces validated automatically and not reread yet. */
export const AUTO_APPROVAL_REVIEW_FILTER = "auto-a-relire"
export const AUTO_APPROVAL_REVIEW_HREF = `/super-admin/organizations?filtre=${AUTO_APPROVAL_REVIEW_FILTER}`

/** The answer of every route and the reason the section is hidden on a self-hosted instance. */
export const AUTO_APPROVAL_HOSTED_ONLY = "La validation automatique n'existe que sur le service hébergé."

/** The section's explanatory sentence, exactly as the operator wrote it. */
export const AUTO_APPROVAL_EXPLANATION =
  "Tant qu'elle est activée, un espace créé par l'inscription est validé tout seul, 5 à 10 minutes après que son responsable a activé son compte, sans aucune vérification. Les espaces déjà en attente vous restent."

export type AutoApprovalState = "off" | "on" | "expired" | "cut_off"

/**
 * What the setting row stores. JSON strings rather than Date objects, so a value read from
 * PostgreSQL and a value written back are the same shape; the helpers parse them either way.
 */
export type AutoApprovalValue = {
  /** Last calendar day the option is on, inclusive (`YYYY-MM-DD`, `APP_TIME_ZONE`); null = off. */
  until: string | null
  /** When the current session was turned on. */
  activatedAt: string | null
  activatedById: string | null
  activatedByLabel: string | null
  /** The UTC day the daily budget below belongs to (`YYYY-MM-DD`). */
  budgetDate: string | null
  budgetUsed: number
  /** Validations made since the current session was turned on. */
  totalSinceActivation: number
  /** Set when the daily ceiling cut the option off. */
  cutOffAt: string | null
  /** Set when the operator dismissed the cut-off notice. */
  cutOffSeenAt: string | null
  /** Set by the first run that saw the option expired, so the log entry is written once. */
  expiredAt: string | null
  /** Set once the cut-off alert was raised, so a run does not ask the alert mechanism again. */
  cutOffAlertedAt: string | null
}

export const EMPTY_AUTO_APPROVAL: AutoApprovalValue = {
  until: null,
  activatedAt: null,
  activatedById: null,
  activatedByLabel: null,
  budgetDate: null,
  budgetUsed: 0,
  totalSinceActivation: 0,
  cutOffAt: null,
  cutOffSeenAt: null,
  expiredAt: null,
  cutOffAlertedAt: null,
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Whether a string is a real calendar day (`YYYY-MM-DD`), round-tripped through UTC. */
export function isCalendarDay(day: unknown): day is string {
  if (typeof day !== "string" || !CALENDAR_DAY.test(day)) return false
  const parsed = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
}

/** The calendar day `n` days after `day` (negative for before), in the same `YYYY-MM-DD` form. */
export function addCalendarDays(day: string, n: number): string {
  const parsed = new Date(`${day}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + n)
  return parsed.toISOString().slice(0, 10)
}

/** The UTC day of an instant (`YYYY-MM-DD`), the unit of the daily budget. */
export function autoApprovalBudgetDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** Today's calendar day in `timeZone`. */
export function autoApprovalDayInZone(now: Date, timeZone: string = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

/**
 * The instant the option stops: the start of the day after `until` in `timeZone`. « Jusqu'au 16
 * novembre inclus » therefore means until 17 November 00:00 local, including the whole last day
 * even when it is a daylight-saving day (23 or 25 hours).
 */
export function autoApprovalEndInstant(until: string | null, timeZone: string = APP_TIME_ZONE): Date | null {
  if (!isCalendarDay(until)) return null
  const next = addCalendarDays(until, 1)
  return localDateTimeToUtc(new Date(`${next}T00:00:00Z`), "00:00", timeZone)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function instantOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

function countOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** Reads a stored value defensively: a missing field, an old shape or bad JSON means the default. */
export function parseAutoApprovalValue(raw: unknown): AutoApprovalValue {
  let value: unknown = raw
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch { return { ...EMPTY_AUTO_APPROVAL } }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_AUTO_APPROVAL }
  const v = value as Record<string, unknown>
  return {
    until: isCalendarDay(v.until) ? v.until : null,
    activatedAt: instantOrNull(v.activatedAt),
    activatedById: stringOrNull(v.activatedById),
    activatedByLabel: stringOrNull(v.activatedByLabel),
    budgetDate: isCalendarDay(v.budgetDate) ? v.budgetDate : null,
    budgetUsed: countOrZero(v.budgetUsed),
    totalSinceActivation: countOrZero(v.totalSinceActivation),
    cutOffAt: instantOrNull(v.cutOffAt),
    cutOffSeenAt: instantOrNull(v.cutOffSeenAt),
    expiredAt: instantOrNull(v.expiredAt),
    cutOffAlertedAt: instantOrNull(v.cutOffAlertedAt),
  }
}

/**
 * The effective state at `now`. Expiry wins over a cut-off: once the chosen day is over the
 * option is expired, whatever stopped it before. A cut-off notice is kept separately in the view.
 */
export function autoApprovalState(value: unknown, now: Date, timeZone: string = APP_TIME_ZONE): AutoApprovalState {
  const v = parseAutoApprovalValue(value)
  const end = autoApprovalEndInstant(v.until, timeZone)
  if (!end) return "off"
  if (now.getTime() >= end.getTime()) return "expired"
  if (v.cutOffAt) return "cut_off"
  return "on"
}

/** The latest end day the operator may choose: today + 30 days in `timeZone`. */
export function autoApprovalMaxDay(now: Date, timeZone: string = APP_TIME_ZONE): string {
  return addCalendarDays(autoApprovalDayInZone(now, timeZone), AUTO_APPROVAL_MAX_DAYS)
}

/** « 16 décembre 2026 », a calendar day rendered in `timeZone` (noon avoids a DST edge). */
export function autoApprovalDayLabel(day: string, timeZone: string = APP_TIME_ZONE): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric", timeZone,
  })
}

/** « 16 décembre 2026 à 14:32 », an instant rendered in `timeZone`. */
export function autoApprovalMomentLabel(iso: string, timeZone: string = APP_TIME_ZONE): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone,
  })
}

/**
 * What is wrong with a chosen end day, or null. The same rule runs in the form and in the route:
 * a real day between today and today + 30 in the operator's zone, both included.
 */
export function autoApprovalUntilError(until: unknown, now: Date, timeZone: string = APP_TIME_ZONE): string | null {
  const day = typeof until === "string" ? until.trim() : ""
  if (!isCalendarDay(day)) return "Indiquez une date de fin."
  const today = autoApprovalDayInZone(now, timeZone)
  const max = autoApprovalMaxDay(now, timeZone)
  if (day < today || day > max) {
    return `Choisissez une date entre aujourd'hui et le ${autoApprovalDayLabel(max, timeZone)}.`
  }
  return null
}

/** The automatic validations still allowed today (a new UTC day starts from zero). */
export function autoApprovalRemainingBudget(value: unknown, now: Date): number {
  const v = parseAutoApprovalValue(value)
  const used = v.budgetDate === autoApprovalBudgetDay(now) ? v.budgetUsed : 0
  return Math.max(0, AUTO_APPROVAL_DAILY_CEILING - used)
}

/** The instant before which an owner's activation is too recent for the automatic validation. */
export function autoApprovalActivationCutoff(now: Date): Date {
  return new Date(now.getTime() - AUTO_APPROVAL_MIN_AGE_MINUTES * 60 * 1000)
}

/** The view the super admin section and the routes share; labels are rendered in `timeZone`. */
export type AutoApprovalView = {
  state: AutoApprovalState
  until: string | null
  untilLabel: string | null
  activatedAt: string | null
  activatedAtLabel: string | null
  activatedByLabel: string | null
  budgetUsed: number
  budgetCeiling: number
  totalSinceActivation: number
  cutOffAt: string | null
  cutOffLabel: string | null
  cutOffNotice: string | null
  today: string
  maxUntil: string
  maxUntilLabel: string
}

/** The view model of the setting: state, counters, cut-off notice and the bounds of the date field. */
export function autoApprovalView(value: unknown, now: Date, timeZone: string = APP_TIME_ZONE): AutoApprovalView {
  const v = parseAutoApprovalValue(value)
  const state = autoApprovalState(v, now, timeZone)
  const today = autoApprovalDayInZone(now, timeZone)
  const maxUntil = autoApprovalMaxDay(now, timeZone)
  const budgetUsed = v.budgetDate === autoApprovalBudgetDay(now) ? v.budgetUsed : 0
  const cutOffLabel = v.cutOffAt ? autoApprovalMomentLabel(v.cutOffAt, timeZone) : null
  return {
    state,
    until: v.until,
    untilLabel: v.until ? autoApprovalDayLabel(v.until, timeZone) : null,
    activatedAt: v.activatedAt,
    activatedAtLabel: v.activatedAt ? autoApprovalMomentLabel(v.activatedAt, timeZone) : null,
    activatedByLabel: v.activatedByLabel,
    budgetUsed,
    budgetCeiling: AUTO_APPROVAL_DAILY_CEILING,
    totalSinceActivation: v.totalSinceActivation,
    cutOffAt: v.cutOffAt,
    cutOffLabel,
    cutOffNotice: v.cutOffAt && !v.cutOffSeenAt && cutOffLabel
      ? `Attention : coupée automatiquement le ${cutOffLabel} : plafond de ${AUTO_APPROVAL_DAILY_CEILING} validations atteint.`
      : null,
    today,
    maxUntil,
    maxUntilLabel: autoApprovalDayLabel(maxUntil, timeZone),
  }
}

/** The state line of the section, one plain sentence (never a live region by itself). */
export function autoApprovalStateSentence(view: AutoApprovalView): string {
  switch (view.state) {
    case "on": {
      const by = view.activatedByLabel ? `, par ${view.activatedByLabel}` : ""
      const at = view.activatedAtLabel ? ` le ${view.activatedAtLabel}` : ""
      return `Activée jusqu'au ${view.untilLabel} inclus${by}${at}.`
    }
    case "expired":
      return `Expirée le ${view.untilLabel} : les nouveaux espaces restent en attente jusqu'à votre validation.`
    case "cut_off":
      return `Coupée automatiquement le ${view.cutOffLabel} : plafond de ${view.budgetCeiling} validations atteint. Les nouveaux espaces restent en attente jusqu'à votre validation.`
    default:
      return "Désactivée : les nouveaux espaces restent en attente jusqu'à votre validation."
  }
}

/** The two counters, as plain sentences. Empty while the option was never activated. */
export function autoApprovalCounterSentences(view: AutoApprovalView): string[] {
  if (!view.activatedAt) return []
  return [
    `Aujourd'hui : ${view.budgetUsed} sur ${view.budgetCeiling}`,
    `Depuis l'activation : ${view.totalSinceActivation}`,
  ]
}

/** An organisation as the eligibility rule reads it (the job's re-read uses the same fields). */
export type AutoApprovalCandidate = {
  createdAt: Date
  signupAt: Date | null
  active: boolean
  suspendedAt: Date | null
  publicationApprovedAt: Date | null
  outboundEmailApprovedAt: Date | null
  admins: readonly { email: string; createdAt: Date; isActive: boolean; activatedAt: Date | null }[]
}

export type AutoApprovalRefusal =
  | "not_signup"
  | "before_activation"
  | "inactive"
  | "suspended"
  | "already_approved"
  | "no_active_owner"
  | "owner_too_young"

/**
 * Why a space is not eligible, or null. Every condition of the brief is here, in one place: the
 * job uses it on its re-read under the setting row's lock, so a space that changed meanwhile is
 * skipped without consuming budget.
 */
export function autoApprovalCandidateProblem(
  org: AutoApprovalCandidate,
  value: Pick<AutoApprovalValue, "activatedAt">,
  now: Date,
): AutoApprovalRefusal | null {
  const activatedAt = value.activatedAt ? new Date(value.activatedAt) : null
  if (!org.signupAt) return "not_signup"
  // A space that was already waiting when the option was turned on stays for the operator.
  if (!activatedAt || Number.isNaN(activatedAt.getTime()) || org.createdAt.getTime() <= activatedAt.getTime()) return "before_activation"
  if (!org.active) return "inactive"
  if (org.suspendedAt) return "suspended"
  if (org.publicationApprovedAt !== null && org.outboundEmailApprovedAt !== null) return "already_approved"

  const owner = autoApprovalSignupOwner(org)
  if (!owner) return "no_active_owner"
  const cutoff = autoApprovalActivationCutoff(now)
  if (owner.activatedAt!.getTime() > cutoff.getTime()) return "owner_too_young"
  return null
}

/** The active owner account created by the sign-up, once it holds an activation instant. */
export function autoApprovalSignupOwner(
  org: Pick<AutoApprovalCandidate, "createdAt" | "admins">,
): AutoApprovalCandidate["admins"][number] | null {
  const emails = new Set(signupOwnerEmails(org.createdAt, org.admins))
  return org.admins.find((a) => emails.has(a.email) && a.isActive && a.activatedAt !== null) ?? null
}
