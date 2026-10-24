import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * Revocation of links and of queued emails, against a real Postgres (throwaway database only):
 * - changing a password (or a super admin's address) revokes a pending reset link, and a recovery
 *   request that started before the change never writes one after it;
 * - correcting a member's address renews their personal links, calendar address and invitations,
 *   cancels what was queued for the old address and queues the new links for the new one;
 * - a recovery request over the per-recipient cap leaves the link already received working.
 * SMTP is replaced by an in-memory channel; nothing leaves the process.
 */

const state = vi.hoisted(() => ({ orgId: "", adminId: "", adminEmail: "", sent: [] as { kind: string; recipient: { email?: string | null }; data: Record<string, unknown> }[] }))
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: () => {} }))
vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: async () => ({
    organizationId: state.orgId,
    session: { user: { id: state.adminId, email: state.adminEmail, role: "admin" } },
    db: (await import("@/lib/prisma-org")).getOrgClient(state.orgId),
  }),
  requireSuperAdmin: async () => ({ session: { user: { id: state.adminId, email: state.adminEmail, role: "super_admin" } } }),
}))
vi.mock("@/lib/notifications/channels/email", () => ({
  emailChannel: { send: async (payload: (typeof state.sent)[number]) => { state.sent.push(payload); return { ok: true } } },
}))

import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { deliverOutbox, enqueueNotifications, openPayload } from "@/lib/notifications/outbox"
import { calendarFeedKey, calendarFeedLinkValid, calendarFeedToken, parseCalendarFeedToken } from "@/lib/calendar-feed"
import { requestPasswordRecovery } from "@/lib/password-recovery"
import { sendLimits } from "@/lib/notifications/send-limits"
import { POST as forgotPassword } from "@/app/api/public/forgot-password/route"
import { POST as resetPassword } from "@/app/api/public/reset-password/route"
import { POST as changePassword } from "@/app/api/admin/settings/password/route"
import { PATCH as superAdminProfile } from "@/app/api/super-admin/profile/route"
import { PATCH as editMember } from "@/app/api/admin/members/[id]/route"
import { GET as personalPage } from "@/app/api/public/registrations/[token]/route"
import { POST as pushSubscribe } from "@/app/api/public/push/route"

const url = process.env.DATABASE_URL
const tag = `int-revoke-${Date.now()}`
const PASSWORD = "Ancien-mot-de-passe-2026"
let ipSeq = 0
const nextIp = () => `${tag}-ip-${ipSeq++}`

const jsonRequest = (method: string, body: unknown) =>
  new Request("http://localhost/api/test", { method, headers: { "content-type": "application/json", "x-forwarded-for": nextIp() }, body: JSON.stringify(body) })

const tokenOf = (resetUrl: unknown) => new URL(String(resetUrl)).searchParams.get("token")!

async function pendingPasswordResets(organizationId: string | null) {
  const rows = await prisma.notificationOutbox.findMany({ where: { organizationId, status: "pending" }, orderBy: { createdAt: "asc" } })
  return rows.filter((r) => openPayload(r.payload).kind === "password_reset")
}

