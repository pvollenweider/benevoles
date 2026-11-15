import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"

/**
 * Admin settings of the per-event reminder rules (#1139, PR 2) against a real Postgres: saving
 * creates/removes rules, reconciles unsent occurrences and cancels their queued outbox rows, and
 * the preview is exactly what the next cron run queues. The pure parts are in
 * `src/lib/__tests__/reminder-rules.test.ts`; this file proves only what a database can prove.
 */

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/push", () => ({ sendPushToVolunteer: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))

import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { loadEventReminderRulesState, saveEventReminderRules } from "@/lib/reminder-rules-data"
import { queueCustomRuleReminders } from "@/lib/reminder-rules-server"
import { deliverOutbox } from "@/lib/notifications/outbox"

const url = process.env.DATABASE_URL
const tag = `int-reminder-settings-${Date.now()}`

describe.skipIf(!url)("custom reminder rules settings on Postgres (#1139)", () => {
  let orgId = ""
  let eventId = ""
  let shiftId = ""
  let foreignEventId = ""
  let foreignRuleId = ""
  const volunteerIds: string[] = []
  const registrationIds: string[] = []

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org réglages rappels", slug: `${tag}-org`, timeZone: "Europe/Zurich" } })
    orgId = org.id
    // 10:00 local (08:00Z in winter, 09:00Z in summer) on 2030-06-10, and a second day for DST.
    const event = await prisma.event.create({
      data: {
        organizationId: orgId,
        slug: "fete",
        title: "Fête",
        startDate: new Date("2030-06-10T00:00:00Z"),
        endDate: new Date("2030-06-11T00:00:00Z"),
        publicStatus: "published",
        remindersEnabled: true,
      },
    })
    eventId = event.id
    const shift = await prisma.shift.create({
      data: {
        eventId,
        roleName: "Bar",
        label: "Bar",
        date: new Date("2030-06-10T00:00:00Z"),
        startTime: "10:00",
        endTime: "18:00",
        capacity: 5,
        status: "open",
      },
    })
    shiftId = shift.id
    const foreignEvent = await prisma.event.create({
      data: {
        organizationId: orgId,
        slug: "autre",
        title: "Autre",
        startDate: new Date("2030-06-10T00:00:00Z"),
        endDate: new Date("2030-06-10T00:00:00Z"),
        publicStatus: "draft",
      },
    })
    foreignEventId = foreignEvent.id
    foreignRuleId = (await prisma.eventReminderRule.create({
      data: { eventId: foreignEventId, unit: "days", value: 3, enabled: true, displayOrder: 0 },
    })).id
    for (const [index, firstName] of ["Alice", "Bob"].entries()) {
      const volunteer = await prisma.volunteer.create({
        data: { organizationId: orgId, firstName, lastName: "Martin", email: `${tag}-${index}@example.com` },
      })
      volunteerIds.push(volunteer.id)
      const registration = await prisma.registration.create({
        data: {
          eventId,
          shiftId,
          volunteerId: volunteer.id,
          status: "active",
          createdAt: new Date("2030-01-01T00:00:00Z"),
          ...registrationToken.data(`${tag}-reg-${index}`),
        },
      })
      registrationIds.push(registration.id)
    }
  })

  afterAll(async () => {
    // The outbox has no foreign key to the organisation: delete it before the organisation, or a
    // later test's nightly cleanup would count rows of an organisation that no longer exists.
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  afterEach(async () => {
    // Run even when an assertion failed: a failed test must not leave rows for the next file or
    // the next run of the integration suite.
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.reminderOccurrence.deleteMany({ where: { eventId } })
    await prisma.eventReminderRule.deleteMany({ where: { eventId } })
  })

  beforeEach(async () => {
    await prisma.reminderOccurrence.deleteMany({ where: { eventId } })
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.eventReminderRule.deleteMany({ where: { eventId } })
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "10:00", status: "open", date: new Date("2030-06-10T00:00:00Z") } })
    await prisma.event.update({ where: { id: eventId }, data: { publicStatus: "published", remindersEnabled: true } })
    for (const id of registrationIds) {
      await prisma.registration.update({ where: { id }, data: { status: "active", reminderJ2Sent: null, reminderJ1Sent: null, reminderDdSent: null } })
    }
  })

  const rule = (over: { unit?: "hours" | "days"; value?: number; enabled?: boolean } = {}) => ({
    unit: over.unit ?? "days",
    value: over.value ?? 7,
    enabled: over.enabled ?? true,
  })
  const stateAt = (now: Date) => loadEventReminderRulesState(prisma, orgId, eventId, now)
  const customOccurrences = () => prisma.reminderOccurrence.findMany({ where: { eventId }, orderBy: { volunteerId: "asc" } })
  const customOutbox = () => prisma.notificationOutbox.findMany({ where: { organizationId: orgId, dedupeKey: { startsWith: "reminder-rule:" } }, orderBy: { createdAt: "asc" } })

  it("refuses an id that belongs to another event, without touching any rule", async () => {
    const saved = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: foreignRuleId, unit: "days", value: 7, enabled: true }],
    }, new Date("2030-06-03T08:00:00Z"))
    expect(saved).toMatchObject({ ok: false, status: 400, rule: 1 })
    expect(await prisma.eventReminderRule.count({ where: { eventId } })).toBe(0)
    expect(await prisma.eventReminderRule.findUnique({ where: { id: foreignRuleId } })).not.toBeNull()
  })

  it("saves rules and the cron queues by them", async () => {
    const now = new Date("2030-06-03T08:00:00Z") // 7 days before the 10:00 Zurich shift (08:00Z in June)
    const saved = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    expect(saved).toMatchObject({ ok: true, state: { mode: "custom", rules: [{ unit: "days", value: 7, enabled: true }] } })
    if (!saved.ok) throw new Error("save failed")

    const run = await queueCustomRuleReminders(now)
    expect(run.queued).toBeGreaterThanOrEqual(2)
    const occurrences = await customOccurrences()
    expect(occurrences).toHaveLength(2)
    expect(occurrences.every((occurrence) => occurrence.status === "queued")).toBe(true)
    expect(occurrences.every((occurrence) => occurrence.dueAt.toISOString() === "2030-06-03T08:00:00.000Z")).toBe(true)
    expect(await customOutbox()).toHaveLength(2)
  })

  it("moves an unsent occurrence to the new delay and never reopens a sent one", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    if (!first.ok) throw new Error("save failed")
    const ruleId = first.state.rules[0].id
    await queueCustomRuleReminders(now)
    const before = await customOccurrences()
    expect(before).toHaveLength(2)

    // One reminder was sent in the meantime: a later delay change must leave it alone.
    await prisma.reminderOccurrence.update({ where: { id: before[0].id }, data: { status: "sent", sentAt: now } })
    if (before[0].outboxId) {
      await prisma.notificationOutbox.update({ where: { id: before[0].outboxId }, data: { status: "sent", sentAt: now } })
    }
    const saved = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: ruleId, unit: "hours", value: 2, enabled: true }],
    }, now)
    expect(saved).toMatchObject({ ok: true })
    const after = await customOccurrences()
    const sent = after.find((occurrence) => occurrence.id === before[0].id)
    expect(sent).toMatchObject({ status: "sent", dueAt: before[0].dueAt })
    const moved = after.find((occurrence) => occurrence.id === before[1].id)
    expect(moved?.status).toBe("queued")
    expect(moved?.dueAt.toISOString()).toBe("2030-06-10T06:00:00.000Z") // 10:00 local summer = 08:00Z, minus 2 h
  })

  it("cancels a removed rule's queued outbox row instead of sending it", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [rule({ value: 7 }), rule({ unit: "hours", value: 12 })],
    }, now)
    if (!first.ok) throw new Error("save failed")
    const removedId = first.state.rules[0].id
    const keptId = first.state.rules[1].id
    await queueCustomRuleReminders(now)
    const queued = await customOccurrences()
    expect(queued).toHaveLength(2)
    const removedOutboxId = queued.find((occurrence) => occurrence.ruleId === removedId)?.outboxId
    expect(removedOutboxId).toBeTruthy()

    const saved = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: keptId, unit: "hours", value: 12, enabled: true }],
    }, now)
    expect(saved).toMatchObject({ ok: true })
    expect(await prisma.eventReminderRule.findUnique({ where: { id: removedId } })).toBeNull()
    // The occurrence of the removed rule cascades away; its outbox row is cancelled, not pending.
    expect((await customOccurrences()).some((occurrence) => occurrence.ruleId === removedId)).toBe(false)
    expect((await prisma.notificationOutbox.findUnique({ where: { id: removedOutboxId! } }))?.status).toBe("cancelled")
  })

  it("switching to default cancels the queued rows and stops the custom path", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    expect(first).toMatchObject({ ok: true })
    await queueCustomRuleReminders(now)
    const defaulted = await saveEventReminderRules(prisma, orgId, eventId, { mode: "default" }, now)
    expect(defaulted).toMatchObject({ ok: true, state: { mode: "default", rules: [] } })
    expect(await prisma.eventReminderRule.count({ where: { eventId } })).toBe(0)
    expect(await customOccurrences()).toHaveLength(0)
    // The two queued emails are cancelled, not deleted: they keep their dedupe key as history.
    const rows = await customOutbox()
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.status === "cancelled")).toBe(true)
    await queueCustomRuleReminders(now)
    expect(await customOccurrences()).toHaveLength(0)
    expect((await customOutbox()).every((row) => row.status === "cancelled")).toBe(true)
    // A cancelled row can never leave, even when the outbox is delivered.
    const delivered = await deliverOutbox({ now, ids: rows.map((row) => row.id) })
    expect(delivered.sent).toBe(0)
  })

  async function markSent(ruleId: string, at: Date) {
    const occurrences = await prisma.reminderOccurrence.findMany({ where: { eventId, ruleId } })
    for (const occurrence of occurrences) {
      await prisma.reminderOccurrence.update({ where: { id: occurrence.id }, data: { status: "sent", sentAt: at } })
      if (occurrence.outboxId) {
        await prisma.notificationOutbox.update({ where: { id: occurrence.outboxId }, data: { status: "sent", sentAt: at } })
      }
    }
    return occurrences
  }

  it("removing a rule then recreating the same delay keeps its sent history", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [rule({ value: 7 }), rule({ unit: "hours", value: 12 })],
    }, now)
    if (!first.ok) throw new Error("save failed")
    const sevenId = first.state.rules[0].id
    const twelveId = first.state.rules[1].id
    await queueCustomRuleReminders(now)
    expect(await markSent(sevenId, now)).toHaveLength(2)

    const removed = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: twelveId, unit: "hours", value: 12, enabled: true }],
    }, now)
    expect(removed).toMatchObject({ ok: true })
    const archived = await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } })
    expect(archived).toMatchObject({ enabled: false })
    expect(archived.archivedAt).not.toBeNull()
    // The sent history stays, and the archived row is invisible in GET.
    expect(await prisma.reminderOccurrence.count({ where: { eventId, ruleId: sevenId, status: "sent" } })).toBe(2)
    expect((await stateAt(now))?.rules.map((r) => r.id)).toEqual([twelveId])

    const recreated = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [
        { id: twelveId, unit: "hours", value: 12, enabled: true },
        { unit: "days", value: 7, enabled: true },
      ],
    }, now)
    expect(recreated).toMatchObject({ ok: true })
    if (!recreated.ok) throw new Error("save failed")
    const revived = recreated.state.rules.find((r) => r.unit === "days")
    expect(revived?.id).toBe(sevenId)
    expect((await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } })).archivedAt).toBeNull()
    expect((await queueCustomRuleReminders(now)).queued).toBe(0)
  })

  it("matches a new rule to an active rule removed in the same save", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [rule({ value: 7 }), rule({ unit: "hours", value: 12 })],
    }, now)
    if (!first.ok) throw new Error("save failed")
    const sevenId = first.state.rules[0].id
    const twelveId = first.state.rules[1].id
    await queueCustomRuleReminders(now)
    expect(await markSent(sevenId, now)).toHaveLength(2)

    // The screen sends the kept 12 h rule, removes the 7 d one and adds a new 7 d one without id.
    const saved = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [
        { id: twelveId, unit: "hours", value: 12, enabled: true },
        { unit: "days", value: 7, enabled: true },
      ],
    }, now)
    if (!saved.ok) throw new Error("save failed")
    expect(saved.state.rules.find((r) => r.unit === "days")?.id).toBe(sevenId)
    const row = await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } })
    expect(row.archivedAt).toBeNull()
    expect((await queueCustomRuleReminders(now)).queued).toBe(0)
  })

  it("switching to default then back to the same custom delay keeps its sent history", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    if (!first.ok) throw new Error("save failed")
    const sevenId = first.state.rules[0].id
    await queueCustomRuleReminders(now)
    expect(await markSent(sevenId, now)).toHaveLength(2)

    const defaulted = await saveEventReminderRules(prisma, orgId, eventId, { mode: "default" }, now)
    expect(defaulted).toMatchObject({ ok: true, state: { mode: "default", rules: [] } })
    expect((await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } })).archivedAt).not.toBeNull()
    expect((await stateAt(now))?.rules).toEqual([])

    const custom = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    expect(custom).toMatchObject({ ok: true, state: { mode: "custom" } })
    if (!custom.ok) throw new Error("save failed")
    expect(custom.state.rules[0].id).toBe(sevenId)
    expect((await queueCustomRuleReminders(now)).queued).toBe(0)
  })

  it("previews an unpublished event as blocked, as the cron refuses it", async () => {
    const state = await loadEventReminderRulesState(prisma, orgId, foreignEventId, new Date("2030-06-03T08:00:00Z"))
    expect(state).toMatchObject({
      mode: "custom",
      preview: { state: "blocked", reason: "event-unpublished" },
    })
  })

  it("previews a reminder for a registration next month, beyond the cron's work horizon", async () => {
    await prisma.shift.update({ where: { id: shiftId }, data: { date: new Date("2030-07-10T00:00:00Z"), startTime: "10:00" } })
    const now = new Date("2030-06-03T08:00:00Z")
    const saved = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ unit: "hours", value: 2 })] }, now)
    if (!saved.ok) throw new Error("save failed")

    expect((await stateAt(now))?.preview).toMatchObject({
      state: "scheduled", dueAt: "2030-07-10T06:00:00.000Z", recipientCount: 2, shiftCount: 2,
    })
    const run = await queueCustomRuleReminders(new Date("2030-07-10T06:00:00Z"))
    expect(run.queued).toBeGreaterThanOrEqual(2)
  })

  it("two concurrent saves leave exactly one consistent set", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const a = { mode: "custom" as const, rules: [rule({ value: 7 })] }
    const b = { mode: "custom" as const, rules: [rule({ unit: "hours" as const, value: 12 }), rule({ value: 2 })] }
    await Promise.all([
      saveEventReminderRules(prisma, orgId, eventId, a, now),
      saveEventReminderRules(prisma, orgId, eventId, b, now),
    ])
    const rows = await prisma.eventReminderRule.findMany({ where: { eventId }, orderBy: { displayOrder: "asc" } })
    const got = rows.map((row) => `${row.unit}:${row.value}`).join(",")
    const expected = [a, b].map((input) => input.rules.map((r) => `${r.unit}:${r.value}`).join(","))
    expect(expected).toContain(got)
    expect(rows.length === 1 || rows.length === 2).toBe(true)
    expect(new Set(rows.map((row) => row.displayOrder)).size).toBe(rows.length)
  })

  it("previews exactly what the next cron run queues, across a DST change and with a sent occurrence", async () => {
    // 2031-03-30 is the spring-forward day in Europe/Zurich: 10:00 local is 08:00Z, and one day
    // before is 24 elapsed hours (not the same wall-clock hour).
    await prisma.shift.update({ where: { id: shiftId }, data: { date: new Date("2031-03-30T00:00:00Z"), startTime: "10:00" } })
    const now = new Date("2031-03-29T08:00:00Z")
    const saved = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ unit: "days", value: 1 })] }, now)
    if (!saved.ok) throw new Error("save failed")
    const ruleId = saved.state.rules[0].id

    // One volunteer's reminder for that day was already sent: the preview and the run must both
    // count only the remaining one.
    await prisma.reminderOccurrence.create({
      data: {
        eventId, volunteerId: volunteerIds[0], localDay: "2031-03-30", ruleId,
        dueAt: new Date("2031-03-29T08:00:00Z"), status: "sent", sentAt: now,
      },
    })

    const state = await stateAt(now)
    expect(state?.preview).toMatchObject({
      state: "queued", ruleId, dueAt: "2031-03-29T08:00:00.000Z", localDay: "2031-03-30",
      recipientCount: 1, shiftCount: 1,
    })
    await queueCustomRuleReminders(now)
    const queued = await prisma.reminderOccurrence.findMany({ where: { eventId, status: "queued" } })
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ ruleId, volunteerId: volunteerIds[1] })
    expect(queued[0].dueAt.toISOString()).toBe("2031-03-29T08:00:00.000Z")
  })
})
