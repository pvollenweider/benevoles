// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Erasure of a member's personal data (#516) against a real Postgres: the unit tests cover the
 * pure plan (src/lib/__tests__/member-erasure.test.ts); this proves what only a database can —
 * that no value the person gave survives anywhere (every table is searched as text), that their
 * history is kept, that nobody else is touched (another member, the same person in another
 * organisation), idempotence, and the register replay after a simulated restore.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { runMemberErasure, MemberErasureConflictError } from "@/lib/member-erasure-transaction"
import { exportErasureRegister, replayErasureRegister } from "@/lib/member-erasure-replay"
import { parseRegisterLines } from "@/lib/member-erasure-register"
import { registrationToken } from "@/lib/token-vault"
import { sealPayload } from "@/lib/notifications/outbox"
import { addressHash } from "@/lib/notifications/smtp-outcome"
import { env } from "@/lib/env"
import { lockSignupVolunteer } from "@/lib/signup-volunteer"

const url = process.env.DATABASE_URL
const tag = `int-erase-${Date.now()}`
const ADMIN_ACTOR = { type: "admin" as const, id: "adm-test" }

/** Every row of every table of the database, as text, that contains `needle` (case-insensitive). */
async function rowsContaining(needle: string): Promise<{ table: string; row: string }[]> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  const found: { table: string; row: string }[] = []
  for (const { tablename } of tables) {
    const rows = await prisma.$queryRawUnsafe<{ row: string }[]>(
      `SELECT row_to_json(t)::text AS row FROM "${tablename}" t WHERE position(lower($1) in lower(row_to_json(t)::text)) > 0`,
      needle,
    )
    for (const r of rows) found.push({ table: tablename, row: r.row })
  }
  return found
}

