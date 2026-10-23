// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Periodic check that someone still wants to keep an organisation's space (#811). Not an
 * automatic deletion: after 18 months without meaningful activity and with no upcoming event, the
 * administrators are asked whether to keep the space, reminded twice, and only then is it
 * deactivated, and later erased. A suspended organisation (abuse, #810) never goes through here.
 *
 * Rollout: `ORG_INACTIVITY=report` (the default) computes and lists everything, and sends,
 * deactivates and deletes nothing. `on` sends the three emails, each confirmed before the next
 * (src/lib/org-inactivity-steps.ts), and deactivates a space nobody answered for; erasure is not
 * enabled yet. Pure, Prisma-free.
 */

import { procedureView, type ProcedureInput } from "./org-inactivity-steps"

export type InactivityMode = "off" | "report" | "on"

export function inactivityMode(env: Record<string, string | undefined> = process.env): InactivityMode {
  const v = env.ORG_INACTIVITY?.trim().toLowerCase()
  return v === "off" ? "off" : v === "on" ? "on" : "report"
}

/** Months without meaningful activity before the first « Souhaitez-vous conserver votre espace ? ». */
export const INACTIVITY_MONTHS = 18

/**
 * The theoretical schedule the report shows (days after the first email): second reminder, last
 * reminder, deactivation, erasure. The procedure itself (`on`) waits for each message to be
 * confirmed, so these are the earliest dates, never a promise.
 */
export const INACTIVITY_STEPS = [
  { key: "first", label: "1er email « Souhaitez-vous conserver votre espace ? »", days: 0 },
  { key: "second", label: "2e rappel", days: 30 },
  { key: "last", label: "Dernier rappel", days: 60 },
  { key: "deactivate", label: "Désactivation", days: 75 },
  { key: "erase", label: "Effacement définitif", days: 165 },
] as const

export type InactivityStepKey = (typeof INACTIVITY_STEPS)[number]["key"]

export type InactivityFacts = {
  /** Latest meaningful activity (null: never measured; the migration sets it). */
  lastActivityAt: Date | null
  /** Latest « Conserver mon organisation » (not used yet: no email is sent in report mode). */
  lastRetentionConfirmedAt: Date | null
  /** An event that ends today or later: the procedure never starts or stops at once. */
  hasUpcomingEvent: boolean
  /** Ever published an event or received a registration (« utilisée ») or not (« jamais utilisée »). */
  everUsed: boolean
  suspended: boolean
  active: boolean
  /** The operator postponed the procedure: nothing happens before this date. */
  postponedUntil: Date | null
  /** The operator excluded the organisation for good: « Ne jamais désactiver automatiquement ». */
  exempt: boolean
}

export type InactivityAssessment =
  | { state: "excluded"; reason: "suspended" | "deactivated" | "exempt" | "upcoming-event" }
  | { state: "active"; firstEmailAt: Date }
  | { state: "due"; step: InactivityStepKey; stepLabel: string; firstEmailAt: Date; nextStep: { key: InactivityStepKey; label: string; at: Date } | null }

const DAY_MS = 24 * 60 * 60 * 1000

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

/** The reference date: the later of the last activity and the last confirmation. */
export function inactivitySince(f: Pick<InactivityFacts, "lastActivityAt" | "lastRetentionConfirmedAt">, fallback: Date): Date {
  const dates = [f.lastActivityAt, f.lastRetentionConfirmedAt].filter((d): d is Date => d !== null)
  return dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : fallback
}

/** Where an organisation stands in the schedule today (what `on` would do; `report` only lists it). */
export function assessInactivity(f: InactivityFacts, now: Date, fallback: Date = now): InactivityAssessment {
  if (f.suspended) return { state: "excluded", reason: "suspended" }
  if (!f.active) return { state: "excluded", reason: "deactivated" }
  if (f.exempt) return { state: "excluded", reason: "exempt" }
  if (f.hasUpcomingEvent) return { state: "excluded", reason: "upcoming-event" }
  const scheduled = addMonths(inactivitySince(f, fallback), INACTIVITY_MONTHS)
  const firstEmailAt = f.postponedUntil && f.postponedUntil.getTime() > scheduled.getTime() ? f.postponedUntil : scheduled
  if (now.getTime() < firstEmailAt.getTime()) return { state: "active", firstEmailAt }
  const elapsedDays = Math.floor((now.getTime() - firstEmailAt.getTime()) / DAY_MS)
  let index = 0
  for (let i = 0; i < INACTIVITY_STEPS.length; i++) if (elapsedDays >= INACTIVITY_STEPS[i].days) index = i
  const step = INACTIVITY_STEPS[index]
  const next = INACTIVITY_STEPS[index + 1]
  return {
    state: "due",
    step: step.key,
    stepLabel: step.label,
    firstEmailAt,
    nextStep: next ? { key: next.key, label: next.label, at: new Date(firstEmailAt.getTime() + next.days * DAY_MS) } : null,
  }
}

/** What the operator can postpone the procedure by, in months (« Reporter »). */
export const POSTPONE_MONTHS = [3, 6, 12] as const
export type PostponeMonths = (typeof POSTPONE_MONTHS)[number]

export function isPostponeMonths(value: unknown): value is PostponeMonths {
  return (POSTPONE_MONTHS as readonly unknown[]).includes(value)
}

/**
 * The date a postponement of `months` from `now` holds the procedure until. Counted from today,
 * not from the scheduled date: « reporter de 6 mois » means six months of quiet from now on.
 */
export function postponedUntil(now: Date, months: PostponeMonths): Date {
  return addMonths(now, months)
}

/** A write that counts as meaningful activity: throttle the update of the organisation's date. */
export const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000

/** The org-scoped models whose writes are meaningful activity (logs and bookkeeping are not). */
export const MEANINGFUL_MODELS: readonly string[] = [
  "event", "shift", "volunteer", "registration", "memberInvite", "eventPage", "sectorLeader",
  "eventMilestone", "eventQuestion", "targetedMessage", "messageTemplate", "organizationLogo",
]

export const WRITE_OPERATIONS: readonly string[] = ["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]

export function isMeaningfulWrite(model: string, operation: string): boolean {
  return MEANINGFUL_MODELS.includes(model) && WRITE_OPERATIONS.includes(operation)
}

/**
 * One organisation's place in the check, in words, for its page in the super admin space.
 * `day` formats a date (the page's time zone); `now` tells a running postponement from an old one.
 */
export function inactivityStatusText(
  info: {
    lastActivityAt: Date | null
    postponedUntil: Date | null
    assessment: InactivityAssessment
    /** The procedure under way (`on`, #1114), and a deactivation it made. */
    procedure?: ProcedureInput | null
    deactivatedAt?: Date | null
  },
  mode: InactivityMode,
  now: Date,
  day: (d: Date) => string,
): string {
  const last = `Dernière activité : ${info.lastActivityAt ? `le ${day(info.lastActivityAt)}` : "jamais mesurée"}.`
  if (mode === "off") return `${last} La vérification est désactivée (ORG_INACTIVITY=off).`
  const a = info.assessment
  if (info.deactivatedAt) return `${last} Désactivée faute de réponse le ${day(info.deactivatedAt)} ; ses administrateurs peuvent la réactiver depuis la page de connexion.`
  if (info.procedure && a.state === "due") {
    const paused = mode === "report" ? " Mode observation : la procédure est en pause, rien de plus n'est envoyé ni désactivé." : ""
    return `${last} ${procedureText(info.procedure, now, day)}${paused}`
  }
  if (a.state === "excluded") {
    const why = {
      suspended: "Organisation suspendue : la vérification ne la concerne pas.",
      deactivated: "Organisation désactivée : la vérification ne la concerne pas.",
      exempt: "Elle ne sera jamais désactivée automatiquement.",
      "upcoming-event": "Un événement est à venir ou en cours : rien ne se passe avant qu'il soit terminé.",
    }[a.reason]
    return `${last} ${why}`
  }
  const postponed = info.postponedUntil && info.postponedUntil.getTime() > now.getTime() ? info.postponedUntil : null
  const hold = postponed ? ` Reporté jusqu'au ${day(postponed)}.` : ""
  if (a.state === "active") return `${last}${hold} Premier email « Souhaitez-vous conserver votre espace ? » prévu le ${day(a.firstEmailAt)}.`
  const observe = mode === "report" ? " Mode observation : rien n'est envoyé." : ""
  return `${last}${hold} Premier email dû le ${day(a.firstEmailAt)} ; étape atteinte : ${a.stepLabel.charAt(0).toLowerCase()}${a.stepLabel.slice(1)}.${observe}`
}

/**
 * The procedure under way in words, for the operator (#1114): each message queued, sent or
 * blocked, the real planned date, and what blocks it. `day` formats in the organisation's zone.
 */
export function procedureText(p: ProcedureInput, now: Date, day: (d: Date) => string): string {
  const v = procedureView(p, now)
  const steps = v.steps.map((s) => {
    const label = s.label.charAt(0).toUpperCase() + s.label.slice(1)
    return s.state === "sent" ? `${label} : envoyé le ${day(s.at)}` : s.state === "queued" ? `${label} : en file d'attente depuis le ${day(s.at)}` : `${label} : bloqué (en file d'attente depuis le ${day(s.at)})`
  })
  const done = steps.length > 0 ? `${steps.join(" ; ")}.` : ""
  if (v.blocked) {
    // The outcome first: what the operator scans for.
    const floor = v.deadline && v.plannedAt ? ` Désactivation au plus tôt le ${day(v.plannedAt)}, une fois débloquée.` : ""
    return `Procédure bloquée : ${v.blocked.text}. Pas de désactivation tant que c'est le cas (une acceptation tardive fait reprendre la procédure) : à traiter manuellement (vérifier les adresses des administrateurs, les contacter autrement, reporter la vérification ou l'exclure).${done ? ` ${done}` : ""}${floor}`
  }
  const next = v.next ? ` Prochain message (${v.next.label.toLowerCase()}) au plus tôt le ${day(v.next.at)}.` : ""
  const planned = v.deadline && v.plannedAt ? ` Sans réponse d'ici le ${day(v.deadline)} inclus, désactivation au plus tôt le ${day(v.plannedAt)}.` : ""
  return `${done}${next}${planned}`
}

/** Days between an automatic deactivation and the planned erasure (step « erase » minus « deactivate »). */
export const ERASURE_AFTER_DEACTIVATION_DAYS = 90

/**
 * When a space deactivated for inactivity would be erased (#811, rollout 3). Shown to the operator
 * only: the erasure itself is not enabled, it waits for the owner's decision and the matching
 * change of the privacy policy, which today says such a space is kept while deactivated.
 */
export function erasureDate(deactivatedAt: Date): Date {
  return new Date(deactivatedAt.getTime() + ERASURE_AFTER_DEACTIVATION_DAYS * DAY_MS)
}

/** Whether that date has passed: the space would already be erased if erasure were enabled. */
export function erasureDue(deactivatedAt: Date, now: Date): boolean {
  return erasureDate(deactivatedAt).getTime() <= now.getTime()
}

export type InactivityEmailStep = "first" | "second" | "last"
