import { describe, it, expect, afterAll, beforeAll, vi } from "vitest"

/**
 * The links of an organisation (volunteers' personal links, sector leaders' links, waitlist offers,
 * member invitations, calendar subscriptions) against a real Postgres: they work while it is
 * active, and give no data and change nothing once it is deactivated (by the operator or for
 * inactivity) or suspended, whatever the host; they work again once it is reactivated. Removing
 * one's own push subscription stays possible.
 */

// Deliveries run after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))
// No organisation header: the request comes through the main domain, not an organisation's host.
const requestHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }))

import { prisma } from "@/lib/prisma"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { calendarFeedKeyFromEnv, calendarFeedToken } from "@/lib/calendar-feed"
import { ORG_UNAVAILABLE_CODE } from "@/lib/org-lifecycle"
import { GET as leaderRead } from "@/app/api/public/leader/[token]/route"
import { GET as pageRead, DELETE as withdraw } from "@/app/api/public/registrations/[token]/route"
import { PATCH as availabilityWrite } from "@/app/api/public/registrations/[token]/availability/route"
import { PATCH as answersWrite } from "@/app/api/public/registrations/[token]/answers/route"
import { GET as rosterRead, PATCH as rosterWrite } from "@/app/api/public/registrations/[token]/roster/route"
import { GET as calendarFile } from "@/app/api/public/registrations/[token]/calendar/route"
import { GET as calendarFeed } from "@/app/api/public/registrations/[token]/calendar.ics/route"
import { POST as resendLink } from "@/app/api/public/registrations/[token]/resend-link/route"
import { POST as waitlistConfirm } from "@/app/api/public/waitlist/[token]/confirm/route"
import { GET as inviteRead } from "@/app/api/public/member-invite/[token]/route"
import { POST as inviteDecline } from "@/app/api/public/member-invite/[token]/decline/route"
import { POST as pushSubscribe, DELETE as pushUnsubscribe } from "@/app/api/public/push/route"

const url = process.env.DATABASE_URL
const tag = `int-life-${Date.now()}`
let n = 0
const ip = () => `${tag}-${++n}`

const call = (method: string, body?: unknown) => new Request(`http://localhost/x`, {
  method,
  headers: { "Content-Type": "application/json", "x-forwarded-for": ip() },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const params = (token: string) => ({ params: Promise.resolve({ token }) })

type Fixture = {
  orgId: string; volunteerId: string; registrationId: string; offeredId: string; inviteId: string; eventId: string
  personal: string; offered: string; leader: string; invite: string; feed: string
}

async function fixture(suffix: string): Promise<Fixture> {
  const org = await prisma.organization.create({ data: { name: `Comité ${suffix}`, slug: `${tag}-${suffix}` } })
  const event = await prisma.event.create({ data: { organizationId: org.id, slug: "fete", title: "Fête", startDate: new Date("2027-06-01"), endDate: new Date("2027-06-02"), shiftRosterEnabled: true } })
  const shift = await prisma.shift.create({ data: { eventId: event.id, roleName: "Accueil", label: "Accueil", date: new Date("2027-06-01"), startTime: "10:00", endTime: "12:00", capacity: 5 } })
  const volunteer = await prisma.volunteer.create({ data: { organizationId: org.id, firstName: "Aline", lastName: "Martin", email: `${tag}-${suffix}@example.org`, phone: "+41790000000", availabilityNote: "avant" } })
  const other = await prisma.volunteer.create({ data: { organizationId: org.id, firstName: "Paul", lastName: "Durand", email: `${tag}-${suffix}-2@example.org` } })
  const personal = `${tag}-${suffix}-personal-token-0000000000`
  const offered = `${tag}-${suffix}-offered-token-00000000000`
  const leader = `${tag}-${suffix}-leader-token-000000000000`
  const invite = `${tag}-${suffix}-invite-token-000000000000`
  const reg = await prisma.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: volunteer.id, ...registrationToken.data(personal) } })
  const offer = await prisma.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: other.id, status: "offered", waitingExpiresAt: new Date(Date.now() + 3600_000), ...registrationToken.data(offered) } })
  await prisma.sectorLeader.create({ data: { eventId: event.id, roleName: "Accueil", name: "Chef", email: `${tag}-${suffix}-leader@example.org`, ...linkToken.data(leader) } })
  const inv = await prisma.memberInvite.create({ data: { eventId: event.id, volunteerId: other.id, ...linkToken.data(invite) } })
  const stored = await prisma.registration.findUniqueOrThrow({ where: { id: reg.id }, select: { editTokenHash: true } })
  const feed = calendarFeedToken(reg.id, stored.editTokenHash, calendarFeedKeyFromEnv()!)
  return { orgId: org.id, volunteerId: volunteer.id, registrationId: reg.id, offeredId: offer.id, inviteId: inv.id, eventId: event.id, personal, offered, leader, invite, feed }
}

