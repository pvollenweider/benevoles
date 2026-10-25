import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * #1140 on Postgres: a question asked to some postes. Older questions read as asked to everyone
 * (column defaults); the personal page asks only the questions of the postes held and keeps the
 * answer of a poste left; a poste renamed or deleted is carried into the scope, the answer staying
 * on the question, and a scope left without postes is asked to nobody.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { registrationToken } from "@/lib/token-vault"

const url = process.env.DATABASE_URL
const tag = `int-qscope-${Date.now()}`

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: body === undefined ? undefined : JSON.stringify(body) })

describe.skipIf(!url)("questions asked to some postes (#1140)", () => {
  let orgId = ""
  let eventId = ""
  let volunteerId = ""
  let allId = ""
  let barId = ""
  const token = `${tag}-reg`

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-test", email: "adm@example.org" } } }
    eventId = (await prisma.event.create({
      data: { organizationId: orgId, slug: tag, title: "Fête", startDate: new Date("2099-06-01"), endDate: new Date("2099-06-02") },
    })).id
    const base = { eventId, date: new Date("2099-06-01"), capacity: 3 }
    const bar = await prisma.shift.create({ data: { ...base, roleName: "Bar", label: "Bar", startTime: "09:00", endTime: "13:00" } })
    const parking = await prisma.shift.create({ data: { ...base, roleName: "Parking", label: "Parking", startTime: "14:00", endTime: "16:00" } })
    volunteerId = (await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Julie", lastName: "Martin", email: `${tag}-julie@example.org` } })).id
    // On the bar (cancelled since: the poste was left) and on the parking.
    await prisma.registration.create({ data: { eventId, shiftId: bar.id, volunteerId, status: "cancelled", ...registrationToken.data(`${tag}-old`) } })
    await prisma.registration.create({ data: { eventId, shiftId: parking.id, volunteerId, status: "active", ...registrationToken.data(token) } })
    // Created as before #1140, without a scope: the defaults.
    allId = (await prisma.eventQuestion.create({ data: { eventId, label: "Taille ?", type: "text", position: 0 } })).id
    barId = (await prisma.eventQuestion.create({ data: { eventId, label: "Caisse ?", type: "text", required: true, position: 1, displayScope: "roles", displayRoleNames: ["Bar"] } })).id
    await prisma.questionAnswer.create({ data: { questionId: barId, eventId, volunteerId, values: ["Oui, au festival"] } })
  })

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it("an older question is asked to everyone", async () => {
    expect(await prisma.eventQuestion.findUniqueOrThrow({ where: { id: allId }, select: { displayScope: true, displayRoleNames: true } })).toEqual({ displayScope: "event", displayRoleNames: [] })
  })

  it("the personal page asks only the questions of the postes held, and shows the answer kept for the bar apart", async () => {
    const { GET } = await import("@/app/api/public/registrations/[token]/route")
    const res = await GET(request("/api/public/registrations/x", "GET"), { params: Promise.resolve({ token }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answers.map((r: { id: string }) => r.id)).toEqual([allId])
    expect(body.keptAnswers).toEqual([{ id: barId, label: "Caisse ?", answer: "Oui, au festival" }])
  })

  it("an edit from the personal page neither requires nor clears the bar question", async () => {
    const { PATCH } = await import("@/app/api/public/registrations/[token]/answers/route")
    const res = await PATCH(request("/api/public/registrations/x/answers", "PATCH", { answers: { [allId]: "M", [barId]: "" } }), { params: Promise.resolve({ token }) })
    expect(res.status).toBe(200)
    const stored = await prisma.questionAnswer.findMany({ where: { volunteerId }, select: { questionId: true, values: true }, orderBy: { questionId: "asc" } })
    expect(new Map(stored.map((a) => [a.questionId, a.values]))).toEqual(new Map([[allId, ["M"]], [barId, ["Oui, au festival"]]]))
  })

  it("a poste renamed then deleted is carried into the scope; the answer stays; asked to nobody, never to everyone", async () => {
    const { PATCH, DELETE } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request(`/api/admin/events/${eventId}/roles/Bar`, "PATCH", { name: "Buvette" }), { params: Promise.resolve({ id: eventId, roleName: "Bar" }) })).status).toBe(200)
    expect((await prisma.eventQuestion.findUniqueOrThrow({ where: { id: barId } })).displayRoleNames).toEqual(["Buvette"])
    expect((await DELETE(request(`/api/admin/events/${eventId}/roles/Buvette`, "DELETE"), { params: Promise.resolve({ id: eventId, roleName: "Buvette" }) })).status).toBe(200)
    expect(await prisma.eventQuestion.findUniqueOrThrow({ where: { id: barId }, select: { displayScope: true, displayRoleNames: true } })).toEqual({ displayScope: "roles", displayRoleNames: [] })
    expect(await prisma.questionAnswer.count({ where: { questionId: barId } })).toBe(1)
  })
})
