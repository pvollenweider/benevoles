import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * #1001 on Postgres: renaming a poste carries its sector leaders, so the leader's personal list,
 * the withdrawal emails and the answer changes of a question attached to the poste (#984 part 3)
 * keep reaching them. A leader already recorded under the new name joins the renamed poste; a
 * person on both sides keeps one row, the renamed poste's.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { openPayload } from "@/lib/notifications/outbox"
import { buildWithdrawalNotifications } from "@/lib/withdrawal-notifications"
import { queueAnswerChangeNotifications } from "@/lib/answer-change-notifications"

const url = process.env.DATABASE_URL
const tag = `int-rlead-${Date.now()}`

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" }, body: body === undefined ? undefined : JSON.stringify(body) })

describe.skipIf(!url)("sector leaders follow a poste rename (#1001)", () => {
  let orgId = ""
  let eventId = ""
  let shiftId = ""
  let questionId = ""
  const marcEmail = `${tag}-marc@example.org`

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-test", email: "adm@example.org" } } }
    await prisma.adminUser.create({ data: { organizationId: orgId, email: `${tag}-admin@example.org`, name: "Anne", passwordHash: "x", role: "admin" } })
    eventId = (await prisma.event.create({
      data: { organizationId: orgId, slug: tag, title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-02") },
    })).id
    const base = { eventId, roleName: "Bar", label: "Bar", date: new Date("2030-06-01"), capacity: 3 }
    shiftId = (await prisma.shift.create({ data: { ...base, startTime: "09:00", endTime: "13:00" } })).id
    await prisma.shift.create({ data: { ...base, roleName: "Cuisine", label: "Cuisine", startTime: "09:00", endTime: "13:00" } })
    const volunteer = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Julie", lastName: "Martin", email: `${tag}-julie@example.org` } })
    await prisma.registration.create({ data: { eventId, shiftId, volunteerId: volunteer.id, status: "active", ...registrationToken.data(`${tag}-reg`) } })
    questionId = (await prisma.eventQuestion.create({ data: { eventId, label: "Repas ?", type: "text", roleName: "Bar" } })).id

    // Marc leads Bar. Under the future name « Buvette », Léa was designated in advance, and so was
    // Marc, typed with another casing: after the rename he must keep only one row.
    await prisma.sectorLeader.create({ data: { eventId, roleName: "Bar", name: "Marc Dupont", email: marcEmail, ...linkToken.data(`${tag}-marc-bar`) } })
    await prisma.sectorLeader.create({ data: { eventId, roleName: "Buvette", name: "Léa Roux", email: `${tag}-lea@example.org`, ...linkToken.data(`${tag}-lea`) } })
    await prisma.sectorLeader.create({ data: { eventId, roleName: "Buvette", name: "Marc", email: marcEmail.toUpperCase(), ...linkToken.data(`${tag}-marc-buvette`) } })
    await prisma.sectorLeader.create({ data: { eventId, roleName: "Cuisine", name: "Paul", email: `${tag}-paul@example.org`, ...linkToken.data(`${tag}-paul`) } })
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  const leaders = async () =>
    (await prisma.sectorLeader.findMany({ where: { eventId }, select: { roleName: true, name: true }, orderBy: [{ roleName: "asc" }, { name: "asc" }] }))

  it("renames the poste's leader rows with it, one row per person, other postes untouched", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(request(`/api/admin/events/${eventId}/roles/Bar`, "PATCH", { name: "Buvette" }), { params: Promise.resolve({ id: eventId, roleName: "Bar" }) })
    expect(res.status).toBe(200)
    expect(await leaders()).toEqual([
      { roleName: "Buvette", name: "Léa Roux" },
      { roleName: "Buvette", name: "Marc Dupont" },
      { roleName: "Cuisine", name: "Paul" },
    ])
    expect((await prisma.eventQuestion.findUnique({ where: { id: questionId } }))!.roleName).toBe("Buvette")
  })

  it("keeps the renamed poste on the leader's personal list; the dropped duplicate link no longer opens", async () => {
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const res = await GET(request(`/api/public/leader/x`, "GET"), { params: Promise.resolve({ token: `${tag}-marc-bar` }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.roleName).toBe("Buvette")
    expect(body.registrations.map((r: { volunteer: { firstName: string } }) => r.volunteer.firstName)).toEqual(["Julie"])
    const dropped = await GET(request(`/api/public/leader/x`, "GET"), { params: Promise.resolve({ token: `${tag}-marc-buvette` }) })
    expect(dropped.status).toBe(404)
  })

  it("still tells the renamed poste's leaders of a withdrawal", async () => {
    const shift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } })
    const payloads = await buildWithdrawalNotifications({
      registrationId: "reg-1",
      event: { id: eventId, title: "Fête", organizationId: orgId, organization: { slug: tag } },
      shift, volunteerName: "Julie Martin", message: null, waitlistTookSpot: false, placesMissing: 1,
    })
    const toLeaders = payloads.filter((p) => p.kind === "sector_leader_withdrawal").map((p) => p.recipient.email).sort()
    expect(toLeaders).toEqual([marcEmail, `${tag}-lea@example.org`].sort())
  })

  it("still sends an answer change of the poste's question to its leaders, not to the organisers", async () => {
    const q = await prisma.eventQuestion.findUniqueOrThrow({ where: { id: questionId } })
    await queueAnswerChangeNotifications({
      event: { id: eventId, title: "Fête", organizationId: orgId }, volunteerId: "v1", volunteerName: "Julie Martin",
      changes: [{ questionId: q.id, label: q.label, from: ["Oui"], to: ["Non"], roleName: q.roleName }], changeId: `${tag}-1`,
    })
    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId, dedupeKey: { contains: "answers_changed" } } })
    expect(rows.every((r) => r.dedupeKey?.startsWith("sector_leader_answers_changed:"))).toBe(true)
    const recipients = rows.map((r) => (openPayload(r.payload as string).recipient as { email: string }).email).sort()
    expect(recipients).toEqual([marcEmail, `${tag}-lea@example.org`].sort())
  })

  it("leaves the leaders in place when the poste is deleted", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await DELETE(request(`/api/admin/events/${eventId}/roles/Buvette`, "DELETE"), { params: Promise.resolve({ id: eventId, roleName: "Buvette" }) })
    expect(res.status).toBe(200)
    expect((await leaders()).filter((l) => l.roleName === "Buvette")).toHaveLength(2)
  })
})
