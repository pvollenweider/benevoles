import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * #1190 on Postgres: a volunteer's withdrawals of one event in a row make one confirmation email
 * listing them all, sent once none was added for the delay; another event has its own email; a
 * repeated withdrawal adds its line once. Only the send itself is mocked.
 */

const send = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: send }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { deliverOutbox, openPayload } from "@/lib/notifications/outbox"
import { render } from "@/lib/notifications/templates"
import { WITHDRAWAL_DIGEST_DELAY_MS } from "@/lib/withdrawal-notifications"
import { queueWithdrawalConfirmation, withdrawalConfirmationGroupKey, type WithdrawalConfirmationInput } from "@/lib/withdrawal-confirmation"
import type { NotificationPayload } from "@/lib/notifications/types"

const url = process.env.DATABASE_URL
const tag = `int-wdc-${Date.now()}`

describe.skipIf(!url)("volunteer withdrawal confirmation digest (#1190)", () => {
  // The member exists: the check right before delivery reads their address (outbox-recipient-check.ts).
  let orgId = ""
  let volunteerId = ""
  let prefixes: string[] = []
  const rows = () => prisma.notificationOutbox.findMany({ where: { OR: prefixes.map((p) => ({ dedupeKey: { startsWith: `${p}:` } })) }, orderBy: { createdAt: "asc" } })

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: "Org wdc", slug: `${tag}-org`, timeZone: "Europe/Zurich" } })).id
    volunteerId = (await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Chloé", lastName: "Roy", email: `${tag}@example.org` } })).id
    prefixes = [withdrawalConfirmationGroupKey(`${tag}-e1`, volunteerId), withdrawalConfirmationGroupKey(`${tag}-e2`, volunteerId)]
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  const withdrawal = (i: number, eventId = `${tag}-e1`): WithdrawalConfirmationInput => ({
    registrationId: `${tag}-r${i}`,
    previousStatus: i === 3 ? "waiting" : "active",
    event: { id: eventId, title: "Fête", organizationId: orgId },
    shift: { roleName: "Bar", label: `Bar ${i}`, date: new Date("2030-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
    volunteer: { id: volunteerId, firstName: "Chloé", lastName: "Roy", email: `${tag}@example.org` },
    timeZone: "Europe/Zurich",
  })

  it("six withdrawals in 18 seconds: one row, six lines, one email after the delay", async () => {
    send.mockReset().mockResolvedValue({ ok: true })
    const t0 = new Date()
    for (let i = 0; i < 6; i++) {
      expect(await queueWithdrawalConfirmation(withdrawal(i), new Date(t0.getTime() + i * 3600))).toEqual([])
    }
    // A double click on the last one: its line is not added twice.
    await queueWithdrawalConfirmation(withdrawal(5), new Date(t0.getTime() + 18_500))
    // Another event: its own email.
    await queueWithdrawalConfirmation(withdrawal(9, `${tag}-e2`), new Date(t0.getTime() + 18_000))

    const all = await rows()
    expect(all).toHaveLength(2)
    const first = all.find((r) => r.dedupeKey?.startsWith(prefixes[0]))!
    const payload = openPayload(first.payload)
    expect(payload).toMatchObject({ kind: "registration_withdrawn", volunteerId, recipient: { email: `${tag}@example.org` } })
    expect((payload.data as { items: unknown[] }).items).toHaveLength(6)
    const last = new Date(t0.getTime() + 5 * 3600)
    expect(first.nextAttemptAt.getTime()).toBe(last.getTime() + WITHDRAWAL_DIGEST_DELAY_MS)

    // Not due yet: nothing leaves.
    expect(await deliverOutbox({ ids: [first.id], now: new Date(last.getTime() + 60_000) })).toMatchObject({ sent: 0 })
    expect(await deliverOutbox({ ids: [first.id], now: new Date(last.getTime() + WITHDRAWAL_DIGEST_DELAY_MS + 1000) })).toMatchObject({ sent: 1 })
    expect(send).toHaveBeenCalledTimes(1)
    const email = render(send.mock.calls[0][0] as NotificationPayload)
    expect(email.subject).toBe("6 retraits effectués depuis ton lien personnel : Fête")
    expect(email.text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(6)
  })

  it("a withdrawal after the email left starts a new one", async () => {
    const before = (await rows()).length
    await queueWithdrawalConfirmation(withdrawal(7), new Date())
    expect(await rows()).toHaveLength(before + 1)
  })
})
