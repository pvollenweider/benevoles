// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * The review screen of draft assignments and the correction after a publication (#1146, lot C)
 * against a real Postgres, through the routes: drafts added from a cell's choice of shifts, reviewed
 * with the acknowledgement, published; then the person corrects their availability after the
 * deadline from their link (allowed only with a published mission, until the event's last shift),
 * the answer is flagged « à revoir » and the organisers' digest is queued for the owners and
 * organisers only, with the mission now outside the answer; « Marquer comme vu » clears the flag at
 * the revision seen. Only the email send is mocked: the outbox rows are inspected.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notifications/outbox", async (orig) => ({ ...(await orig<typeof import("@/lib/notifications/outbox")>()), deliverAfterResponse: vi.fn() }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { openPayload } from "@/lib/notifications/outbox"
import { linkToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { loadDraftBoard } from "@/lib/draft-board-data"
import { loadShiftAssist } from "@/lib/availability-assist-data"

const url = process.env.DATABASE_URL
const tag = `int-board-${Date.now()}`
const TZ = "Europe/Zurich"

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` }, body: body === undefined ? undefined : JSON.stringify(body) })

describe.skipIf(!url)("draft board, publication and correction after it (#1146, lot C)", () => {
  let orgId = ""
  let otherOrgId = ""
  let eventId = ""
  let bar = "", night = ""
  let nadia = "", luca = ""
  const tokens: Record<string, string> = {}

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag, timeZone: TZ } })).id
    otherOrgId = (await prisma.organization.create({ data: { name: `Autre ${tag}`, slug: `${tag}-b`, timeZone: TZ } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-owner", email: `${tag}-owner@example.org` } } }
    // The deadline is long past; the event is far ahead.
    eventId = (await prisma.event.create({ data: { organizationId: orgId, slug: "festival", title: "Festival des Rives", startDate: new Date("2099-07-10"), endDate: new Date("2099-07-12"), availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: TZ, availabilityDeadline: new Date("2020-01-01T00:00:00Z") } })).id
    bar = (await prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2099-07-11T00:00:00Z"), startTime: "10:00", endTime: "14:00", capacity: 3 } })).id
    night = (await prisma.shift.create({ data: { eventId, roleName: "Nuit", label: "Nuit", date: new Date("2099-07-11T00:00:00Z"), startTime: "22:00", endTime: "02:00", capacity: 3 } })).id
    const member = (firstName: string, lastName: string) => prisma.volunteer.create({ data: { organizationId: orgId, firstName, lastName, email: `${tag}-${firstName.toLowerCase()}@example.org` } })
    nadia = (await member("Nadia", "Rochat")).id
    luca = (await member("Luca", "Bianchi")).id
    for (const id of [nadia, luca]) {
      tokens[id] = generateToken()
      await prisma.availabilityRequest.create({ data: { eventId, volunteerId: id, sentAt: new Date(), ...linkToken.data(tokens[id]) } })
      await prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId, volunteerId: id, days: [{ date: "2099-07-10", ranges: [] }, { date: "2099-07-11", ranges: [{ start: "09:00", end: "16:00" }] }], by: "admin" }))
    }
    // Owner, organiser, an inactive organiser and a sector leader: only the first two are told.
    for (const [role, isActive, who] of [["admin", true, "owner"], ["organizer", true, "orga"], ["organizer", false, "gone"]] as const) {
      await prisma.adminUser.create({ data: { organizationId: orgId, email: `${tag}-${who}@example.org`, name: `Claire ${who}`, passwordHash: "x", role, isActive } })
    }
    await prisma.sectorLeader.create({ data: { eventId, roleName: "Bar", name: "Marc Keller", email: `${tag}-leader@example.org`, ...linkToken.data(generateToken()) } })
  })

  afterAll(async () => {
    for (const id of [orgId, otherOrgId].filter(Boolean)) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: id } })
      await prisma.adminUser.deleteMany({ where: { organizationId: id } })
      await prisma.event.deleteMany({ where: { organizationId: id } })
      await prisma.volunteer.deleteMany({ where: { organizationId: id } })
      await prisma.organization.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  const call = async <T,>(mod: Promise<T>, name: keyof T, req: Request, params: Record<string, string>) => {
    const handler = (await mod)[name] as unknown as (r: Request, p: { params: Promise<Record<string, string>> }) => Promise<Response>
    const res = await handler(req, { params: Promise.resolve(params) })
    return { status: res.status, body: await res.json() }
  }
  const drafts = import("@/app/api/admin/events/[id]/drafts/route")
  const options = import("@/app/api/admin/events/[id]/drafts/options/route")
  const one = import("@/app/api/admin/events/[id]/drafts/[draftId]/route")
  const publish = import("@/app/api/admin/events/[id]/drafts/publish/route")
  const review = import("@/app/api/admin/events/[id]/availability/[volunteerId]/review/route")
  const link = import("@/app/api/public/availability/[token]/route")
  const digests = () => prisma.notificationOutbox.findMany({ where: { organizationId: orgId, dedupeKey: { startsWith: `availability_changed:${eventId}:` } } })

  it("refuses a correction after the deadline without a published mission", async () => {
    const res = await call(link, "PUT", request(`/api/public/availability/${tokens[luca]}`, "PUT", { days: [{ date: "2099-07-11", ranges: [] }] }), { token: tokens[luca] })
    expect(res.status).toBe(409)
    const view = await call(link, "GET", request(`/api/public/availability/${tokens[luca]}`, "GET"), { token: tokens[luca] })
    expect(view.body).toMatchObject({ open: false, correction: { published: false, viaCorrection: false } })
  })

  it("adds drafts from a cell, reviews one with its acknowledgement and publishes them", async () => {
    const opts = await call(options, "GET", request(`/api/admin/events/${eventId}/drafts/options?volunteerId=${nadia}&date=2099-07-11`, "GET"), { id: eventId })
    expect(opts.status).toBe(200)
    expect(opts.body.options.map((o: { shiftId: string }) => o.shiftId)).toEqual([bar, night])
    const nightOption = opts.body.options[1]
    expect(nightOption).toMatchObject({ fit: "outside", taken: null })
    expect(nightOption.ackKey).toBeTruthy()

    const a = await call(drafts, "POST", request(`/api/admin/events/${eventId}/drafts`, "POST", { shiftId: bar, volunteerId: nadia }), { id: eventId })
    expect(a.status).toBe(201)
    const b = await call(drafts, "POST", request(`/api/admin/events/${eventId}/drafts`, "POST", { shiftId: night, volunteerId: nadia }), { id: eventId })
    expect(b.status).toBe(201)
    expect((await call(drafts, "POST", request(`/api/admin/events/${eventId}/drafts`, "POST", { shiftId: bar, volunteerId: nadia }), { id: eventId })).status).toBe(409)

    // The per-shift panel sees the drafts, apart from committed hours.
    const assist = await loadShiftAssist(getOrgClient(orgId), eventId, bar, "event")
    const row = assist!.rows.find((r) => r.volunteerId === nadia)!
    expect(row).toMatchObject({ draftOnShift: true, minutes: { committed: 0, draft: 240 } })

    let board = await loadDraftBoard(getOrgClient(orgId), eventId, "event")
    expect(board!.summary).toMatchObject({ drafts: 2, people: 1, ackMissing: 1 })
    const refused = await call(publish, "POST", request(`/api/admin/events/${eventId}/drafts/publish`, "POST", { selection: board!.summary.selection, idempotencyKey: `${tag}-k1` }), { id: eventId })
    expect(refused).toMatchObject({ status: 409, body: { code: "refused", problems: [expect.objectContaining({ code: "ack_missing" })] } })

    const reviewed = await call(one, "PATCH", request(`/api/admin/events/${eventId}/drafts/${b.body.draft.id}`, "PATCH", { revision: b.body.draft.revision, ackKey: nightOption.ackKey }), { id: eventId, draftId: b.body.draft.id })
    expect(reviewed.status).toBe(200)
    board = await loadDraftBoard(getOrgClient(orgId), eventId, "event")
    expect(board!.summary).toMatchObject({ ackMissing: 0, problems: [] })
    const done = await call(publish, "POST", request(`/api/admin/events/${eventId}/drafts/publish`, "POST", { selection: board!.summary.selection, idempotencyKey: `${tag}-k2` }), { id: eventId })
    expect(done).toMatchObject({ status: 200, body: { published: 2, people: 1, replay: false } })
    expect(await prisma.registration.count({ where: { eventId, volunteerId: nadia, source: "admin_draft", status: "active" } })).toBe(2)
    // The cell now shows confirmed missions, no draft.
    board = await loadDraftBoard(getOrgClient(orgId), eventId, "event")
    expect(board!.rows.find((r) => r.volunteerId === nadia)!.cells.find((c) => c.date === "2099-07-11")!.items.map((i) => i.kind)).toEqual(["confirmed", "confirmed"])
  })

  it("lets the published person correct after the deadline, flags the answer and tells the owners and organisers", async () => {
    const view = await call(link, "GET", request(`/api/public/availability/${tokens[nadia]}`, "GET"), { token: tokens[nadia] })
    expect(view.body).toMatchObject({ open: true, correction: { published: true, viaCorrection: true } })
    expect(new Date(view.body.correction.until).toISOString()).toBe("2099-07-12T00:00:00.000Z")

    // Same answer again: not a change, nobody is told.
    const same = await call(link, "PUT", request(`/api/public/availability/${tokens[nadia]}`, "PUT", { days: [{ date: "2099-07-11", ranges: [{ start: "09:00", end: "16:00" }] }] }), { token: tokens[nadia] })
    expect(same.status).toBe(200)
    expect(await digests()).toEqual([])

    // Free from 12:00 only: the bar (10:00-14:00) is now partly outside.
    const res = await call(link, "PUT", request(`/api/public/availability/${tokens[nadia]}`, "PUT", { days: [{ date: "2099-07-11", ranges: [{ start: "12:00", end: "16:00" }] }] }), { token: tokens[nadia] })
    expect(res.status).toBe(200)
    const req = await prisma.availabilityRequest.findFirstOrThrow({ where: { eventId, volunteerId: nadia } })
    expect(req.reviewReason).toBe("published")
    expect(req.reviewNeededAt).not.toBeNull()
    // Nobody moved: both registrations still active.
    expect(await prisma.registration.count({ where: { eventId, volunteerId: nadia, status: "active" } })).toBe(2)

    const rows = await digests()
    expect(rows.map((r) => openPayload(r.payload).recipient.email).sort()).toEqual([`${tag}-orga@example.org`, `${tag}-owner@example.org`])
    const items = (openPayload(rows[0].payload).data as { items: { value: { volunteerName: string; outside: string[] } }[] }).items
    expect(items).toHaveLength(1)
    expect(items[0].value.volunteerName).toBe("Nadia Rochat")
    expect(items[0].value.outside).toEqual([expect.stringContaining("Bar")])

    // A second change merges into the same line while the email waits.
    await call(link, "PUT", request(`/api/public/availability/${tokens[nadia]}`, "PUT", { days: [{ date: "2099-07-11", ranges: [{ start: "13:00", end: "16:00" }] }] }), { token: tokens[nadia] })
    const again = await digests()
    expect(again).toHaveLength(2)
    expect((openPayload(again[0].payload).data as { items: unknown[] }).items).toHaveLength(1)

    const board = await loadDraftBoard(getOrgClient(orgId), eventId, "event")
    expect(board!.rows.find((r) => r.volunteerId === nadia)!.reviewTexts).toEqual(["À revoir : disponibilités modifiées après la publication des affectations."])
  })

  it("clears the flag only at the revision seen", async () => {
    const req = await prisma.availabilityRequest.findFirstOrThrow({ where: { eventId, volunteerId: nadia } })
    const stale = await call(review, "POST", request(`/api/admin/events/${eventId}/availability/${nadia}/review`, "POST", { revision: req.revision - 1 }), { id: eventId, volunteerId: nadia })
    expect(stale).toMatchObject({ status: 409, body: { code: "changed" } })
    const ok = await call(review, "POST", request(`/api/admin/events/${eventId}/availability/${nadia}/review`, "POST", { revision: req.revision }), { id: eventId, volunteerId: nadia })
    expect(ok.status).toBe(200)
    expect((await prisma.availabilityRequest.findFirstOrThrow({ where: { eventId, volunteerId: nadia } })).reviewReason).toBeNull()
  })

  it("closes the correction once the event's last shift has ended", async () => {
    await prisma.shift.updateMany({ where: { eventId }, data: { date: new Date("2020-07-11T00:00:00Z") } })
    const res = await call(link, "PUT", request(`/api/public/availability/${tokens[nadia]}`, "PUT", { days: [{ date: "2099-07-11", ranges: [] }] }), { token: tokens[nadia] })
    expect(res.status).toBe(409)
    await prisma.shift.updateMany({ where: { eventId }, data: { date: new Date("2099-07-11T00:00:00Z") } })
  })

  it("keeps every route on this organisation's events", async () => {
    guard.value = { db: getOrgClient(otherOrgId), organizationId: otherOrgId, session: { user: { id: "adm-b", email: "b@example.org" } } }
    try {
      expect((await call(options, "GET", request(`/api/admin/events/${eventId}/drafts/options?volunteerId=${nadia}&date=2099-07-11`, "GET"), { id: eventId })).status).toBe(404)
      expect((await call(drafts, "POST", request(`/api/admin/events/${eventId}/drafts`, "POST", { shiftId: bar, volunteerId: luca }), { id: eventId })).status).toBe(404)
      expect((await call(publish, "POST", request(`/api/admin/events/${eventId}/drafts/publish`, "POST", { selection: [{ id: "x", revision: 1 }], idempotencyKey: `${tag}-kb` }), { id: eventId })).status).toBe(404)
      expect((await call(review, "POST", request(`/api/admin/events/${eventId}/availability/${nadia}/review`, "POST", { revision: 1 }), { id: eventId, volunteerId: nadia })).status).toBe(404)
      expect(await loadDraftBoard(getOrgClient(otherOrgId), eventId, "event")).toBeNull()
    } finally {
      guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-owner", email: `${tag}-owner@example.org` } } }
    }
  })
})
