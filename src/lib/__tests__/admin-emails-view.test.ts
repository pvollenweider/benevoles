// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  ADMIN_EMAIL_KINDS,
  ADMIN_EMAILS_MAX_ROWS,
  NOT_ADMIN_EMAIL_KINDS,
  dayZoneSentence,
  groupAdminEmailCounts,
  groupAdminEmails,
} from "../admin-emails-view"
import { KIND_LABELS } from "../outbox-view"
import type { NotificationKind } from "../notifications/types"

const at = (iso: string, kind: string, outcome = "accepted_by_relay") => ({ kind, outcome, createdAt: new Date(iso) })

describe("groupAdminEmails — day in the operator's zone", () => {
  it("puts a 23:30 UTC row on the next day in Zurich", () => {
    const view = groupAdminEmails([
      at("2026-11-26T23:30:00Z", "admin_notification"),
      at("2026-11-26T10:00:00Z", "admin_notification"),
    ], "Europe/Zurich")

    expect(view.rows.map((r) => [r.day, r.kind, r.accepted, r.failed])).toEqual([
      ["2026-11-27", "admin_notification", 1, 0],
      ["2026-11-26", "admin_notification", 1, 0],
    ])
  })

  it("keeps a 23:30 UTC row on the same day in UTC", () => {
    const view = groupAdminEmails([at("2026-11-26T23:30:00Z", "admin_notification")], "UTC")

    expect(view.rows.map((r) => r.day)).toEqual(["2026-11-26"])
  })
})

describe("groupAdminEmails — kinds and outcomes", () => {
  it("groups by kind and counts every non-accepted outcome as refused or failed", () => {
    const view = groupAdminEmails([
      at("2026-11-26T10:00:00Z", "admin_notification"),
      at("2026-11-26T11:00:00Z", "admin_notification", "rejected_permanent"),
      at("2026-11-26T12:00:00Z", "admin_notification", "failed_temporary"),
      at("2026-11-26T13:00:00Z", "admin_notification", "unknown"),
      at("2026-11-26T14:00:00Z", "admin_invite"),
    ], "Europe/Zurich")

    expect(view).toEqual({
      rows: [
        { day: "2026-11-26", kind: "admin_invite", kindLabel: "Invitation d'un organisateur", accepted: 1, failed: 0 },
        { day: "2026-11-26", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 1, failed: 3 },
      ],
      truncated: false,
      total: 2,
    })
  })

  it("orders days newest first, then the French label of the kind", () => {
    const view = groupAdminEmails([
      at("2026-11-25T10:00:00Z", "admin_notification"),
      at("2026-11-27T10:00:00Z", "space_approved"),
      at("2026-11-27T11:00:00Z", "addresses_to_verify_summary"),
      at("2026-11-27T12:00:00Z", "admin_notification"),
    ], "Europe/Zurich")

    expect(view.rows.map((r) => [r.day, r.kindLabel])).toEqual([
      ["2026-11-27", "Espace activé"],
      ["2026-11-27", "Notification à l'équipe"],
      ["2026-11-27", "Résumé quotidien des adresses à vérifier"],
      ["2026-11-25", "Notification à l'équipe"],
    ])
  })
})

describe("groupAdminEmails — cap", () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => at(new Date(Date.UTC(2026, 0, 1 + i, 12)).toISOString(), "admin_notification"))

  it("keeps the latest 60 rows and says more exist", () => {
    const view = groupAdminEmails(days(ADMIN_EMAILS_MAX_ROWS + 1), "Europe/Zurich")

    expect(view.rows).toHaveLength(ADMIN_EMAILS_MAX_ROWS)
    expect(view.rows[0].day).toBe("2026-03-02")
    expect(view.rows.at(-1)?.day).toBe("2026-01-02")
    expect(view.truncated).toBe(true)
    expect(view.total).toBe(ADMIN_EMAILS_MAX_ROWS + 1)
  })

  it("does not flag exactly 60 rows", () => {
    const view = groupAdminEmails(days(ADMIN_EMAILS_MAX_ROWS), "Europe/Zurich")

    expect(view.rows).toHaveLength(ADMIN_EMAILS_MAX_ROWS)
    expect(view.truncated).toBe(false)
    expect(view.total).toBe(ADMIN_EMAILS_MAX_ROWS)
  })
})

