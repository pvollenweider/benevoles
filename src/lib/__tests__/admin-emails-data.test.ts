// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

const queryRaw = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }))

import { loadAdminEmails } from "../admin-emails-data"
import { ADMIN_EMAIL_KINDS, adminEmailsWindowStart } from "../admin-emails-view"
import { APP_TIME_ZONE } from "../time-zone"
import { RETENTION_DAYS } from "../retention"

const now = new Date("2026-12-15T12:00:00Z")

function lastQuery(): { sql: string; values: unknown[] } {
  const [strings, ...values] = queryRaw.mock.calls.at(-1) as [TemplateStringsArray, ...unknown[]]
  return { sql: strings.join("?"), values }
}

describe("loadAdminEmails", () => {
  beforeEach(() => vi.clearAllMocks())

  it("always filters by organisation and by the administrator kinds", async () => {
    queryRaw.mockResolvedValue([])

    await loadAdminEmails({ organizationId: "org-a", now })

    const { sql, values } = lastQuery()
    expect(sql).toContain(`WHERE "organizationId" = ?`)
    expect(sql).toContain(`AND "kind" = ANY(?::text[])`)
    expect(values[1]).toBe("org-a")
    expect(values[3]).toEqual([...ADMIN_EMAIL_KINDS])
  })

  it("takes the window from the DeliveryOutcome retention constant, starting at local midnight", async () => {
    queryRaw.mockResolvedValue([])

    await loadAdminEmails({ organizationId: "org-a", now })

    const { values } = lastQuery()
    expect(values[2]).toEqual(adminEmailsWindowStart(now, RETENTION_DAYS.deliveryOutcome))
    expect((values[2] as Date).toISOString()).toBe("2026-11-14T23:00:00.000Z")
    expect(RETENTION_DAYS.deliveryOutcome).toBe(30)
  })

  it("groups the civil day in APP_TIME_ZONE, reading the stored UTC timestamp first", async () => {
    queryRaw.mockResolvedValue([])

    await loadAdminEmails({ organizationId: "org-a", now })

    const { sql, values } = lastQuery()
    expect(sql).toContain(`("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ?`)
    expect(sql).not.toMatch(/"createdAt" AT TIME ZONE \?/)
    expect(sql).toContain("GROUP BY 1, 2, 3")
    expect(values[0]).toBe(APP_TIME_ZONE)
  })

  it("scopes each call to the organisation it was given", async () => {
    queryRaw.mockResolvedValue([])

    await loadAdminEmails({ organizationId: "org-a", now })
    await loadAdminEmails({ organizationId: "org-b", now })

    const calls = queryRaw.mock.calls as [TemplateStringsArray, ...unknown[]][]
    expect(calls[0][2]).toBe("org-a")
    expect(calls[1][2]).toBe("org-b")
  })

  it("turns the database counts into the section's rows", async () => {
    queryRaw.mockResolvedValue([
      { day: "2026-11-26", kind: "admin_notification", outcome: "accepted_by_relay", count: 2 },
      { day: "2026-11-26", kind: "admin_notification", outcome: "rejected_permanent", count: 1 },
      { day: "2026-11-25", kind: "admin_invite", outcome: "accepted_by_relay", count: 3 },
    ])

    const view = await loadAdminEmails({ organizationId: "org-a", now })

    expect(view.rows).toEqual([
      { day: "2026-11-26", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 2, failed: 1 },
      { day: "2026-11-25", kind: "admin_invite", kindLabel: "Invitation d'un organisateur", accepted: 3, failed: 0 },
    ])
    expect(view.truncated).toBe(false)
  })
})
