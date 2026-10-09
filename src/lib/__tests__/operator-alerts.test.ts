import { describe, it, expect, vi, beforeEach } from "vitest"

const db = vi.hoisted(() => ({ adminUser: { findMany: vi.fn() } }))
const outbox = vi.hoisted(() => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
const reported = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/notifications/outbox", () => outbox)
vi.mock("@/lib/report-error", () => ({ reportError: (tag: string) => (e: unknown) => reported(tag, e) }))

import { notifyOperator, ntfyConfig, ntfyRequest, sendNtfy, type OperatorAlert } from "../operator-alerts"

const alert: OperatorAlert = { key: "k1", title: "benevol.app : plafond", message: "Emails retenus.", priority: 4, url: "https://www.benevol.app/super-admin/organizations" }
const TOPIC = "https://ntfy.sh/benevol-ops-test"
const access = { ["NTFY_" + "TOKEN"]: "test-value" }

describe("operator alerts (#810)", () => {
  beforeEach(() => {
    reported.mockReset()
    db.adminUser.findMany.mockReset().mockResolvedValue([{ email: "ops@example.org" }, { email: "ops2@example.org" }])
    outbox.enqueueNotifications.mockReset().mockResolvedValue(["o1", "o2"])
    outbox.deliverAfterResponse.mockReset()
  })

  it("accepts only an https topic URL, with an optional access value", () => {
    expect(ntfyConfig({})).toBeNull()
    expect(ntfyConfig({ NTFY_URL: "http://ntfy.sh/x" })).toBeNull()
    expect(ntfyConfig({ NTFY_URL: "not a url" })).toBeNull()
    expect(ntfyConfig({ NTFY_URL: TOPIC })).toEqual({ url: TOPIC, token: null })
    expect(ntfyConfig({ NTFY_URL: TOPIC, ...access })?.token).toBe("test-value")
  })

  it("puts title, priority, tag and link in headers, the sentence in the body", () => {
    const { url, init } = ntfyRequest(alert, { url: TOPIC, token: "test-value" })
    expect(url).toBe(TOPIC)
    expect(init.method).toBe("POST")
    expect(init.body).toBe("Emails retenus.")
    expect(init.headers).toEqual({ Title: alert.title, Priority: "4", Tags: "warning", Click: alert.url, Authorization: "Bearer test-value" })
    expect(ntfyRequest({ key: "k", title: "t", message: "m" }, { url: TOPIC, token: null }).init.headers).toEqual({ Title: "t", Priority: "3", Tags: "bell" })
  })

  it("never throws: a failed push is reported once", async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    expect(await sendNtfy(alert, { fetch: failing as unknown as typeof fetch, env: { NTFY_URL: TOPIC } })).toBe(false)
    expect(reported).toHaveBeenCalledTimes(1)
    const throwing = vi.fn().mockRejectedValue(new Error("offline"))
    expect(await sendNtfy(alert, { fetch: throwing as unknown as typeof fetch, env: { NTFY_URL: TOPIC } })).toBe(false)
    // Without NTFY_URL nothing is sent and nothing is reported.
    reported.mockReset()
    const unused = vi.fn()
    expect(await sendNtfy(alert, { fetch: unused as unknown as typeof fetch, env: {} })).toBe(false)
    expect(unused).not.toHaveBeenCalled()
    expect(reported).not.toHaveBeenCalled()
  })

  it("pushes and emails every active super admin, one email per alert key", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    await notifyOperator(alert, { fetch: ok as unknown as typeof fetch, env: { NTFY_URL: TOPIC } })
    expect(ok).toHaveBeenCalledTimes(1)
    expect(db.adminUser.findMany).toHaveBeenCalledWith({ where: { role: "super_admin", isActive: true }, select: { email: true } })
    const payloads = outbox.enqueueNotifications.mock.calls[0][0]
    expect(payloads).toHaveLength(2)
    expect(payloads[0]).toEqual({
      kind: "operator_alert",
      recipient: { email: "ops@example.org" },
      dedupeKey: "operator_alert:k1:ops@example.org",
      data: { title: alert.title, message: alert.message, url: alert.url },
    })
    // A platform email: no organisation, so no organisation check can hold it back.
    expect(payloads[0].organizationId).toBeUndefined()
  })

  it("still emails when the push fails, and reports an email failure without throwing", async () => {
    const throwing = vi.fn().mockRejectedValue(new Error("offline"))
    await notifyOperator(alert, { fetch: throwing as unknown as typeof fetch, env: { NTFY_URL: TOPIC } })
    expect(outbox.enqueueNotifications).toHaveBeenCalledTimes(1)
    outbox.enqueueNotifications.mockRejectedValueOnce(new Error("db down"))
    await expect(notifyOperator(alert, { env: {} })).resolves.toBeUndefined()
    expect(reported).toHaveBeenCalledWith("operator_alert.email", expect.any(Error))
  })
})
