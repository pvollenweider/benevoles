// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * Accepting several requests of one volunteer on one event (#1191's grouping, applied to the
 * organizer's decision) against a real Postgres: nine accepts in a row leave one pending
 * `registration_confirmation` listing them, instead of nine emails whose last ones the per-address
 * cap of public emails drops. What the email lists is read again when it leaves (a place withdrawn
 * meanwhile is not announced), an acceptance and the volunteer's own sign-up join the same email,
 * and DIGEST_DELAY_SECONDS=0 still delivers an isolated acceptance at once.
 *
 * Only SMTP and the after-response delivery are stubbed: the outbox, the sending limits and the
 * decision all run for real.
 */

const smtp = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/channels/email", () => ({ emailChannel: { send: smtp } }))
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications/outbox", async (orig) => ({
  ...(await orig<typeof import("@/lib/notifications/outbox")>()),
  deliverAfterResponse: vi.fn(),
}))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { decideRequest } from "@/lib/registration-decision"
import { deliverOutbox, openPayload } from "@/lib/notifications/outbox"
import * as outbox from "@/lib/notifications/outbox"
import { ADDED_SHIFTS_DELAY_MS, type AddedShiftsData } from "@/lib/notifications/added-shifts-confirmation"
import { POST as publicSignup } from "@/app/api/public/registrations/route"
import { registrationToken } from "@/lib/token-vault"
import { hashToken } from "@/lib/token-hash"
import { generateToken } from "@/lib/utils"
import type { NotificationPayload } from "@/lib/notifications/types"

const url = process.env.DATABASE_URL
const tag = `int-accept-group-${Date.now()}`
const TZ = "Europe/Zurich"
const actor = { type: "admin" as const, id: "admin-1" }