/** Every link route, once each; reads and writes. */
async function everyLink(f: Fixture) {
  return {
    leader: await leaderRead(call("GET"), params(f.leader)),
    page: await pageRead(call("GET"), params(f.personal)),
    availability: await availabilityWrite(call("PATCH", { availabilityPeriods: ["morning"], availabilityNote: "pendant" }), params(f.personal)),
    answers: await answersWrite(call("PATCH", { answers: {} }), params(f.personal)),
    rosterRead: await rosterRead(call("GET"), params(f.personal)),
    rosterHide: await rosterWrite(call("PATCH", { visible: false }), params(f.personal)),
    calendarFile: await calendarFile(call("GET"), params(f.personal)),
    calendarFeed: await calendarFeed(call("GET"), params(f.feed)),
    resendLink: await resendLink(call("POST"), params(f.personal)),
    waitlist: await waitlistConfirm(call("POST"), params(f.offered)),
    inviteRead: await inviteRead(call("GET"), params(f.invite)),
    inviteDecline: await inviteDecline(call("POST"), params(f.invite)),
    push: await pushSubscribe(call("POST", { editToken: f.personal, endpoint: `https://push.example.org/${tag}`, auth: "a", p256dh: "b" })),
    withdraw: await withdraw(call("DELETE", {}), params(f.personal)),
  }
}

/** What the links could have changed, to compare before and after a refusal. */
async function snapshot(f: Fixture) {
  const [volunteer, reg, offer, invite, push, roster, eventLogs, outbox] = await Promise.all([
    prisma.volunteer.findUniqueOrThrow({ where: { id: f.volunteerId }, select: { availabilityPeriods: true, availabilityNote: true } }),
    prisma.registration.findUniqueOrThrow({ where: { id: f.registrationId }, select: { status: true } }),
    prisma.registration.findUniqueOrThrow({ where: { id: f.offeredId }, select: { status: true } }),
    prisma.memberInvite.findUniqueOrThrow({ where: { id: f.inviteId }, select: { declinedAt: true } }),
    prisma.pushSubscription.count({ where: { volunteerId: f.volunteerId } }),
    prisma.rosterConsent.count({ where: { eventId: f.eventId } }),
    prisma.eventLog.count({ where: { eventId: f.eventId } }),
    prisma.notificationOutbox.count({ where: { organizationId: f.orgId } }),
  ])
  return { volunteer, reg, offer, invite, push, roster, eventLogs, outbox }
}

const CLOSED_STATES = {
  "deactivated by the operator": { active: false },
  "deactivated for inactivity": { active: false, inactivityDeactivatedAt: new Date() },
  suspended: { active: false, suspendedAt: new Date(), suspensionReason: "Enquête" },
  // Defence in depth: a suspension that an inconsistent write left active still closes the links.
  "suspended but left active": { active: true, suspendedAt: new Date(), suspensionReason: "Enquête" },
} as const

