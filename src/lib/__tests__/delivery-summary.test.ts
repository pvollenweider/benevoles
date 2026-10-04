// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { IMPORTANT_NOTIFICATION_KINDS, isImportantNotificationKind, summaryDayKey } from "../delivery-summary"

describe("isImportantNotificationKind", () => {
  it("covers a confirmation, a waitlist offer and every reminder kind (#599, owner decision)", () => {
    expect(isImportantNotificationKind("registration_confirmation")).toBe(true)
    expect(isImportantNotificationKind("waitlist_offered")).toBe(true)
    expect(isImportantNotificationKind("reminder_j2")).toBe(true)
    expect(isImportantNotificationKind("reminder_j1")).toBe(true)
    expect(isImportantNotificationKind("reminder_dd")).toBe(true)
  })

  it("excludes everything else, e.g. a targeted message or a member invite", () => {
    expect(isImportantNotificationKind("targeted_message")).toBe(false)
    expect(isImportantNotificationKind("member_invite")).toBe(false)
    expect(isImportantNotificationKind("admin_notification")).toBe(false)
  })

  it("exposes the same set directly", () => {
    expect(IMPORTANT_NOTIFICATION_KINDS.has("registration_confirmation")).toBe(true)
    expect(IMPORTANT_NOTIFICATION_KINDS.size).toBe(5)
  })
})

describe("summaryDayKey", () => {
  it("is a stable UTC day, so the dedupe key is the same for every run of the same night", () => {
    expect(summaryDayKey(new Date("2026-03-10T02:00:00Z"))).toBe("2026-03-10")
    expect(summaryDayKey(new Date("2026-03-10T23:59:00Z"))).toBe("2026-03-10")
    expect(summaryDayKey(new Date("2026-03-11T00:00:01Z"))).toBe("2026-03-11")
  })
})
