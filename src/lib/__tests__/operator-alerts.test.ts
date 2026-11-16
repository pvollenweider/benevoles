import { describe, it, expect, vi, beforeEach } from "vitest"

const db = vi.hoisted(() => ({ adminUser: { findMany: vi.fn() }, notificationOutbox: { findFirst: vi.fn() } }))
const outbox = vi.hoisted(() => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
const reported = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/notifications/outbox", () => outbox)
vi.mock("@/lib/report-error", () => ({ reportError: (tag: string) => (e: unknown) => reported(tag, e) }))

import { notifyOperator, NTFY_RETRY_DELAYS_MS, operatorAlertRecipients, ntfyConfig, ntfyRequest, sendNtfy, type OperatorAlert } from "../operator-alerts"

const alert: OperatorAlert = { key: "k1", title: "benevol.app : plafond", message: "Emails retenus.", priority: 4, url: "https://www.benevol.app/super-admin/organizations" }
const TOPIC = "https://ntfy.sh/benevol-ops-test"
const access = { ["NTFY_" + "TOKEN"]: "test-value" }
const noWait = async () => {}

describe("operator alerts (#810)", () => {
  beforeEach(() => {
    reported.mockReset()
    db.adminUser.findMany.mockReset().mockResolvedValue([{ email: "ops@example.org" }, { email: "ops2@example.org" }])
    db.notificationOutbox.findFirst.mockReset().mockResolvedValue(null)
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

  it("publishes title, priority, tag and link in the JSON body, not in headers", () => {
    const { url, init } = ntfyRequest(alert, { url: TOPIC, token: "test-value" })
    expect(url).toBe("https://ntfy.sh/")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer test-value" })
    expect(JSON.parse(String(init.body))).toEqual({
      topic: "benevol-ops-test", title: alert.title, message: "Emails retenus.", priority: 4, tags: ["warning"], click: alert.url,
    })
    const plain = ntfyRequest({ key: "k", title: "t", message: "m" }, { url: TOPIC, token: null })
    expect(plain.init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(String(plain.init.body))).toEqual({ topic: "benevol-ops-test", title: "t", message: "m", priority: 3, tags: ["bell"] })
  })

  it("keeps accents in the title by sending it in the JSON body", () => {
    const title = "Sauvegarde chiffrée à vérifier"
    const body = JSON.parse(String(ntfyRequest({ ...alert, title }, { url: TOPIC, token: null }).init.body))
    expect(body.title).toBe(title)
  })

  it("sends neither the push nor the email when an outbox row exists for the alert key", async () => {
    db.notificationOutbox.findFirst.mockResolvedValue({ id: "o1" })
    const ok = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    await notifyOperator(alert, { fetch: ok as unknown as typeof fetch, env: { NTFY_URL: TOPIC } })
    expect(db.notificationOutbox.findFirst).toHaveBeenCalledWith({
      where: { dedupeKey: { startsWith: "operator_alert:k1:" } }, select: { id: true },
    })
    expect(ok).not.toHaveBeenCalled()
    expect(outbox.enqueueNotifications).not.toHaveBeenCalled()
  })

  it("still sends when the deduplication lookup fails, and reports it", async () => {
    db.notificationOutbox.findFirst.mockRejectedValue(new Error("db down"))
    const ok = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    await notifyOperator(alert, { fetch: ok as unknown as typeof fetch, env: { NTFY_URL: TOPIC } })
    expect(ok).toHaveBeenCalledTimes(1)
    expect(outbox.enqueueNotifications).toHaveBeenCalledTimes(1)
    expect(reported).toHaveBeenCalledWith("operator_alert.dedupe", expect.any(Error))
  })

  it("never throws: a push that keeps failing is tried a few times, then reported once", async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    expect(await sendNtfy(alert, { fetch: failing as unknown as typeof fetch, env: { NTFY_URL: TOPIC }, sleep: noWait })).toBe(false)
    expect(failing).toHaveBeenCalledTimes(NTFY_RETRY_DELAYS_MS.length + 1)
    expect(reported).toHaveBeenCalledTimes(1)
    const throwing = vi.fn().mockRejectedValue(new Error("offline"))
    expect(await sendNtfy(alert, { fetch: throwing as unknown as typeof fetch, env: { NTFY_URL: TOPIC }, sleep: noWait })).toBe(false)
    // Without NTFY_URL nothing is sent and nothing is reported.
    reported.mockReset()
    const unused = vi.fn()
    expect(await sendNtfy(alert, { fetch: unused as unknown as typeof fetch, env: {} })).toBe(false)
    expect(unused).not.toHaveBeenCalled()
    expect(reported).not.toHaveBeenCalled()
  })

  // Production, 9 October 2026: ntfy.sh did not answer the connection once, and the sign-up alert was lost.
  it("tries again after a connection timeout or a server error, waiting longer each time", async () => {
    const waits: number[] = []
    const sleep = async (ms: number) => { waits.push(ms) }
    const flaky = vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    expect(await sendNtfy(alert, { fetch: flaky as unknown as typeof fetch, env: { NTFY_URL: TOPIC }, sleep })).toBe(true)
    expect(flaky).toHaveBeenCalledTimes(3)
    expect(waits).toEqual(NTFY_RETRY_DELAYS_MS)
    expect(reported).not.toHaveBeenCalled()
  })

  it("does not try again when ntfy refuses the request itself (wrong topic, access)", async () => {
    const refused = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    expect(await sendNtfy(alert, { fetch: refused as unknown as typeof fetch, env: { NTFY_URL: TOPIC }, sleep: noWait })).toBe(false)
    expect(refused).toHaveBeenCalledTimes(1)
    expect(reported).toHaveBeenCalledWith("operator_alert.ntfy", expect.objectContaining({ message: "ntfy answered 403" }))
  })

  it("queues the email without waiting for the push's attempts", async () => {
    let release = () => {}
    const sleep = () => new Promise<void>((resolve) => { release = resolve })
    const throwing = vi.fn().mockRejectedValue(new Error("offline"))
    const done = notifyOperator(alert, { fetch: throwing as unknown as typeof fetch, env: { NTFY_URL: TOPIC }, sleep })
    await vi.waitFor(() => expect(outbox.enqueueNotifications).toHaveBeenCalledTimes(1))
    expect(throwing).toHaveBeenCalledTimes(1)
    release(); await vi.waitFor(() => expect(throwing).toHaveBeenCalledTimes(2))
    release(); await done
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

  // A super admin's login address may not be a real mailbox (the operator's is not): the alerts
  // then go to the dedicated address, and only there.
  it("emails only OPERATOR_ALERT_EMAIL when it is set", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    await notifyOperator(alert, { fetch: ok as unknown as typeof fetch, env: { NTFY_URL: TOPIC, OPERATOR_ALERT_EMAIL: " Alertes@Example.org " } })
    expect(db.adminUser.findMany).not.toHaveBeenCalled()
    const payloads = outbox.enqueueNotifications.mock.calls[0][0]
    expect(payloads).toEqual([expect.objectContaining({ recipient: { email: "alertes@example.org" }, dedupeKey: "operator_alert:k1:alertes@example.org" })])
    expect(await operatorAlertRecipients({ OPERATOR_ALERT_EMAIL: "  " })).toEqual(["ops@example.org", "ops2@example.org"])
  })

  // Production, 9 October 2026: an address without a full domain stopped the app at startup.
  it("ignores and reports an invalid OPERATOR_ALERT_EMAIL: the super admins get the alert", async () => {
    expect(await operatorAlertRecipients({ OPERATOR_ALERT_EMAIL: "philippe@adresse" })).toEqual(["ops@example.org", "ops2@example.org"])
    expect(reported).toHaveBeenCalledWith("operator_alert.invalid_address", expect.any(Error))
  })

  it("still emails when the push fails, and reports an email failure without throwing", async () => {
    const throwing = vi.fn().mockRejectedValue(new Error("offline"))
    await notifyOperator(alert, { fetch: throwing as unknown as typeof fetch, env: { NTFY_URL: TOPIC }, sleep: noWait })
    expect(outbox.enqueueNotifications).toHaveBeenCalledTimes(1)
    outbox.enqueueNotifications.mockRejectedValueOnce(new Error("db down"))
    await expect(notifyOperator(alert, { env: {} })).resolves.toBeUndefined()
    expect(reported).toHaveBeenCalledWith("operator_alert.email", expect.any(Error))
  })
})
