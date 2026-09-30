import { describe, it, expect } from "vitest"
import {
  DEFAULT_NOTIFICATION_SETTINGS, mergeNotificationSettings, notificationSettingsPatchSchema, notificationSummary, parseNotificationSettings, reminderEnabled,
} from "../notification-settings"

// Notification settings per organization (#381).
describe("notification settings", () => {
  it("defaults when nothing, something partial or garbage is stored", () => {
    expect(parseNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
    expect(parseNotificationSettings({ reminders: { j2: false } })).toEqual({ reminders: { j2: false, j1: true, dd: true }, signupAdminEmail: true })
    expect(parseNotificationSettings("nope")).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
    expect(parseNotificationSettings({ signupAdminEmail: "yes" })).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
  })

  it("maps the cron's kinds to the switches", () => {
    const s = parseNotificationSettings({ reminders: { dd: false } })
    expect(reminderEnabled(s, "reminder_j2")).toBe(true)
    expect(reminderEnabled(s, "reminder_dd")).toBe(false)
  })

  it("validates and merges a patch", () => {
    expect(notificationSettingsPatchSchema.safeParse({ replyToEmail: " Contact@Org.CH " }).data?.replyToEmail).toBe("contact@org.ch")
    expect(notificationSettingsPatchSchema.safeParse({ replyToEmail: "" }).success).toBe(true)
    expect(notificationSettingsPatchSchema.safeParse({ replyToEmail: "nope" }).success).toBe(false)
    expect(notificationSettingsPatchSchema.safeParse({ settings: { reminders: { j1: false } } }).data?.settings).toEqual({ reminders: { j1: false } })
    const merged = mergeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, { reminders: { j1: false } })
    expect(merged).toEqual({ reminders: { j2: true, j1: false, dd: true }, signupAdminEmail: true })
    expect(mergeNotificationSettings(merged, { signupAdminEmail: false })).toEqual({ reminders: { j2: true, j1: false, dd: true }, signupAdminEmail: false })
  })

  it("summarizes in one sentence", () => {
    expect(notificationSummary(DEFAULT_NOTIFICATION_SETTINGS, null)).toBe("Les trois rappels sont envoyés. Les admins reçoivent un email à chaque inscription. Les réponses des bénévoles arrivent à l'adresse par défaut de la plateforme.")
    expect(notificationSummary({ reminders: { j2: false, j1: true, dd: false }, signupAdminEmail: false }, "c@o.ch")).toBe("Rappels envoyés : Rappel J-1. Pas d'email aux admins à l'inscription. Les réponses des bénévoles arrivent à c@o.ch.")
    expect(notificationSummary({ reminders: { j2: false, j1: false, dd: false }, signupAdminEmail: true }, null)).toMatch(/^Aucun rappel automatique\./)
  })
})
