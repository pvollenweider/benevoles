import { describe, it, expect, vi, beforeEach } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * #810 acceptance criterion: « Every email goes through the central limits (test that a new sending
 * path cannot bypass them) ». Two halves:
 * - structure: only the email channel talks to SMTP (imports nodemailer), and only
 *   `sendNotification` reaches the email channel; a new file doing either fails here;
 * - behaviour: `sendNotification` asks the organisation guard and the sending limits before the
 *   channel, and never reaches the channel when either refuses.
 */

const ROOT = join(__dirname, "..", "..", "..")
const SRC = join(ROOT, "src")

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "__integration__" || name === "generated" ? [] : sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const files = sources(SRC).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }))

describe("one path to SMTP (#810)", () => {
  it("only the email channel imports nodemailer", () => {
    const importers = files.filter((f) => /from\s+["']nodemailer["']|require\(["']nodemailer["']\)/.test(f.text)).map((f) => f.path)
    expect(importers).toEqual(["src/lib/notifications/channels/email.ts"])
  })

  it("only sendNotification reaches the email channel", () => {
    const importers = files.filter((f) => /from\s+["'](\.\/channels\/email|@\/lib\/notifications\/channels\/email|\.\.\/channels\/email)["']/.test(f.text)).map((f) => f.path)
    expect(importers).toEqual(["src/lib/notifications/index.ts"])
  })
})

const m = vi.hoisted(() => ({ send: vi.fn(), verdict: vi.fn(), allowance: vi.fn() }))
vi.mock("@/lib/notifications/channels/email", () => ({ emailChannel: { send: m.send } }))
vi.mock("@/lib/notifications/org-send-guard", () => ({ organizationSendingVerdict: m.verdict }))
vi.mock("@/lib/notifications/send-limits", () => ({ takeSendAllowance: m.allowance }))

const payload = { kind: "targeted_message", organizationId: "org-a", recipient: { email: "a@example.org" }, data: {} } as never

describe("sendNotification checks before sending (#810)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.verdict.mockResolvedValue(null)
    m.allowance.mockResolvedValue({ ok: true })
    m.send.mockResolvedValue({ ok: true })
  })

  it("asks the organisation guard and the limits, in that order, before the channel", async () => {
    const order: string[] = []
    m.verdict.mockImplementation(async () => { order.push("guard"); return null })
    m.allowance.mockImplementation(async () => { order.push("limits"); return { ok: true } })
    m.send.mockImplementation(async () => { order.push("smtp"); return { ok: true } })
    const { sendNotification } = await import("@/lib/notifications")
    expect(await sendNotification(payload)).toEqual({ ok: true })
    expect(order).toEqual(["guard", "limits", "smtp"])
  })

  it("never reaches the channel when the guard or a limit refuses", async () => {
    const { sendNotification } = await import("@/lib/notifications")
    m.verdict.mockResolvedValueOnce("Organisation désactivée.")
    expect(await sendNotification(payload)).toMatchObject({ ok: false, blocked: true })
    m.allowance.mockResolvedValueOnce({ ok: false, limit: "org_per_minute", retryAfterMs: 1000 })
    expect(await sendNotification(payload)).toMatchObject({ ok: false, held: true })
    m.allowance.mockResolvedValueOnce({ ok: false, limit: "recipient_per_hour", drop: true })
    expect(await sendNotification(payload)).toMatchObject({ ok: false, blocked: true })
    expect(m.send).not.toHaveBeenCalled()
  })
})
