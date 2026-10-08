import { describe, it, expect, vi } from "vitest"
import { memoryStore } from "@/lib/rate-limit"
import { DEFAULT_SEND_LIMITS, sendCategory, sendLimits, sendWindows, takeSendAllowance, type SendLimits } from "../send-limits"

const tight: SendLimits = { orgPerMinute: 3, orgPerDay: 5, orgBulkPerDay: 2, orgAccountPerDay: 1, globalPerMinute: 10, recipientPerHour: 2 }

describe("email sending limits (#810)", () => {
  it("sorts kinds into bulk, account and automatic", () => {
    expect(sendCategory("targeted_message")).toBe("bulk")
    expect(sendCategory("member_invite")).toBe("bulk")
    expect(sendCategory("open_shifts")).toBe("bulk")
    // A password reset is public-triggered: per-recipient cap, not the organisation's account cap.
    expect(sendCategory("password_reset")).toBe("automatic")
    expect(sendCategory("admin_invite")).toBe("account")
    expect(sendCategory("registration_confirmation")).toBe("automatic")
    expect(sendCategory("reminder_j1")).toBe("automatic")
  })

  it("reads each limit from its variable when it is a positive integer, else keeps the default", () => {
    expect(sendLimits({})).toEqual(DEFAULT_SEND_LIMITS)
    const l = sendLimits({ EMAIL_LIMIT_ORG_PER_MINUTE: "30", EMAIL_LIMIT_GLOBAL_PER_MINUTE: "0", EMAIL_LIMIT_ORG_PER_DAY: "abc" })
    expect(l.orgPerMinute).toBe(30)
    expect(l.globalPerMinute).toBe(DEFAULT_SEND_LIMITS.globalPerMinute)
    expect(l.orgPerDay).toBe(DEFAULT_SEND_LIMITS.orgPerDay)
  })

  it("counts every email of an organisation, members included, and only the global rate for platform emails", () => {
    expect(sendWindows("org-1", "registration_confirmation", tight).map((w) => w.name)).toEqual(["global_per_minute", "org_per_minute", "org_per_day"])
    expect(sendWindows("org-1", "targeted_message", tight).map((w) => w.name)).toContain("org_bulk_per_day")
    expect(sendWindows("org-1", "admin_invite", tight).map((w) => w.name)).toContain("org_account_per_day")
    expect(sendWindows("org-1", "password_reset", tight, "a@b.ch").map((w) => w.name)).toEqual(["recipient_per_hour", "global_per_minute", "org_per_minute", "org_per_day"])
    // The recipient is never stored as such: only a hash in the key.
    expect(sendWindows("org-1", "password_reset", tight, "a@b.ch")[0].key).not.toContain("a@b.ch")
    expect(sendWindows(null, "release_available", tight).map((w) => w.name)).toEqual(["global_per_minute"])
  })

  it("holds an email over the per-minute rate, with when to try again, and alerts once", async () => {
    const store = memoryStore()
    const alert = vi.fn()
    const results = []
    for (let i = 0; i < 5; i++) results.push(await takeSendAllowance("org-1", "registration_confirmation", { store, limits: tight, alert }))
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true)
    expect(results[3]).toMatchObject({ ok: false, limit: "org_per_minute" })
    expect((results[3] as { retryAfterMs: number }).retryAfterMs).toBeGreaterThan(0)
    expect(results[4].ok).toBe(false)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert).toHaveBeenCalledWith("org_per_minute", "org-1")
  })

  it("caps bulk emails per day separately from the rest", async () => {
    const store = memoryStore()
    const limits = { ...tight, orgPerMinute: 100, orgPerDay: 100 }
    expect((await takeSendAllowance("org-1", "targeted_message", { store, limits, alert: vi.fn() })).ok).toBe(true)
    expect((await takeSendAllowance("org-1", "targeted_message", { store, limits, alert: vi.fn() })).ok).toBe(true)
    expect(await takeSendAllowance("org-1", "targeted_message", { store, limits, alert: vi.fn() })).toMatchObject({ ok: false, limit: "org_bulk_per_day" })
    // An automatic email (a registration confirmation) still goes.
    expect((await takeSendAllowance("org-1", "registration_confirmation", { store, limits, alert: vi.fn() })).ok).toBe(true)
  })

  it("keeps organisations apart, and lets an email go if the store fails", async () => {
    const store = memoryStore()
    for (let i = 0; i < 3; i++) await takeSendAllowance("org-1", "reminder_j1", { store, limits: tight, alert: vi.fn() })
    expect((await takeSendAllowance("org-2", "reminder_j1", { store, limits: tight, alert: vi.fn() })).ok).toBe(true)
    const broken = { hit: vi.fn().mockRejectedValue(new Error("db down")), peek: vi.fn() }
    expect(await takeSendAllowance("org-1", "reminder_j1", { store: broken, limits: tight, alert: vi.fn() })).toEqual({ ok: true })
  })

  // Security review of #817: a held email retried every minute must not count again.
  it("counts only the emails that go: held ones and their retries use up nothing", async () => {
    const store = memoryStore()
    const limits = { ...tight, orgPerDay: 100 }
    for (let i = 0; i < 3; i++) expect((await takeSendAllowance("org-1", "reminder_j1", { store, limits, alert: vi.fn() })).ok).toBe(true)
    for (let i = 0; i < 20; i++) expect((await takeSendAllowance("org-1", "reminder_j1", { store, limits, alert: vi.fn() })).ok).toBe(false)
    expect((await store.peek("email:org:org-1:day"))?.count).toBe(3)
    expect((await store.peek("email:global:minute"))?.count).toBe(3)
  })

  // Security review of #817: password resets requested in a loop must not block account recovery.
  it("caps public-triggered emails per recipient, before the organisation's windows", async () => {
    const store = memoryStore()
    const limits = { ...tight, orgPerMinute: 100, orgPerDay: 100 }
    const reset = (email: string) => takeSendAllowance("org-1", "password_reset", { store, limits, recipientEmail: email, alert: vi.fn() })
    expect((await reset("victim@example.org")).ok).toBe(true)
    expect((await reset("Victim@Example.org ")).ok).toBe(true)
    expect(await reset("victim@example.org")).toMatchObject({ ok: false, limit: "recipient_per_hour" })
    for (let i = 0; i < 10; i++) await reset("victim@example.org")
    // The flood used two emails of the organisation's day, no more; another administrator still resets.
    expect((await store.peek("email:org:org-1:day"))?.count).toBe(2)
    expect((await reset("other-admin@example.org")).ok).toBe(true)
    // An admin invitation is not touched by any of it.
    expect((await takeSendAllowance("org-1", "admin_invite", { store, limits, alert: vi.fn() })).ok).toBe(true)
  })
})