describe.skipIf(!url)("member erasure transaction (#516)", () => {
  let orgId = ""
  let orgBId = ""
  let eventId = ""
  let pastShift = ""
  let futureShift = ""
  let questionId = ""

  // Values only the erased person gave: none of them may survive anywhere.
  const v = {
    firstName: `Zéphyrine${tag}`,
    lastName: `Quarteron${tag}`,
    email: `${tag}-zephyrine@example.org`,
    phone: `+41 79 ${Date.now() % 1_000_000}`,
    notes: `note-interne-${tag}`,
    tag: `tag-${tag}`,
    availabilityNote: `dispo-${tag}`,
    comment: `commentaire-${tag}`,
    regPhone: `+33 6 ${Date.now() % 1_000_000}`,
    answer: `reponse-${tag}`,
    endpoint: `https://push.example/${tag}`,
    leaderName: `Responsable ${tag}`,
  }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org erasure", slug: `${tag}-org` } })
    orgId = org.id
    const orgB = await prisma.organization.create({ data: { name: "Org erasure B", slug: `${tag}-org-b` } })
    orgBId = orgB.id
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2020-06-01"), endDate: new Date("2030-06-01") },
    })
    eventId = event.id
    pastShift = (await prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2020-06-01"), startTime: "10:00", endTime: "12:00", capacity: 5 } })).id
    futureShift = (await prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar soir", date: new Date("2030-06-01"), startTime: "18:00", endTime: "20:00", capacity: 5 } })).id
    questionId = (await prisma.eventQuestion.create({ data: { eventId, label: "Taille", type: "text" } })).id
  })

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("leaves no personal value of the person anywhere, keeps their history, and touches nobody else", async () => {
    const x = await prisma.volunteer.create({
      data: {
        organizationId: orgId, firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone, notes: v.notes,
        tags: [v.tag], birthDate: new Date("1990-01-02"), availabilityPeriods: ["morning"], availabilityNote: v.availabilityNote,
      },
    })
    const other = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Paul", lastName: `Autre-${tag}`, email: `${tag}-paul@example.org`, phone: "0790000000", notes: "garde" } })
    // The same person in another organisation: erasure is per organisation.
    const elsewhere = await prisma.volunteer.create({ data: { organizationId: orgBId, firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone } })
    // A record merged into X earlier (#600): already emptied, but it and the mapping must go.
    const tombstone = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "", lastName: "", active: false, mergedIntoId: x.id, mergedAt: new Date() } })

    const regPast = await prisma.registration.create({
      data: {
        eventId, shiftId: pastShift, volunteerId: x.id, status: "active", checkedInAt: new Date("2020-06-01T10:05:00Z"),
        comment: v.comment, phone: v.regPhone, charterAcceptedHash: "c".repeat(64), charterAcceptedAt: new Date("2020-05-01"),
        ...registrationToken.data(`${tag}-tok-past`),
      },
    })
    const regFuture = await prisma.registration.create({ data: { eventId, shiftId: futureShift, volunteerId: x.id, status: "active", comment: v.comment, ...registrationToken.data(`${tag}-tok-future`) } })
    const regOther = await prisma.registration.create({ data: { eventId, shiftId: futureShift, volunteerId: other.id, status: "active", comment: "le mien", ...registrationToken.data(`${tag}-tok-other`) } })
    const invite = await prisma.memberInvite.create({ data: { eventId, volunteerId: x.id, tokenHash: `${tag}-inv-hash`, declinedAt: new Date() } })
    await prisma.questionAnswer.create({ data: { questionId, eventId, volunteerId: x.id, values: [v.answer] } })
    const otherAnswer = await prisma.questionAnswer.create({ data: { questionId, eventId, volunteerId: other.id, values: ["M"] } })
    await prisma.pushSubscription.create({ data: { volunteerId: x.id, endpoint: v.endpoint, auth: "a", p256dh: "p" } })
    await prisma.sectorLeader.create({ data: { eventId, roleName: "Bar", name: v.leaderName, email: v.email.toUpperCase(), tokenHash: `${tag}-lead-hash` } })
    const otherLeader = await prisma.sectorLeader.create({ data: { eventId, roleName: "Bar", name: "Paul", email: `${tag}-paul@example.org`, tokenHash: `${tag}-lead-hash-2` } })
    await prisma.deliveryOutcome.create({ data: { organizationId: orgId, volunteerId: x.id, kind: "signup", outcome: "accepted_by_relay" } })
    await prisma.deliveryOutcome.create({ data: { organizationId: orgId, kind: "leader_link", outcome: "accepted_by_relay", addressHash: addressHash(v.email, env.AUTH_SECRET) } })
    await prisma.duplicateDismissal.create({ data: { organizationId: orgId, volunteerIdA: [x.id, other.id].sort()[0], volunteerIdB: [x.id, other.id].sort()[1], signalsFingerprint: "name" } })
    const message = await prisma.targetedMessage.create({ data: { organizationId: orgId, eventId, authorName: "Admin", subject: "Info", message: "Bonjour", audienceLabel: "Tous", recipientCount: 2 } })
    const outboxToX = await prisma.notificationOutbox.create({ data: { organizationId: orgId, status: "pending", payload: sealPayload({ kind: "reminder_j2", recipient: { email: v.email }, volunteerId: x.id, data: {} }) } })
    const outboxSentToX = await prisma.notificationOutbox.create({ data: { organizationId: orgId, status: "sent", targetedMessageId: message.id, payload: sealPayload({ kind: "targeted_message", recipient: { email: v.email }, volunteerId: x.id, data: {} }) } })
    const outboxNamingX = await prisma.notificationOutbox.create({ data: { organizationId: orgId, status: "pending", payload: sealPayload({ kind: "sector_leader_withdrawal", recipient: { email: "admin@example.org" }, data: { volunteerName: `${v.firstName} ${v.lastName}` } }) } })
    const outboxOther = await prisma.notificationOutbox.create({ data: { organizationId: orgId, status: "pending", payload: sealPayload({ kind: "reminder_j2", recipient: { email: `${tag}-paul@example.org` }, volunteerId: other.id, data: {} }) } })
    const outboxSameAddressOtherOrg = await prisma.notificationOutbox.create({ data: { organizationId: orgBId, status: "pending", payload: sealPayload({ kind: "reminder_j2", recipient: { email: v.email }, volunteerId: elsewhere.id, data: {} }) } })
    await prisma.eventLog.create({ data: { eventId, actorType: "volunteer", actorId: x.id, action: "registration.created", entityType: "Registration", entityId: regPast.id } })
    await prisma.orgLog.create({ data: { organizationId: orgId, actorType: "admin", actorId: "adm-test", action: "member.created", entityType: "Member", entityId: x.id } })

    const before = { tokenPast: (await prisma.registration.findUniqueOrThrow({ where: { id: regPast.id } })).editTokenHash }

    const result = await runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, x.id)
    expect(result.alreadyErased).toBe(false)
    expect(result.outboxDeleted).toBe(3)
    expect(result.counts).toMatchObject({ registrations: 2, upcomingLive: 1, invites: 1, answers: 1, pushSubscriptions: 1, sectorLeaders: 1, tombstones: 1 })

    // 1. No value the person gave survives, in any table — except in the other organisation's own
    // rows about the same person (record, queued email), which this erasure must not touch.
    for (const [field, value] of Object.entries(v)) {
      const hits = (await rowsContaining(value)).filter((h) => !h.row.includes(elsewhere.id) && !h.row.includes(orgBId))
      expect(hits, `"${field}" still found in: ${hits.map((h) => h.table).join(", ")}`).toEqual([])
    }

    // 2. The record: anonymised in place, inactive, marked.
    const erased = await prisma.volunteer.findUniqueOrThrow({ where: { id: x.id } })
    expect(erased).toMatchObject({ firstName: "Bénévole", lastName: "effacé", email: null, phone: null, notes: null, birthDate: null, tags: [], availabilityPeriods: [], availabilityNote: null, active: false })
    expect(erased.erasedAt).not.toBeNull()
    expect(await prisma.volunteer.findUnique({ where: { id: tombstone.id } })).toBeNull()

    // 3. History kept without identity: same rows, statuses, presence; personal link regenerated.
    const regs = await prisma.registration.findMany({ where: { volunteerId: x.id }, orderBy: { createdAt: "asc" } })
    expect(regs.map((r) => r.id).sort()).toEqual([regPast.id, regFuture.id].sort())
    const past = regs.find((r) => r.id === regPast.id)!
    expect(past).toMatchObject({ status: "active", comment: null, phone: null, charterAcceptedHash: "c".repeat(64) })
    expect(past.checkedInAt).toEqual(new Date("2020-06-01T10:05:00Z"))
    expect(past.editTokenHash).not.toBe(before.tokenPast)
    expect(await prisma.registration.findFirst({ where: registrationToken.where(`${tag}-tok-past`) })).toBeNull()
    expect(await prisma.memberInvite.findUnique({ where: { id: invite.id } })).toBeNull()
    expect(await prisma.eventLog.count({ where: { eventId, actorId: x.id } })).toBe(1)
    expect(await prisma.orgLog.count({ where: { organizationId: orgId, entityId: x.id, action: "member.created" } })).toBe(1)

    // 4. Outbox: the person's rows and the one naming them are gone; the sent one was counted first.
    const remainingOutbox = await prisma.notificationOutbox.findMany({ where: { id: { in: [outboxToX.id, outboxSentToX.id, outboxNamingX.id, outboxOther.id, outboxSameAddressOtherOrg.id] } }, select: { id: true } })
    expect(remainingOutbox.map((r) => r.id).sort()).toEqual([outboxOther.id, outboxSameAddressOtherOrg.id].sort())
    expect((await prisma.targetedMessage.findUniqueOrThrow({ where: { id: message.id } })).sentCount).toBe(1)

    // 5. Logged: an erasure happened, never who. Registered without personal data.
    const log = await prisma.orgLog.findFirstOrThrow({ where: { organizationId: orgId, action: "member.erased" } })
    expect(log).toMatchObject({ entityType: "Organization", entityId: orgId, actorId: "adm-test" })
    expect(log.changes).toBeNull()
    const record = await prisma.erasureRecord.findUniqueOrThrow({ where: { volunteerId: x.id } })
    expect(record.organizationId).toBe(orgId)
    expect(record.emailHash).toMatch(/^[0-9a-f]{64}$/)

    // 6. Nobody else touched.
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ firstName: "Paul", phone: "0790000000", notes: "garde", erasedAt: null })
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: elsewhere.id } })).toMatchObject({ firstName: v.firstName, email: v.email, phone: v.phone, erasedAt: null })
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: regOther.id } })).comment).toBe("le mien")
    expect(await prisma.questionAnswer.findUnique({ where: { id: otherAnswer.id } })).not.toBeNull()
    expect(await prisma.sectorLeader.findUnique({ where: { id: otherLeader.id } })).not.toBeNull()

    // 7. Idempotent: a second erasure writes nothing more.
    const again = await runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, x.id)
    expect(again.alreadyErased).toBe(true)
    expect(await prisma.orgLog.count({ where: { organizationId: orgId, action: "member.erased" } })).toBe(1)
  })

  it("refuses another organisation's record and a merge tombstone, writing nothing", async () => {
    const theirs = await prisma.volunteer.create({ data: { organizationId: orgBId, firstName: "Bob", lastName: `B-${tag}`, email: `${tag}-bob@example.org` } })
    await expect(runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, theirs.id)).rejects.toMatchObject({ status: 404 })
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ firstName: "Bob", erasedAt: null })

    const keep = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Keep", lastName: tag } })
    const tomb = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "", lastName: "", active: false, mergedIntoId: keep.id, mergedAt: new Date() } })
    await expect(runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, tomb.id)).rejects.toBeInstanceOf(MemberErasureConflictError)
    expect(await prisma.erasureRecord.findUnique({ where: { volunteerId: tomb.id } })).toBeNull()
  })

  it("two concurrent erasures of the same record: one erases, the other finds it already erased", async () => {
    const m = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Race", lastName: tag, email: `${tag}-race@example.org` } })
    const [a, b] = await Promise.all([
      runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, m.id),
      runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, m.id),
    ])
    expect([a.alreadyErased, b.alreadyErased].sort()).toEqual([false, true])
  })

  /** The sign-up transaction's own steps (src/app/api/public/registrations/route.ts): resolve and
   * lock the record found before the transaction, then attach the registration with its comment. */
  async function signUp(existingId: string, email: string, comment: string, shiftId: string) {
    return prisma.$transaction(async (tx) => {
      const r = await lockSignupVolunteer(tx, { existingId, organizationId: orgId, email, create: { firstName: "Revenue", lastName: tag } })
      await tx.registration.create({ data: { eventId, shiftId, volunteerId: r.volunteerId, status: "active", comment, ...registrationToken.data(`${tag}-tok-${comment}`) } })
      return r
    })
  }

  it("a sign-up that matched the record before an erasure committed lands on a new record, never on the erased one", async () => {
    const email = `${tag}-late@example.org`
    const m = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Tardive", lastName: tag, email } })
    // The sign-up looked the address up (found m), then the erasure committed, then its transaction ran.
    await runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, m.id)
    const r = await signUp(m.id, email, `late-${tag}`, pastShift)
    expect(r).toMatchObject({ matchErased: true, createdNow: true })
    expect(r.volunteerId).not.toBe(m.id)
    expect(await prisma.registration.count({ where: { volunteerId: m.id } })).toBe(0)
    expect((await rowsContaining(`late-${tag}`)).every((h) => h.row.includes(r.volunteerId))).toBe(true)
  })

  it("erasure and sign-up racing on the same record: the erased record never keeps anything the sign-up wrote", async () => {
    for (let i = 0; i < 5; i++) {
      const email = `${tag}-race-${i}@example.org`
      const m = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Course", lastName: `${tag}-${i}`, email } })
      const comment = `race-comment-${i}-${tag}`
      const [, signup] = await Promise.all([
        runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, m.id),
        signUp(m.id, email, comment, i % 2 ? pastShift : futureShift),
      ])
      // Either order: the erased record holds no trace of the submission.
      expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: m.id } })).erasedAt).not.toBeNull()
      const onErased = await prisma.registration.findMany({ where: { volunteerId: m.id }, select: { comment: true } })
      expect(onErased.every((r) => r.comment === null)).toBe(true)
      if (signup.matchErased) expect(signup.volunteerId).not.toBe(m.id)
    }
  })

  it("replays the register after a restore: the restored record is erased again, a later sign-up is left alone", async () => {
    const email = `${tag}-restore@example.org`
    const m = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Restaurée", lastName: tag, email, phone: "0791112233" } })
    await runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, m.id)

    // The register exported before the restore (the operator's first step).
    const exported = (await exportErasureRegister(prisma)).join("\n")
    const { lines } = parseRegisterLines(exported)
    expect(lines.some((l) => l.volunteerId === m.id)).toBe(true)
    expect(exported).not.toContain(email)

    // Simulate restoring a backup taken before the erasure: the personal data is back, the
    // register row is not.
    await prisma.volunteer.update({ where: { id: m.id }, data: { firstName: "Restaurée", lastName: tag, email, phone: "0791112233", active: true, erasedAt: null } })
    await prisma.erasureRecord.delete({ where: { volunteerId: m.id } })

    const mine = lines.filter((l) => l.organizationId === orgId)
    const dry = await replayErasureRegister(prisma, mine, { apply: false, secret: env.AUTH_SECRET })
    expect(dry.wouldErase).toBeGreaterThanOrEqual(1)
    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: m.id } })).email).toBe(email) // dry run: untouched

    const applied = await replayErasureRegister(prisma, mine, { apply: true, secret: env.AUTH_SECRET })
    expect(applied.erased).toBe(dry.wouldErase)
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ firstName: "Bénévole", email: null, phone: null })
    expect(await prisma.erasureRecord.findUnique({ where: { volunteerId: m.id } })).not.toBeNull()

    // The person signs up again afterwards with the same address: a new record, never erased by a
    // later replay (created after the erasure).
    const fresh = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Revenue", lastName: tag, email } })
    const replayAgain = await replayErasureRegister(prisma, mine, { apply: true, secret: env.AUTH_SECRET })
    expect(replayAgain.erased).toBe(0)
    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: fresh.id } })).email).toBe(email)
  })
})