describe.skipIf(!url)("grouped confirmations of accepted requests", () => {
  let orgId = ""
  let n = 0
  // The CI job sets DIGEST_DELAY_SECONDS=0: the grouping tests want the normal delay.
  const delayEnv = process.env.DIGEST_DELAY_SECONDS

  beforeAll(async () => {
    delete process.env.DIGEST_DELAY_SECONDS
    orgId = (await prisma.organization.create({
      data: { name: `Asso ${tag}`, slug: tag, timeZone: TZ, publicationApprovedAt: new Date(), outboundEmailApprovedAt: new Date() },
    })).id
  })

  afterAll(async () => {
    if (delayEnv === undefined) delete process.env.DIGEST_DELAY_SECONDS
    else process.env.DIGEST_DELAY_SECONDS = delayEnv
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.emailLimitHit.deleteMany({ where: { organizationId: orgId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.charterVersion.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  beforeEach(() => { smtp.mockReset().mockResolvedValue({ ok: true }) })

  const db = () => getOrgClient(orgId)

  /** A published event whose shifts all require approval, on the dates and hours given. */
  async function eventWithShifts(specs: { label: string; date: string; start: string; end: string; requiresApproval?: boolean }[], extra: Record<string, unknown> = {}) {
    const event = await prisma.event.create({
      data: {
        organizationId: orgId, slug: `${tag}-${++n}`, title: `Fête ${n}`, publicStatus: "published",
        startDate: new Date("2031-06-01"), endDate: new Date("2031-06-03"), ...extra,
      },
    })
    const shifts = []
    for (const s of specs) {
      shifts.push(await prisma.shift.create({
        data: { eventId: event.id, roleName: "Accueil", label: s.label, date: new Date(s.date), startTime: s.start, endTime: s.end, capacity: 5, requiresApproval: s.requiresApproval ?? true },
      }))
    }
    return { event, shifts }
  }

  const member = async () => prisma.volunteer.create({
    data: { organizationId: orgId, firstName: "Nadia", lastName: "Rochat", email: `${tag}-${++n}@example.org` },
  })

  const request = (eventId: string, shiftId: string, volunteerId: string) => prisma.registration.create({
    data: { eventId, shiftId, volunteerId, status: "requested", source: "public_form", ...registrationToken.data(generateToken()) },
  })

  /** The grouped confirmations of one event, in the order they were queued. */
  const groupedRows = (eventId: string) => prisma.notificationOutbox.findMany({
    where: { organizationId: orgId, dedupeKey: { startsWith: `registration_confirmation:added:${eventId}:` } },
    orderBy: { createdAt: "asc" },
  })

  it("nine accepts in 33 seconds leave one pending email with the nine registrations, never dropped by the per-address cap", async () => {
    // Created out of chronological order: the email must list them in time order.
    const spec = [
      { label: "D1 14:00", date: "2031-06-01", start: "14:00", end: "16:00" },
      { label: "D1 08:00", date: "2031-06-01", start: "08:00", end: "10:00" },
      { label: "D2 08:00", date: "2031-06-02", start: "08:00", end: "10:00" },
      { label: "D1 18:00", date: "2031-06-01", start: "18:00", end: "20:00" },
      { label: "D2 14:00", date: "2031-06-02", start: "14:00", end: "16:00" },
      { label: "D1 10:00", date: "2031-06-01", start: "10:00", end: "12:00" },
      { label: "D3 08:00", date: "2031-06-03", start: "08:00", end: "10:00" },
      { label: "D2 18:00", date: "2031-06-02", start: "18:00", end: "20:00" },
      { label: "D1 12:00", date: "2031-06-01", start: "12:00", end: "14:00" },
    ]
    const { event, shifts } = await eventWithShifts(spec)
    const p = await member()
    const regs = []
    for (const shift of shifts) regs.push(await request(event.id, shift.id, p.id))

    for (const reg of regs) expect(await decideRequest(db(), actor, reg.id, { decision: "accept" })).toEqual({ ok: true, status: "active" })

    const rows = await groupedRows(event.id)
    expect(rows).toHaveLength(1)
    const queued = openPayload(rows[0].payload).data as AddedShiftsData
    expect(queued.addedShifts).toBe(true)
    expect([...queued.registrationIds].sort()).toEqual(regs.map((r) => r.id).sort())
    // Still waiting for the digest delay.
    expect(rows[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + ADDED_SHIFTS_DELAY_MS - 60_000)

    // One email leaves; no row is cancelled by the per-address cap of public emails.
    const now = new Date(rows[0].nextAttemptAt.getTime() + 1000)
    expect(await deliverOutbox({ ids: [rows[0].id], now })).toEqual({ sent: 1, retried: 0, failed: 0, cancelled: 0, held: 0 })
    expect(smtp).toHaveBeenCalledTimes(1)
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId, lastError: { startsWith: "limit:" } } })).toBe(0)
    expect(await prisma.emailLimitHit.count({ where: { organizationId: orgId } })).toBe(0)

    const sent = smtp.mock.calls[0][0] as NotificationPayload
    expect(sent.kind).toBe("registration_confirmation")
    const labels = (sent.data as { shifts: { label: string }[] }).shifts.map((s) => s.label)
    expect(labels).toEqual(["D1 08:00", "D1 10:00", "D1 12:00", "D1 14:00", "D1 18:00", "D2 08:00", "D2 14:00", "D2 18:00", "D3 08:00"])
    // The link is a live registration's: the personal page opens with it.
    const linked = await prisma.registration.findUniqueOrThrow({ where: { editTokenHash: hashToken((sent.data as { editToken: string }).editToken) } })
    expect(linked.status).toBe("active")
    expect(linked.eventId).toBe(event.id)
  })

  it("two accepts of the same person in flight together find the same pending email", async () => {
    const { event, shifts } = await eventWithShifts([
      { label: "Accueil", date: "2031-06-01", start: "10:00", end: "12:00" },
      { label: "Bar", date: "2031-06-01", start: "14:00", end: "16:00" },
    ])
    const p = await member()
    const first = await request(event.id, shifts[0].id, p.id)
    const second = await request(event.id, shifts[1].id, p.id)

    // The member lock (taken before the queue) makes the second decision wait for the first's
    // commit, then join its row instead of starting a second email.
    const [a, b] = await Promise.all([
      decideRequest(db(), actor, first.id, { decision: "accept" }),
      decideRequest(db(), actor, second.id, { decision: "accept" }),
    ])
    expect(a).toEqual({ ok: true, status: "active" })
    expect(b).toEqual({ ok: true, status: "active" })

    const rows = await groupedRows(event.id)
    expect(rows).toHaveLength(1)
    const queued = openPayload(rows[0].payload).data as AddedShiftsData
    expect([...queued.registrationIds].sort()).toEqual([first.id, second.id].sort())
  })

  it("a place withdrawn before the email leaves is not announced", async () => {
    const { event, shifts } = await eventWithShifts([
      { label: "Bar", date: "2031-06-01", start: "10:00", end: "12:00" },
      { label: "Caisse", date: "2031-06-01", start: "14:00", end: "16:00" },
    ])
    const p = await member()
    const bar = await request(event.id, shifts[0].id, p.id)
    await request(event.id, shifts[1].id, p.id)
    for (const reg of await prisma.registration.findMany({ where: { eventId: event.id }, orderBy: { shiftId: "asc" } })) {
      expect(await decideRequest(db(), actor, reg.id, { decision: "accept" })).toEqual({ ok: true, status: "active" })
    }

    await prisma.registration.updateMany({ where: { id: bar.id }, data: { status: "cancelled" } })
    const [row] = await groupedRows(event.id)
    expect(await deliverOutbox({ ids: [row.id], now: new Date(row.nextAttemptAt.getTime() + 1000) })).toMatchObject({ sent: 1 })
    const sent = smtp.mock.calls[0][0] as NotificationPayload
    expect((sent.data as { shifts: { label: string }[] }).shifts.map((s) => s.label)).toEqual(["Caisse"])
  })

  it("sends nothing when every accepted place was withdrawn before the email leaves", async () => {
    const { event, shifts } = await eventWithShifts([{ label: "Montage", date: "2031-06-01", start: "08:00", end: "10:00" }])
    const p = await member()
    const reg = await request(event.id, shifts[0].id, p.id)
    expect(await decideRequest(db(), actor, reg.id, { decision: "accept" })).toEqual({ ok: true, status: "active" })
    await prisma.registration.updateMany({ where: { id: reg.id }, data: { status: "cancelled" } })

    const [row] = await groupedRows(event.id)
    expect(await deliverOutbox({ ids: [row.id], now: new Date(row.nextAttemptAt.getTime() + 1000) })).toMatchObject({ sent: 0, cancelled: 1 })
    expect(smtp).not.toHaveBeenCalled()
  })

  it("joins the volunteer's own sign-up in the window: one email for both", async () => {
    const { event, shifts } = await eventWithShifts([
      { label: "Demande 1", date: "2031-06-01", start: "10:00", end: "12:00" },
      { label: "Demande 2", date: "2031-06-01", start: "14:00", end: "16:00" },
      // Added by the volunteer from the public page: a place, not a request.
      { label: "Ajout", date: "2031-06-02", start: "10:00", end: "12:00", requiresApproval: false },
    ])
    const p = await member()
    const r1 = await request(event.id, shifts[0].id, p.id)
    const r2 = await request(event.id, shifts[1].id, p.id)
    expect(await decideRequest(db(), actor, r1.id, { decision: "accept" })).toEqual({ ok: true, status: "active" })
    expect(await decideRequest(db(), actor, r2.id, { decision: "accept" })).toEqual({ ok: true, status: "active" })

    const res = await publicSignup(new Request("http://localhost/api/public/registrations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-ip-1` },
      body: JSON.stringify({ eventId: event.id, shiftIds: [shifts[2].id], firstName: p.firstName, lastName: p.lastName, email: p.email, consent: true, charterAccepted: true }),
    }))
    expect(res.status).toBe(201)

    const rows = await groupedRows(event.id)
    expect(rows).toHaveLength(1)
    const queued = openPayload(rows[0].payload).data as AddedShiftsData
    const added = await prisma.registration.findFirstOrThrow({ where: { eventId: event.id, shiftId: shifts[2].id } })
    expect([...queued.registrationIds].sort()).toEqual([r1.id, r2.id, added.id].sort())

    expect(await deliverOutbox({ ids: [rows[0].id], now: new Date(rows[0].nextAttemptAt.getTime() + 1000) })).toMatchObject({ sent: 1 })
    expect(smtp).toHaveBeenCalledTimes(1)
    const sent = smtp.mock.calls[0][0] as NotificationPayload
    expect((sent.data as { shifts: { label: string }[] }).shifts.map((s) => s.label)).toEqual(["Demande 1", "Demande 2", "Ajout"])
  })

  it("with no digest delay, an isolated acceptance is due at once and delivered after the response", async () => {
    const { event, shifts } = await eventWithShifts([{ label: "Chauffeur", date: "2031-06-01", start: "08:00", end: "12:00" }])
    const p = await member()
    const reg = await request(event.id, shifts[0].id, p.id)
    process.env.DIGEST_DELAY_SECONDS = "0"
    try {
      expect(await decideRequest(db(), actor, reg.id, { decision: "accept" })).toEqual({ ok: true, status: "active" })
    } finally {
      delete process.env.DIGEST_DELAY_SECONDS
    }

    const [row] = await groupedRows(event.id)
    expect(row.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(vi.mocked(outbox.deliverAfterResponse).mock.calls.at(-1)?.[0]).toContain(row.id)

    // An isolated acceptance is the usual confirmation: one shift, the personal link.
    expect(await deliverOutbox({ ids: [row.id], now: new Date() })).toMatchObject({ sent: 1 })
    expect(smtp).toHaveBeenCalledTimes(1)
    const sent = smtp.mock.calls[0][0] as NotificationPayload
    expect((sent.data as { shifts: { label: string }[] }).shifts.map((s) => s.label)).toEqual(["Chauffeur"])
    expect((sent.data as { editToken?: string }).editToken).toEqual(expect.any(String))
  })
})
