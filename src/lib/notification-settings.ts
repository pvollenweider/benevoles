// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * Notification settings of an organization (#381): which automatic emails go out, and where
 * replies land. Stored as JSON on the organization with a reply-to address next to it; absent
 * or partial settings mean the defaults, so older organizations behave as before. Per-event
 * overrides stay where they were: `Event.remindersEnabled` switches every reminder of one event.
 */

export const notificationSettingsSchema = z.object({
  reminders: z.object({
    j2: z.boolean().default(true),
    j1: z.boolean().default(true),
    dd: z.boolean().default(true),
  }).default({ j2: true, j1: true, dd: true }),
  /** Email to every admin of the organization at each public sign-up. */
  signupAdminEmail: z.boolean().default(true),
  /**
   * Email to the organization's admins and the role's sector leaders when a volunteer withdraws
   * a confirmed place or a pending request (#559). Separate from `signupAdminEmail`: a
   * withdrawal is more operational than a sign-up (owner decision, 2026-10-01). On by default,
   * and also gates the sector leaders' copy — one switch for the whole feature.
   */
  withdrawalAdminEmail: z.boolean().default(true),
  /**
   * Daily summary email when a confirmation, a waitlist offer or a reminder for an upcoming shift
   * failed permanently (#599, owner decision 2026-10-04): at most one a day, only when it
   * happened. On by default, consistent with the other admin notifications above.
   */
  addressesToVerifyAdminEmail: z.boolean().default(true),
})

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  reminders: { j2: true, j1: true, dd: true },
  signupAdminEmail: true,
  withdrawalAdminEmail: true,
  addressesToVerifyAdminEmail: true,
}

/** Whatever is stored (null, partial, garbage) becomes a complete settings object. */
export function parseNotificationSettings(stored: unknown): NotificationSettings {
  const parsed = notificationSettingsSchema.safeParse(stored ?? {})
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_SETTINGS
}

export const REMINDER_LABELS = {
  j2: { label: "Rappel J-2", help: "Deux jours avant le créneau." },
  j1: { label: "Rappel J-1", help: "La veille du créneau." },
  dd: { label: "Rappel du jour", help: "Deux à quatre heures avant le créneau." },
} as const

export type ReminderKey = keyof NotificationSettings["reminders"]

/** The reminder kind of the cron mapped to its setting. */
export const REMINDER_KIND_TO_KEY: Record<"reminder_j2" | "reminder_j1" | "reminder_dd", ReminderKey> = { reminder_j2: "j2", reminder_j1: "j1", reminder_dd: "dd" }

export function reminderEnabled(settings: NotificationSettings, kind: keyof typeof REMINDER_KIND_TO_KEY): boolean {
  return settings.reminders[REMINDER_KIND_TO_KEY[kind]]
}

/** Body of the settings PATCH: partial, so a form can send only what changed. */
export const notificationSettingsPatchSchema = z.object({
  replyToEmail: z.union([z.string().trim().toLowerCase().email().max(200), z.literal("")]).optional(),
  // No defaults here: an absent switch means « unchanged », not « back to true ».
  settings: z.object({
    reminders: z.object({ j2: z.boolean().optional(), j1: z.boolean().optional(), dd: z.boolean().optional() }).optional(),
    signupAdminEmail: z.boolean().optional(),
    withdrawalAdminEmail: z.boolean().optional(),
    addressesToVerifyAdminEmail: z.boolean().optional(),
  }).optional(),
})

export type NotificationSettingsPatch = NonNullable<z.infer<typeof notificationSettingsPatchSchema>["settings"]>

/** Merges a patch into the current settings, unknown keys dropped. */
export function mergeNotificationSettings(current: NotificationSettings, patch: NotificationSettingsPatch | undefined): NotificationSettings {
  if (!patch) return current
  const r = patch.reminders ?? {}
  return {
    reminders: { j2: r.j2 ?? current.reminders.j2, j1: r.j1 ?? current.reminders.j1, dd: r.dd ?? current.reminders.dd },
    signupAdminEmail: patch.signupAdminEmail ?? current.signupAdminEmail,
    withdrawalAdminEmail: patch.withdrawalAdminEmail ?? current.withdrawalAdminEmail,
    addressesToVerifyAdminEmail: patch.addressesToVerifyAdminEmail ?? current.addressesToVerifyAdminEmail,
  }
}

/** One sentence for the settings page. */
export function notificationSummary(s: NotificationSettings, replyToEmail: string | null): string {
  const on = (Object.keys(s.reminders) as ReminderKey[]).filter((k) => s.reminders[k]).map((k) => REMINDER_LABELS[k].label)
  const parts = [
    on.length === 0 ? "Aucun rappel automatique." : on.length === 3 ? "Les trois rappels sont envoyés." : `Rappels envoyés : ${on.join(", ")}.`,
    s.signupAdminEmail ? "Les admins reçoivent un email à chaque inscription." : "Pas d'email aux admins à l'inscription.",
    s.withdrawalAdminEmail ? "Les admins et les responsables de poste reçoivent un email à chaque désistement." : "Pas d'email aux admins ni aux responsables de poste en cas de désistement.",
    s.addressesToVerifyAdminEmail ? "Les admins reçoivent un résumé quotidien si des adresses sont à vérifier." : "Pas de résumé quotidien des adresses à vérifier.",
    replyToEmail ? `Les réponses des bénévoles arrivent à ${replyToEmail}.` : "Les réponses des bénévoles arrivent à l'adresse par défaut de la plateforme.",
  ]
  return parts.join(" ")
}
