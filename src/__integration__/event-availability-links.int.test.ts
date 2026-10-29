// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * The link « Indiquer mes disponibilités » and the option around it (#1146, lot A) against a real
 * Postgres, through the routes: the beta gate and the zone snapshot, the requests queued in the
 * outbox with their own secret (never an email sent here: the outbox only), the resend guard and
 * the reminder, the person's page and its deadline, the organisers' correction after it, turning
 * collection off (links revoked, emails cancelled, answers kept), and an address correction that
 * renews the link.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notifications/outbox", async (orig) => ({ ...(await orig<typeof import("@/lib/notifications/outbox")>()), deliverAfterResponse: vi.fn() }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { BETA_SETTING_KEY } from "@/lib/beta-capabilities"
import { openPayload } from "@/lib/notifications/outbox"
import { outboxRecipientVerdict } from "@/lib/outbox-recipient-check"
import { AVAILABILITY_LINK_REVOKED_REASON } from "@/lib/outbox-address-changed-reason"
import { renewMemberLinks } from "@/lib/member-address-revocation"
import type { Tx } from "@/lib/registration-capacity"

const url = process.env.DATABASE_URL
const tag = `int-avlink-${Date.now()}`

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` }, body: body === undefined ? undefined : JSON.stringify(body) })

describe.skipIf(!url)("availability links (#1146)", () => {
  let orgId = ""
  let eventId = ""
  let alice = ""
  let bruno = ""
  let noEmail = ""
  let betaBefore: object | null = null

  beforeAll(async () => {
    betaBefore = ((await prisma.platformSetting.findUnique({ where: { key: BETA_SETTING_KEY } }))?.value as object | undefined) ?? null
    await prisma.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value: { open: ["availability"] } }, update: { value: { open: ["availability"] } } })
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-test", email: "adm@example.org" } } }
    eventId = (await prisma.event.create({ data: { organizationId: orgId, slug: "festival", title: "Festival", startDate: new Date("2099-07-10"), endDate: new Date("2099-07-12") } })).id
    const member = (firstName: string, email: string | null) => prisma.volunteer.create({ data: { organizationId: orgId, firstName, lastName: "Rochat", email } })
    alice = (await member("Alice", `${tag}-alice@example.org`)).id
    bruno = (await member("Bruno", `${tag}-bruno@example.org`)).id
    noEmail = (await member("Chloé", null)).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    if (betaBefore === null) await prisma.platformSetting.deleteMany({ where: { key: BETA_SETTING_KEY } })
    else await prisma.platformSetting.update({ where: { key: BETA_SETTING_KEY }, data: { value: betaBefore } })
    await prisma.$disconnect()
  })

  const mode = async (body: unknown) => {
    const { PUT } = await import("@/app/api/admin/events/[id]/availability/mode/route")
    return PUT(request(`/api/admin/events/${eventId}/availability/mode`, "PUT", body), { params: Promise.resolve({ id: eventId }) })
  }
  const send = async (volunteerIds: string[]) => {
    const { POST } = await import("@/app/api/admin/events/[id]/availability/route")
    return POST(request(`/api/admin/events/${eventId}/availability`, "POST", { volunteerIds }), { params: Promise.resolve({ id: eventId }) })
  }
  const remind = async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/availability/remind/route")
    return POST(request(`/api/admin/events/${eventId}/availability/remind`, "POST"), { params: Promise.resolve({ id: eventId }) })
  }
  const linkGet = async (token: string) => {
    const { GET } = await import("@/app/api/public/availability/[token]/route")
    return GET(request(`/api/public/availability/${token}`, "GET"), { params: Promise.resolve({ token }) })
  }
  const linkPut = async (token: string, body: unknown) => {
    const { PUT } = await import("@/app/api/public/availability/[token]/route")
    return PUT(request(`/api/public/availability/${token}`, "PUT", body), { params: Promise.resolve({ token }) })
  }
  const queued = async (volunteerId: string) => {
    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" }, select: { status: true, payload: true, lastError: true, dedupeKey: true } })
    return rows.map((r) => ({ ...r, payload: openPayload(r.payload) })).filter((r) => r.payload.volunteerId === volunteerId)
  }
  const tokenOf = async (volunteerId: string) => {
    const mails = (await queued(volunteerId)).filter((m) => m.status !== "cancelled")
    return mails[mails.length - 1]?.payload.data.token as string
  }

  it("is refused to an organisation that did not join the beta, then adopted with the zone snapshotted", async () => {
    expect((await mode({ enabled: true })).status).toBe(403)
    await prisma.organization.update({ where: { id: orgId }, data: { betaOptInAt: new Date() } })
    const res = await mode({ enabled: true, deadline: "2099-07-01T23:59" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ enabled: true, adopted: true, deadlineInput: "2099-07-01T23:59", open: true })
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
    expect(event.availabilityTimeZone).toBe("Europe/Zurich")
    expect(event.availabilityDeadline).toEqual(new Date("2099-07-01T21:59:00Z"))
  })

  it("queues one request per member with an address, each with its own link, and never twice in a row", async () => {
    const res = await send([alice, bruno, noEmail])
    expect(await res.json()).toEqual({ asked: 3, emailsQueued: 2, recentlySkipped: 0, withoutEmail: 1 })
    const mails = await queued(alice)
    expect(mails).toHaveLength(1)
    expect(mails[0].payload.kind).toBe("availability_request")
    expect(mails[0].payload.data.token).not.toBe(await tokenOf(bruno))
    const requests = await prisma.availabilityRequest.findMany({ where: { eventId }, select: { volunteerId: true, tokenHash: true, tokenLegacy: true, sentAt: true } })
    expect(requests.find((r) => r.volunteerId === noEmail)?.tokenHash).toBeNull()
    expect(requests.find((r) => r.volunteerId === alice)?.sentAt).not.toBeNull()
    // A double click: nobody gets a second copy.
    expect(await (await send([alice, bruno])).json()).toMatchObject({ emailsQueued: 0, recentlySkipped: 2 })
  })

  it("serves the person's own page and saves their answer from the link only", async () => {
    const token = await tokenOf(alice)
    const view = await (await linkGet(token)).json()
    expect(view).toMatchObject({ dates: ["2099-07-10", "2099-07-11", "2099-07-12"], state: "none", open: true, event: { title: "Festival" } })
    expect(JSON.stringify(view)).not.toContain("Bruno")
    const saved = await linkPut(token, { days: [{ date: "2099-07-10", ranges: [{ start: "20:00", end: "03:00" }] }, { date: "2099-07-11", ranges: [] }] })
    expect(saved.status).toBe(200)
    expect((await saved.json()).state).toBe("partial")
    expect(saved.headers.get("Cache-Control")).toBe("private, no-store")
    expect((await linkGet("not-a-real-link-0000")).status).toBe(404)
  })

  it("reminds only those who have not answered, and not within 48 hours of the last email", async () => {
    // Bruno's request went just now: the reminder waits.
    expect(await (await remind()).json()).toMatchObject({ emailsQueued: 0, recentlySkipped: 1 })
    await prisma.availabilityRequest.updateMany({ where: { eventId }, data: { sentAt: new Date(Date.now() - 3 * 86_400_000), lastRemindedAt: null } })
    // The first emails left (the outbox is not delivered in this test): a copy still waiting would hold the reminder back.
    await prisma.notificationOutbox.updateMany({ where: { organizationId: orgId }, data: { status: "sent" } })
    const res = await (await remind()).json()
    // Alice answered; Chloé has no address and was never emailed.
    expect(res).toMatchObject({ emailsQueued: 1 })
    expect((await queued(bruno)).filter((m) => m.status === "pending").pop()?.payload.data.reminder).toBe(true)
  })

  it("is read-only for the person after the deadline, while the organisers can still correct", async () => {
    const token = await tokenOf(alice)
    await prisma.event.update({ where: { id: eventId }, data: { availabilityDeadline: new Date(Date.now() - 60_000) } })
    expect((await (await linkGet(token)).json()).open).toBe(false)
    expect((await linkPut(token, { days: [{ date: "2099-07-12", ranges: [] }] })).status).toBe(409)
    const { PUT } = await import("@/app/api/admin/events/[id]/availability/[volunteerId]/route")
    const corrected = await PUT(request(`/api/admin/events/${eventId}/availability/${alice}`, "PUT", { days: [{ date: "2099-07-12", ranges: [{ start: "08:00", end: "12:00" }] }] }), { params: Promise.resolve({ id: eventId, volunteerId: alice }) })
    expect(corrected.status).toBe(200)
    expect(await corrected.json()).toMatchObject({ state: "complete", answeredBy: "admin" })
    // Reopened with a later deadline.
    expect((await mode({ deadline: "2099-07-05T12:00" })).status).toBe(200)
    expect((await (await linkGet(token)).json()).open).toBe(true)
  })

  it("renews the link on an address correction and sends the new one to the new address", async () => {
    const old = await tokenOf(bruno)
    await prisma.$transaction(async (tx) => {
      await tx.volunteer.update({ where: { id: bruno }, data: { email: `${tag}-bruno2@example.org` } })
      await renewMemberLinks(tx as unknown as Tx, { organizationId: orgId, volunteer: { id: bruno, firstName: "Bruno", lastName: "Rochat", active: true }, oldEmail: `${tag}-bruno@example.org`, newEmail: `${tag}-bruno2@example.org`, now: new Date() })
    })
    expect((await linkGet(old)).status).toBe(404)
    const mails = await queued(bruno)
    const fresh = mails.filter((m) => m.status === "pending")
    expect(fresh).toHaveLength(1)
    expect(fresh[0].payload.recipient.email).toBe(`${tag}-bruno2@example.org`)
    expect((await linkGet(fresh[0].payload.data.token)).status).toBe(200)
  })

  it("asks to confirm turning off, then revokes every link, cancels queued emails and keeps the answers", async () => {
    const token = await tokenOf(bruno)
    const pending = (await queued(bruno)).find((m) => m.status === "pending")!
    const first = await mode({ enabled: false })
    expect(first.status).toBe(409)
    expect((await first.json()).liveLinks).toBe(2)
    expect((await mode({ enabled: false, confirm: true })).status).toBe(200)
    expect((await linkGet(token)).status).toBe(404)
    expect(await prisma.availabilityRequest.count({ where: { eventId, tokenHash: { not: null } } })).toBe(0)
    expect((await queued(bruno)).find((m) => m.dedupeKey === pending.dedupeKey)).toMatchObject({ status: "cancelled", lastError: AVAILABILITY_LINK_REVOKED_REASON })
    expect(await outboxRecipientVerdict(pending.payload)).toBe(AVAILABILITY_LINK_REVOKED_REASON)
    // Alice's answer is still there.
    expect(await prisma.availabilityDay.count({ where: { eventId, request: { volunteerId: alice } } })).toBe(3)
    // Turned on again: it was adopted, so no gate; new links only when asked again.
    await prisma.organization.update({ where: { id: orgId }, data: { betaOptInAt: null } })
    expect((await mode({ enabled: true })).status).toBe(200)
    expect(await (await send([alice])).json()).toMatchObject({ emailsQueued: 1 })
    expect((await linkGet(await tokenOf(alice))).status).toBe(200)
  })

  it("never lets one organisation read or ask on another's event", async () => {
    const other = await prisma.organization.create({ data: { name: "Autre", slug: `${tag}-other` } })
    guard.value = { db: getOrgClient(other.id), organizationId: other.id, session: { user: { id: "adm-2" } } }
    try {
      const { GET } = await import("@/app/api/admin/events/[id]/availability/route")
      expect((await GET(request("/x", "GET"), { params: Promise.resolve({ id: eventId }) })).status).toBe(404)
      expect((await send([alice])).status).toBe(404)
      expect((await mode({ enabled: false, confirm: true })).status).toBe(404)
      const person = await import("@/app/api/admin/events/[id]/availability/[volunteerId]/route")
      expect((await person.GET(request("/x", "GET"), { params: Promise.resolve({ id: eventId, volunteerId: alice }) })).status).toBe(404)
      expect((await person.PUT(request("/x", "PUT", { days: [{ date: "2099-07-10", ranges: [] }] }), { params: Promise.resolve({ id: eventId, volunteerId: alice }) })).status).toBe(404)
    } finally {
      guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-test" } } }
      await prisma.organization.delete({ where: { id: other.id } })
    }
  })
})