describe.skipIf(!url)("an organisation's links follow its lifecycle", () => {
  const orgIds: string[] = []
  let key: Buffer | null = null

  beforeAll(() => {
    key = calendarFeedKeyFromEnv()
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
    await prisma.volunteer.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("has a calendar key in this environment (AUTH_SECRET of 32 characters or more)", () => {
    expect(key).not.toBeNull()
  })

  it("answers every link while the organisation is active", async () => {
    const f = await fixture("open")
    orgIds.push(f.orgId)
    const leader = await leaderRead(call("GET"), params(f.leader))
    expect(leader.status).toBe(200)
    expect((await leader.json()).registrations[0].volunteer.email).toBe(`${tag}-open@example.org`)
    const page = await pageRead(call("GET"), params(f.personal))
    expect(page.status).toBe(200)
    const write = await availabilityWrite(call("PATCH", { availabilityPeriods: ["morning"], availabilityNote: "pendant" }), params(f.personal))
    expect(write.status).toBe(200)
    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: f.volunteerId } })).availabilityNote).toBe("pendant")
    expect((await calendarFeed(call("GET"), params(f.feed))).status).toBe(200)
    expect((await inviteRead(call("GET"), params(f.invite))).status).toBe(200)
  })

  for (const [name, state] of Object.entries(CLOSED_STATES)) {
    it(`refuses every link, with no data and no change, when ${name}`, async () => {
      const f = await fixture(name.replace(/\W+/g, "-"))
      orgIds.push(f.orgId)
      await prisma.organization.update({ where: { id: f.orgId }, data: state })
      const before = await snapshot(f)

      const answers = await everyLink(f)
      for (const [route, res] of Object.entries(answers)) {
        expect(res.status, route).toBe(403)
        expect(res.headers.get("cache-control"), route).toContain("no-store")
        const body = await res.text()
        expect(body, route).not.toContain("@example.org")
        expect(body, route).not.toContain("+4179")
        expect(body, route).not.toContain("Aline")
        expect(body, route).not.toContain("BEGIN:VCALENDAR")
        // The JSON answers carry the code the pages recognise.
        if (res.headers.get("content-type")?.includes("json")) expect(JSON.parse(body).code, route).toBe(ORG_UNAVAILABLE_CODE)
      }
      expect(await snapshot(f)).toEqual(before)
    })
  }

  it("refuses on an organisation's host too, and the link works again after reactivation", async () => {
    const f = await fixture("again")
    orgIds.push(f.orgId)
    await prisma.organization.update({ where: { id: f.orgId }, data: { active: false } })
    requestHeaders.set("x-org-slug", `${tag}-again`)
    try {
      expect((await inviteRead(call("GET"), params(f.invite))).status).toBeGreaterThanOrEqual(403)
    } finally {
      requestHeaders.delete("x-org-slug")
    }
    expect((await leaderRead(call("GET"), params(f.leader))).status).toBe(403)

    await prisma.organization.update({ where: { id: f.orgId }, data: { active: true } })
    expect((await leaderRead(call("GET"), params(f.leader))).status).toBe(200)
    expect((await pageRead(call("GET"), params(f.personal))).status).toBe(200)
  })

  it("still lets a volunteer remove their own push subscription while the organisation is closed", async () => {
    const f = await fixture("push")
    orgIds.push(f.orgId)
    const endpoint = `https://push.example.org/${tag}-own`
    expect((await pushSubscribe(call("POST", { editToken: f.personal, endpoint, auth: "a", p256dh: "b" }))).status).toBe(200)
    await prisma.organization.update({ where: { id: f.orgId }, data: { active: false, suspendedAt: new Date() } })
    const res = await pushUnsubscribe(call("DELETE", { editToken: f.personal, endpoint }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await prisma.pushSubscription.count({ where: { volunteerId: f.volunteerId } })).toBe(0)
  })
})
