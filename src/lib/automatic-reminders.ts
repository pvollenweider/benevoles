// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What automatic reminders will actually go out for one event (#705), shared by the pre-publish
 * review item (#565) and the reminders box of the admin event page. Pure: no Prisma, no clock.
 *
 * The windows are the cron's (`/api/cron/reminders`, hourly): a reminder leaves when the first
 * shift of the volunteer's day starts between `minHours` and `maxHours` from now, and is grouped
 * per volunteer, event and day (#672).
 */

import { REMINDER_LABELS, type NotificationSettings, type ReminderKey } from "./notification-settings"
import { eventUsesCustomReminderRules, reminderRuleDelayBefore, type ReminderRuleInput } from "./reminder-rules"

export const REMINDER_KEYS = Object.keys(REMINDER_LABELS) as ReminderKey[]

/** Send windows of the reminders cron, in hours before the first shift of the day. */
export const REMINDER_WINDOW_HOURS: Record<ReminderKey, { minHours: number; maxHours: number }> = {
  j2: { minHours: 47, maxHours: 49 },
  j1: { minHours: 23, maxHours: 25 },
  dd: { minHours: 2, maxHours: 4 },
}

/** « environ 48 h » for a narrow window around a round figure, « 2 à 4 h » otherwise. */
export function reminderTiming(key: ReminderKey): string {
  const { minHours, maxHours } = REMINDER_WINDOW_HOURS[key]
  const span = maxHours - minHours <= 2 && minHours >= 12 ? `environ ${(minHours + maxHours) / 2} h` : `${minHours} à ${maxHours} h`
  return `${span} avant le premier créneau du jour`
}

/** One of the event's own rules (#1139), as the summaries read it. */
export type CustomReminderRule = Pick<ReminderRuleInput, "unit" | "value" | "enabled">

export type RemindersFacts = {
  /** The event's « Rappels automatiques » checkbox. */
  eventEnabled: boolean
  /** The organization's email settings (#381). */
  organization: NotificationSettings["reminders"]
  /** Whether a shift of the event still starts in the future. */
  upcomingShifts: boolean
  /** The event's own rules (#1139). At least one row (even disabled) replaces the three switches. */
  customRules?: readonly CustomReminderRule[]
}

export type RemindersState =
  | { kind: "no-upcoming-shift" }
  | { kind: "event-off" }
  | { kind: "custom-off" }
  | { kind: "custom"; rules: CustomReminderRule[] }
  | { kind: "on" | "partly-off" | "org-off"; on: ReminderKey[]; off: ReminderKey[] }

/**
 * Which reminders will go out. An event with its own rules ignores the three organisation
 * switches entirely (#1139): event switch first, then all rules disabled, then upcoming shifts.
 * Without a rule row, the legacy order is unchanged: no shift, event switch, organisation.
 */
export function remindersState(r: RemindersFacts): RemindersState {
  const customRules = r.customRules ?? []
  if (eventUsesCustomReminderRules(customRules)) {
    if (!r.eventEnabled) return { kind: "event-off" }
    const enabled = customRules.filter((rule) => rule.enabled)
    if (enabled.length === 0) return { kind: "custom-off" }
    if (!r.upcomingShifts) return { kind: "no-upcoming-shift" }
    return { kind: "custom", rules: enabled }
  }
  if (!r.upcomingShifts) return { kind: "no-upcoming-shift" }
  if (!r.eventEnabled) return { kind: "event-off" }
  const on = REMINDER_KEYS.filter((k) => r.organization[k])
  const off = REMINDER_KEYS.filter((k) => !r.organization[k])
  return { kind: off.length === 0 ? "on" : on.length === 0 ? "org-off" : "partly-off", on, off }
}

export const EMAIL_SETTINGS_HREF = "/admin/settings/notifications"

export type RemindersSummary = {
  state: RemindersState["kind"]
  /** True when every reminder goes out. */
  ok: boolean
  title: string
  /** The reminders that go out, with their timing. A custom rule keys on its position. */
  sent: { key: string; label: string; timing: string }[]
  /** Plain sentences, in reading order. */
  notes: string[]
  links: { href: string; label: string }[]
}

const list = (keys: ReminderKey[]) => {
  const labels = keys.map((k) => REMINDER_LABELS[k].label)
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}` : labels[0]
}

/** The reminders box of the admin event page (#705): what will be sent, when, and where it is set. */
export function remindersSummary(r: RemindersFacts & { eventId: string; published: boolean }): RemindersSummary {
  const state = remindersState(r)
  const eventLink = { href: `/admin/events/${r.eventId}/edit#event-reminders`, label: "Rappels automatiques de l'événement" }
  const customLink = { href: `/admin/events/${r.eventId}/message#event-reminder-rules`, label: "Délais des rappels de l'événement" }
  const settingsLink = { href: EMAIL_SETTINGS_HREF, label: "Paramètres des emails de l'organisation" }
  const draftNote = "Ils ne partent que tant que l'événement est publié."
  const custom = eventUsesCustomReminderRules(r.customRules ?? [])

  switch (state.kind) {
    case "no-upcoming-shift":
      return {
        state: state.kind, ok: false, sent: [], links: [],
        title: "Aucun rappel automatique à venir",
        notes: ["Aucun créneau de cet événement ne commence plus tard : plus aucun rappel automatique ne partira."],
      }
    case "event-off":
      return {
        state: state.kind, ok: false, sent: [], links: [eventLink],
        title: "Rappels automatiques coupés pour cet événement",
        notes: [custom
          ? "Aucun rappel automatique ne part pour cet événement, quels que soient les paramètres de l'organisation et les délais choisis. Cochez la case Rappels automatiques de l'événement pour les rétablir."
          : "Aucun rappel J-2, J-1 ni du jour ne part pour cet événement, quels que soient les paramètres de l'organisation. Cochez la case Rappels automatiques de l'événement pour les rétablir."],
      }
    case "custom-off":
      return {
        state: state.kind, ok: false, sent: [], links: [customLink],
        title: "Rappels automatiques désactivés pour cet événement",
        notes: [
          "Tous les rappels de cet événement sont désactivés : aucun email automatique ne partira. Activez au moins un rappel pour les rétablir.",
          ...(!r.published ? [draftNote] : []),
        ],
      }
    case "custom": {
      const all = r.customRules ?? []
      const sent = state.rules.map((rule, index) => ({
        key: `rule-${index}`,
        label: `Rappel ${reminderRuleDelayBefore(rule)}`,
        // The delay already carries « avant »: no second timing sentence.
        timing: "",
      }))
      const off = all.filter((rule) => !rule.enabled).length
      const notes = [
        "Ces délais remplacent les trois rappels habituels et les paramètres de l'organisation pour cet événement.",
        "Chaque bénévole inscrit reçoit ces emails sans action de votre part. Inscrit à plusieurs créneaux le même jour, il reçoit un seul email par rappel, qui liste tous ses créneaux de ce jour-là.",
      ]
      if (off > 0) notes.push(`${off} rappel${off > 1 ? "s sont désactivés" : " est désactivé"} pour cet événement.`)
      if (!r.published) notes.push(draftNote)
      return {
        state: state.kind, ok: true, sent, notes, links: [customLink],
        title: "Rappels automatiques avec vos délais",
      }
    }
    case "org-off":
      return {
        state: state.kind, ok: false, sent: [], links: [settingsLink, eventLink],
        title: "Aucun rappel automatique : désactivés pour l'organisation",
        notes: ["Les bénévoles ne reçoivent aucun rappel avant leurs créneaux. Vous pouvez les réactiver dans les paramètres des emails de l'organisation."],
      }
    default: {
      const sent = state.on.map((key) => ({ key, label: REMINDER_LABELS[key].label, timing: reminderTiming(key) }))
      const notes = [
        "Chaque bénévole inscrit reçoit ces emails sans action de votre part. Inscrit à plusieurs créneaux le même jour, il reçoit un seul email par rappel, qui liste tous ses créneaux de ce jour-là.",
      ]
      if (state.kind === "partly-off") {
        notes.push(`${list(state.off)} ${state.off.length > 1 ? "sont désactivés" : "est désactivé"} pour l'organisation.`)
      }
      if (!r.published) notes.push(draftNote)
      return {
        state: state.kind, ok: state.kind === "on", sent, notes, links: [eventLink, settingsLink],
        title: state.kind === "on" ? "Rappels automatiques activés" : "Rappels automatiques en partie désactivés pour l'organisation",
      }
    }
  }
}
