import { describe, it, expect, vi } from "vitest"
import { memoryStore } from "@/lib/rate-limit"
import { DEFAULT_SEND_LIMITS, sendCategory, sendLimits, sendWindows, takeSendAllowance, type SendLimits } from "../send-limits"

const tight: SendLimits = { orgPerMinute: 3, orgPerDay: 5, orgBulkPerDay: 2, orgAccountPerDay: 1, globalPerMinute: 10 }

describe("email sending limits (#810)", () => {
  it("sorts kinds into bulk, account and automatic", () => {
    expect(sendCategory("targeted_message")).toBe("bulk")
    expect(sendCategory("member_invite")).toBe("bulk")
    expect(sendCategory("open_shifts")).toBe("bulk")
    expect(sendCategory("password_reset")).toBe("account")
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
    expect(sendWindows("org-1", "password_reset", tight).map((w) => w.name)).toContain("org_account_per_day")
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
})