describe.skipIf(!url)("revocation of links and queued emails", () => {
  let seq = 0
  beforeEach(() => { state.sent = [] })

  async function organization() {
    const org = await prisma.organization.create({ data: { name: "Revocation", slug: `${tag}-${seq++}` } })
    state.orgId = org.id
    return org
  }

  async function admin(role: "admin" | "super_admin" = "admin") {
    const org = role === "admin" ? await organization() : null
    const email = `${tag}-admin-${seq++}@example.org`
    const row = await prisma.adminUser.create({ data: { name: "Admin", email, role, organizationId: org?.id ?? null, passwordHash: await bcrypt.hash(PASSWORD, 4) } })
    state.adminId = row.id
    state.adminEmail = email
    return row
  }

  afterAll(async () => {
    const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: tag } }, select: { id: true } })
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: { in: orgs.map((o) => o.id) } } })
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "email:recipient:" } } })
    await prisma.$disconnect()
  })

  describe("password change and recovery links", () => {
    it("changing the password revokes a reset link issued before: the old link changes nothing", async () => {
      const a = await admin()
      expect((await forgotPassword(jsonRequest("POST", { email: a.email }))).status).toBe(200)
      const [queued] = await pendingPasswordResets(a.organizationId)
      const oldLink = tokenOf(openPayload(queued.payload).data.resetUrl)

      expect((await changePassword(jsonRequest("POST", { currentPassword: PASSWORD, newPassword: "Nouveau-mot-de-passe-2026" }))).status).toBe(200)
      expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })).passwordResetTokenHash).toBeNull()

      expect((await resetPassword(jsonRequest("POST", { token: oldLink, password: "Mot-de-passe-du-lien-2026" }))).status).toBe(400)
      const after = await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })
      expect(await bcrypt.compare("Nouveau-mot-de-passe-2026", after.passwordHash)).toBe(true)

      // The email still queued with that link is cancelled at delivery, never sent.
      expect(await deliverOutbox({ ids: [queued.id] })).toMatchObject({ sent: 0, cancelled: 1 })
      expect(state.sent).toHaveLength(0)
    })

    it("a recovery request that read the account before a password change never writes a link after it", async () => {
      const a = await admin()
      const snapshot = { id: a.id, email: a.email, name: a.name, organizationId: a.organizationId, sessionVersion: a.sessionVersion, isActive: true }
      expect((await changePassword(jsonRequest("POST", { currentPassword: PASSWORD, newPassword: "Nouveau-mot-de-passe-2026" }))).status).toBe(200)
      expect(await requestPasswordRecovery(snapshot)).toEqual({ status: "stale" })
      expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })).passwordResetTokenHash).toBeNull()
      expect(await pendingPasswordResets(a.organizationId)).toHaveLength(0)
    })

    it("a recovery request racing a password change: whichever commits second, no link from before the change survives it", async () => {
      for (let round = 0; round < 4; round++) {
        const a = await admin()
        const snapshot = { id: a.id, email: a.email, name: a.name, organizationId: a.organizationId, sessionVersion: a.sessionVersion, isActive: true }
        const [recovery, change] = await Promise.all([
          requestPasswordRecovery(snapshot),
          changePassword(jsonRequest("POST", { currentPassword: PASSWORD, newPassword: "Nouveau-mot-de-passe-2026" })),
        ])
        expect(change.status).toBe(200)
        const final = await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })
        // The change always ends with no link: the request either committed first (then revoked)
        // or saw the new sessionVersion and wrote nothing.
        expect(final.passwordResetTokenHash).toBeNull()
        if (recovery.status === "queued") {
          expect(await deliverOutbox({ ids: recovery.outboxIds })).toMatchObject({ sent: 0, cancelled: 1 })
        } else {
          expect(recovery.status).toBe("stale")
        }
      }
    })

    it("a super admin's new address revokes a pending reset link, and the email queued for the old address is cancelled", async () => {
      const sa = await admin("super_admin")
      expect((await forgotPassword(jsonRequest("POST", { email: sa.email }))).status).toBe(200)
      const [queued] = await pendingPasswordResets(null)
      const oldLink = tokenOf(openPayload(queued.payload).data.resetUrl)
      const newEmail = `${tag}-sa-new-${seq++}@example.org`

      expect((await superAdminProfile(jsonRequest("PATCH", { currentPassword: PASSWORD, email: newEmail }))).status).toBe(200)
      expect(await deliverOutbox({ ids: [queued.id] })).toMatchObject({ sent: 0, cancelled: 1 })
      expect(state.sent).toHaveLength(0)
      expect((await resetPassword(jsonRequest("POST", { token: oldLink, password: "Mot-de-passe-du-lien-2026" }))).status).toBe(400)
    })

    it("an unrelated reset link still works when nothing changed (no regression)", async () => {
      const a = await admin()
      await forgotPassword(jsonRequest("POST", { email: a.email }))
      const [queued] = await pendingPasswordResets(a.organizationId)
      expect(await deliverOutbox({ ids: [queued.id] })).toMatchObject({ sent: 1 })
      expect((await resetPassword(jsonRequest("POST", { token: tokenOf(state.sent[0].data.resetUrl), password: "Mot-de-passe-du-lien-2026" }))).status).toBe(200)
    })
  })

  describe("recovery requests over the per-recipient cap", () => {
    it("sequential requests: the one over the cap changes nothing, the last link received still resets the password", async () => {
      const a = await admin()
      const cap = sendLimits().recipientPerHour
      const received: string[] = []
      for (let i = 0; i < cap + 1; i++) {
        expect((await forgotPassword(jsonRequest("POST", { email: a.email }))).status).toBe(200)
        const pending = await pendingPasswordResets(a.organizationId)
        if (i < cap) {
          expect(pending).toHaveLength(1)
          expect(await deliverOutbox({ ids: [pending[0].id] })).toMatchObject({ sent: 1 })
          received.push(tokenOf(state.sent.at(-1)!.data.resetUrl))
        } else {
          // Refused before anything changed: nothing queued, nothing dropped.
          expect(pending).toHaveLength(0)
        }
      }
      expect(state.sent).toHaveLength(cap)
      const final = await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })
      expect(final.passwordResetTokenHash).toBe(hashToken(received.at(-1)!))
      expect((await resetPassword(jsonRequest("POST", { token: received.at(-1)!, password: "Mot-de-passe-du-lien-2026" }))).status).toBe(200)
    })

    it("concurrent requests: at most the cap is queued, and the link the account holds is one that is delivered", async () => {
      const a = await admin()
      const cap = sendLimits().recipientPerHour
      const answers = await Promise.all(Array.from({ length: cap + 3 }, () => forgotPassword(jsonRequest("POST", { email: a.email }))))
      expect(answers.every((r) => r.status === 200)).toBe(true)
      const pending = await pendingPasswordResets(a.organizationId)
      expect(pending.length).toBeGreaterThan(0)
      expect(pending.length).toBeLessThanOrEqual(cap)

      // The queue then delivers: the current link goes, the ones it replaced are cancelled (they would not work).
      const result = await deliverOutbox({ ids: pending.map((p) => p.id) })
      expect(result).toMatchObject({ sent: 1, cancelled: pending.length - 1 })
      const final = await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })
      expect(final.passwordResetTokenHash).toBe(hashToken(tokenOf(state.sent[0].data.resetUrl)))
      expect((await resetPassword(jsonRequest("POST", { token: tokenOf(state.sent[0].data.resetUrl), password: "Mot-de-passe-du-lien-2026" }))).status).toBe(200)
    })
  })

  describe("an organiser corrects a member's address", () => {
    let eventId = ""
    let shiftId = ""
    let orgSlug = ""

    beforeAll(async () => {
      await admin()
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: state.orgId } })
      orgSlug = org.slug
      const event = await prisma.event.create({
        data: { organizationId: org.id, slug: "fete", title: "Fête", publicStatus: "published", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02") },
      })
      eventId = event.id
      shiftId = (await prisma.shift.create({ data: { eventId, roleName: "Accueil", label: "Accueil", date: new Date("2031-06-01"), startTime: "10:00", endTime: "12:00", capacity: 10 } })).id
    })

    async function member(email: string | null) {
      const n = seq++
      const v = await prisma.volunteer.create({ data: { organizationId: state.orgId, firstName: "Alix", lastName: `Membre${n}`, email } })
      const personal = `${tag}-personal-${n}`
      const reg = await prisma.registration.create({ data: { eventId, shiftId, volunteerId: v.id, ...registrationToken.data(personal) } })
      return { v, reg, personal }
    }

    const edit = (id: string, body: unknown) => editMember(jsonRequest("PATCH", body), { params: Promise.resolve({ id }) })
    const openPersonal = (token: string) => personalPage(new Request("http://localhost/my", { headers: { "x-forwarded-for": nextIp() } }), { params: Promise.resolve({ token }) })

    it("an email queued for the old address is cancelled, the old link stops working, and the new link goes to the new address", async () => {
      const oldEmail = `${tag}-typo-${seq++}@example.org`
      const newEmail = `${tag}-right-${seq++}@example.org`
      const { v, reg, personal } = await member(oldEmail)
      const queued = await enqueueNotifications([{
        kind: "registration_link_resend", organizationId: state.orgId, volunteerId: v.id,
        recipient: { email: oldEmail, name: "Alix" }, data: { volunteerName: "Alix", eventTitle: "Fête", orgSlug, editToken: personal },
      }])
      expect((await openPersonal(personal)).status).toBe(200)

      const res = await edit(v.id, { email: newEmail })
      expect(res.status).toBe(200)
      expect((await res.json()).linksRenewed).toMatchObject({ emailsQueued: 1 })

      // Cancelled when the address was corrected, never sent, never redirected.
      expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: queued[0] } }))).toMatchObject({ status: "cancelled", lastError: "member_address_changed" })
      expect((await openPersonal(personal)).status).toBe(404)

      const fresh = await prisma.notificationOutbox.findMany({ where: { organizationId: state.orgId, status: "pending" } })
      const mine = fresh.map((r) => ({ id: r.id, p: openPayload(r.payload) })).filter((r) => r.p.volunteerId === v.id)
      expect(mine).toHaveLength(1)
      expect(mine[0].p).toMatchObject({ kind: "registration_link_resend", recipient: { email: newEmail } })
      expect(await deliverOutbox({ ids: [mine[0].id] })).toMatchObject({ sent: 1 })
      expect(state.sent.map((s) => s.recipient.email)).toEqual([newEmail])
      const newLink = String(state.sent[0].data.editToken)
      expect(newLink).not.toBe(personal)
      expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).editTokenHash).toBe(hashToken(newLink))
      const page = await openPersonal(newLink)
      expect(page.status).toBe(200)
      expect((await page.json()).volunteer.email).toBe(newEmail)
    })

    it("an email queued for the old address after the correction (a request in flight) is cancelled at delivery", async () => {
      const oldEmail = `${tag}-typo-${seq++}@example.org`
      const { v, personal } = await member(oldEmail)
      expect((await edit(v.id, { email: `${tag}-right-${seq++}@example.org` })).status).toBe(200)
      // Queued with the old address and the old link, as a request that read the member before would.
      const late = await enqueueNotifications([{
        kind: "registration_link_resend", organizationId: state.orgId, volunteerId: v.id,
        recipient: { email: oldEmail, name: "Alix" }, data: { volunteerName: "Alix", eventTitle: "Fête", orgSlug, editToken: personal },
      }])
      state.sent = []
      expect(await deliverOutbox({ ids: late })).toMatchObject({ sent: 0, cancelled: 1 })
      // Same without a member id, with the old link: it no longer exists, the email can't leave.
      const noId = await enqueueNotifications([{
        kind: "registration_link_resend", organizationId: state.orgId,
        recipient: { email: oldEmail, name: "Alix" }, data: { volunteerName: "Alix", eventTitle: "Fête", orgSlug, editToken: personal },
      }])
      expect(await deliverOutbox({ ids: noId })).toMatchObject({ sent: 0, cancelled: 1 })
      expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: noId[0] } })).lastError).toBe("personal_link_revoked")
      // And with the new link but the old address: its member's address is no longer this one.
      const newLink = await prisma.registration.findFirstOrThrow({ where: { volunteerId: v.id }, select: registrationToken.select }).then(registrationToken.reveal)
      const wrongAddress = await enqueueNotifications([{
        kind: "registration_link_resend", organizationId: state.orgId,
        recipient: { email: oldEmail, name: "Alix" }, data: { volunteerName: "Alix", eventTitle: "Fête", orgSlug, editToken: newLink },
      }])
      expect(await deliverOutbox({ ids: wrongAddress })).toMatchObject({ sent: 0, cancelled: 1 })
      expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: wrongAddress[0] } })).lastError).toBe("member_address_changed")
      expect(state.sent).toHaveLength(0)
    })

    it("the calendar address, the invitation link and push subscriptions made with the old links stop working", async () => {
      const { v, reg, personal } = await member(`${tag}-typo-${seq++}@example.org`)
      const invite = `${tag}-invite-${seq++}`
      const event2 = await prisma.event.create({ data: { organizationId: state.orgId, slug: `autre-${seq++}`, title: "Autre fête", publicStatus: "published", startDate: new Date("2031-07-01"), endDate: new Date("2031-07-01") } })
      await prisma.memberInvite.create({ data: { eventId: event2.id, volunteerId: v.id, ...linkToken.data(invite) } })
      await prisma.pushSubscription.create({ data: { volunteerId: v.id, endpoint: "https://push.example.org/sub", auth: "a", p256dh: "p" } })
      const key = calendarFeedKey("x".repeat(40))
      const feed = calendarFeedToken(reg.id, reg.editTokenHash, key)
      // The invitation page looks the link up by its hash (src/app/api/public/member-invite/[token]).
    expect(await prisma.memberInvite.findUnique({ where: linkToken.where(invite) })).not.toBeNull()

      const newEmail = `${tag}-right-${seq++}@example.org`
      expect((await edit(v.id, { email: newEmail })).status).toBe(200)

      const renewed = await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })
      expect(calendarFeedLinkValid(parseCalendarFeedToken(feed, key)!, renewed.editTokenHash, key)).toBe(false)
      expect(await prisma.memberInvite.findUnique({ where: linkToken.where(invite) })).toBeNull()
      expect(await prisma.pushSubscription.count({ where: { volunteerId: v.id } })).toBe(0)
      // A device can't be attached again with the old link.
      expect((await pushSubscribe(jsonRequest("POST", { editToken: personal, endpoint: "https://push.example.org/sub2", auth: "a", p256dh: "p" }))).status).toBe(404)

      // The unanswered invitation is sent again to the new address, with its new link.
      const pending = (await prisma.notificationOutbox.findMany({ where: { organizationId: state.orgId, status: "pending" } }))
        .map((r) => openPayload(r.payload)).filter((p) => p.volunteerId === v.id)
      const inviteEmail = pending.find((p) => p.kind === "member_invite")!
      expect(inviteEmail.recipient.email).toBe(newEmail)
      expect(hashToken(String(inviteEmail.data.token))).toBe((await prisma.memberInvite.findFirstOrThrow({ where: { volunteerId: v.id } })).tokenHash)
    })

    it("removing the address renews the links and sends nothing; adding one to a member without renews nothing", async () => {
      const { v, personal } = await member(`${tag}-typo-${seq++}@example.org`)
      const removed = await edit(v.id, { email: null })
      expect(removed.status).toBe(200)
      expect((await removed.json()).linksRenewed).toMatchObject({ emailsQueued: 0 })
      expect((await openPersonal(personal)).status).toBe(404)

      const without = await member(null)
      const added = await edit(without.v.id, { email: `${tag}-first-${seq++}@example.org` })
      expect((await added.json()).linksRenewed).toBeUndefined()
      expect((await openPersonal(without.personal)).status).toBe(200)
    })

    it("an edit that keeps the address (or only changes its case) renews nothing", async () => {
      const email = `${tag}-same-${seq++}@example.org`
      const { v, reg, personal } = await member(email)
      expect((await edit(v.id, { firstName: "Alexandra" })).status).toBe(200)
      expect((await edit(v.id, { email: email.toUpperCase() })).status).toBe(200)
      expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).editTokenHash).toBe(reg.editTokenHash)
      expect((await openPersonal(personal)).status).toBe(200)
    })

    it("an administrator's own email is not cancelled when the member record with the same address is corrected", async () => {
      const shared = `${tag}-shared-${seq++}@example.org`
      const { v } = await member(shared)
      const adminRow = await prisma.adminUser.create({ data: { name: "Alix", email: shared, role: "admin", organizationId: state.orgId, passwordHash: await bcrypt.hash(PASSWORD, 4) } })
      const reset = await enqueueNotifications([{
        kind: "password_reset", organizationId: state.orgId, recipient: { email: shared, name: "Alix" },
        data: { adminName: "Alix", resetUrl: "http://localhost:3999/admin/reset-password?token=shared-reset" },
      }])
      await prisma.adminUser.update({ where: { id: adminRow.id }, data: { passwordResetTokenHash: hashToken("shared-reset"), passwordResetExpiresAt: new Date(Date.now() + 3_600_000) } })
      expect((await edit(v.id, { email: `${tag}-member-only-${seq++}@example.org` })).status).toBe(200)
      expect(await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: reset[0] } })).toMatchObject({ status: "pending" })
      expect(await deliverOutbox({ ids: reset })).toMatchObject({ sent: 1 })
    })

    it("a form still showing the old address can't put it back without renewing the links", async () => {
      for (let round = 0; round < 3; round++) {
        const original = `${tag}-orig-${seq++}@example.org`
        const { v, personal } = await member(original)
        const corrected = `${tag}-corr-${seq++}@example.org`
        // Concurrently: a correction, and a stale form that sends the original address with another field.
        const results = await Promise.all([edit(v.id, { email: corrected }), edit(v.id, { email: original, firstName: "Alexandra" })])
        expect(results.map((r) => r.status)).toEqual([200, 200])
        // Whatever the order, the address changed at least once: the first links are dead.
        expect((await openPersonal(personal)).status).toBe(404)
      }
    })

    it("two corrections at the same time leave one consistent result: every old link dead, the last address holds the links", async () => {
      const { v, personal } = await member(`${tag}-typo-${seq++}@example.org`)
      const a = `${tag}-a-${seq++}@example.org`
      const b = `${tag}-b-${seq++}@example.org`
      const results = await Promise.all([edit(v.id, { email: a }), edit(v.id, { email: b })])
      expect(results.map((r) => r.status)).toEqual([200, 200])
      const final = await prisma.volunteer.findUniqueOrThrow({ where: { id: v.id } })
      expect([a, b]).toContain(final.email)
      expect((await openPersonal(personal)).status).toBe(404)
      // Whatever was queued for the address that lost is cancelled at delivery.
      const pending = await prisma.notificationOutbox.findMany({ where: { organizationId: state.orgId, status: "pending" } })
      const ids = pending.filter((r) => openPayload(r.payload).volunteerId === v.id).map((r) => r.id)
      state.sent = []
      await deliverOutbox({ ids })
      expect(state.sent.every((s) => s.recipient.email === final.email)).toBe(true)
      expect(state.sent.length).toBeGreaterThan(0)
    })
  })
})