describe("groupAdminEmails — empty", () => {
  it("returns no row and no truncation", () => {
    expect(groupAdminEmails([], "Europe/Zurich")).toEqual({ rows: [], truncated: false, total: 0 })
  })
})

describe("groupAdminEmailCounts", () => {
  it("merges per-day counts already aggregated by the database", () => {
    const view = groupAdminEmailCounts([
      { day: "2026-11-26", kind: "admin_notification", outcome: "accepted_by_relay", count: 2 },
      { day: "2026-11-26", kind: "admin_notification", outcome: "accepted_by_relay", count: 3 },
      { day: "2026-11-26", kind: "admin_notification", outcome: "rejected_permanent", count: 1 },
      { day: "2026-11-25", kind: "admin_notification", outcome: "accepted_by_relay", count: 4 },
    ])

    expect(view.rows).toEqual([
      { day: "2026-11-26", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 5, failed: 1 },
      { day: "2026-11-25", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 4, failed: 0 },
    ])
    expect(view.truncated).toBe(false)
  })
})

describe("dayZoneSentence", () => {
  it("names the zone as days, with the city only", () => {
    expect(dayZoneSentence("Europe/Zurich")).toBe("Jours en heure de Zurich.")
    expect(dayZoneSentence("America/New_York")).toBe("Jours en heure de New York.")
  })
})

describe("classification of the notification kinds", () => {
  it("puts every kind of KIND_LABELS in exactly one list", () => {
    const kinds = Object.keys(KIND_LABELS) as NotificationKind[]
    const admin = kinds.filter((k) => ADMIN_EMAIL_KINDS.has(k))
    const notAdmin = kinds.filter((k) => NOT_ADMIN_EMAIL_KINDS.has(k))

    expect([...admin, ...notAdmin].sort()).toEqual([...kinds].sort())
    expect(admin.filter((k) => NOT_ADMIN_EMAIL_KINDS.has(k))).toEqual([])
    expect([...ADMIN_EMAIL_KINDS].filter((k) => !(k in KIND_LABELS))).toEqual([])
    expect([...NOT_ADMIN_EMAIL_KINDS].filter((k) => !(k in KIND_LABELS))).toEqual([])
  })

  it("keeps the administrator kinds the owner requires, plus the organiser digests it missed", () => {
    for (const kind of [
      "addresses_to_verify_summary",
      "admin_notification",
      "registration_cancelled",
      "admin_invite",
      "admin_welcome",
      "space_approved",
      "past_event_notice",
      "org_inactivity_notice",
      "org_inactivity_deactivated",
      "org_reactivation",
      "shift_swap_approval_needed",
      "signup_confirmation",
      "signup_account_link",
      "password_reset",
      "front_desk_invite",
      "milestone_owner_reminder",
      // Sent to the organisation's owners and organisers (answer-change-notifications.ts,
      // availability-change-notifications.ts), not to sector leaders.
      "answers_changed",
      "availability_changed",
    ]) {
      expect(ADMIN_EMAIL_KINDS.has(kind as NotificationKind)).toBe(true)
    }
  })

  it("keeps volunteer, member, sector-leader and operator kinds out", () => {
    for (const kind of [
      "registration_confirmation",
      "member_invite",
      "reminder_j1",
      "targeted_message",
      "open_shifts",
      "availability_request",
      "sector_leader_invite",
      "sector_leader_answers_changed",
      "operator_alert",
      "release_available",
    ]) {
      expect(NOT_ADMIN_EMAIL_KINDS.has(kind as NotificationKind)).toBe(true)
    }
  })
})
