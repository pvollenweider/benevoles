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
import { completeCustomReminderDelivery, deliverOutbox } from "@/lib/notifications/outbox"

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

  /** A dedicated published event, one volunteer, and one registration per shift on `date`. */
  async function createLocalDayScenario(
    label: string,
    date: string,
    shifts: { startTime: string; endTime: string }[],
  ): Promise<{ eventId: string; volunteerId: string }> {
    const event = await prisma.event.create({
      data: {
        organizationId: orgId, slug: `${tag}-${label}`, title: label,
        startDate: new Date(`${date}T00:00:00Z`), endDate: new Date(`${date}T00:00:00Z`),
        publicStatus: "published", remindersEnabled: true,
      },
    })
    const volunteer = await prisma.volunteer.create({
      data: { organizationId: orgId, firstName: label, lastName: "Martin", email: `${tag}-${label}@example.com` },
    })
    for (const [index, shift] of shifts.entries()) {
      const created = await prisma.shift.create({
        data: {
          eventId: event.id, roleName: "Bar", label: `Bar ${index}`, date: new Date(`${date}T00:00:00Z`),
          startTime: shift.startTime, endTime: shift.endTime, capacity: 5, status: "open",
        },
      })
      await prisma.registration.create({
        data: {
          eventId: event.id, shiftId: created.id, volunteerId: volunteer.id, status: "active",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          ...registrationToken.data(`${tag}-${label}-${index}`),
        },
      })
    }
    return { eventId: event.id, volunteerId: volunteer.id }
  }

  async function deleteLocalDayScenario(scenario: { eventId: string; volunteerId: string }): Promise<void> {
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.event.deleteMany({ where: { id: scenario.eventId } })
    await prisma.volunteer.deleteMany({ where: { id: scenario.volunteerId } })
  }

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

  it("new delays whose time already passed send nothing, however often they change", async () => {
    // The shift is on 10 June 08:00Z and the places date from January. The evening before, three
    // rounds of three new delays (336 down to 328 hours) all have due instants in late May.
    const now = new Date("2030-06-09T18:00:00Z")
    for (const base of [336, 333, 330]) {
      const saved = await saveEventReminderRules(prisma, orgId, eventId, {
        mode: "custom",
        rules: [0, 1, 2].map((offset) => rule({ unit: "hours", value: base - offset })),
      }, now)
      expect(saved).toMatchObject({ ok: true, state: { preview: { state: "blocked", reason: "no-upcoming-reminder" } } })
      const run = await queueCustomRuleReminders(now)
      expect(run.queued).toBe(0)
    }
    expect(await customOccurrences()).toHaveLength(0)
    expect(await customOutbox()).toHaveLength(0)
  })

  it("a delay set up before its time sends once to each volunteer", async () => {
    const setUp = new Date("2030-05-20T08:00:00Z")
    const saved = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ unit: "hours", value: 336 })] }, setUp)
    expect(saved).toMatchObject({ ok: true, state: { preview: { state: "scheduled", dueAt: "2030-05-27T08:00:00.000Z", recipientCount: 2 } } })
    const due = new Date("2030-05-27T08:30:00Z")
    expect((await queueCustomRuleReminders(due)).queued).toBe(2)
    expect((await queueCustomRuleReminders(new Date("2030-05-27T09:30:00Z"))).queued).toBe(0)
    expect(await customOutbox()).toHaveLength(2)
  })

  it("a rule re-enabled after its time sends nothing", async () => {
    const first = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ unit: "hours", value: 336 })] }, new Date("2030-05-20T08:00:00Z"))
    if (!first.ok) throw new Error("save failed")
    const id = first.state.rules[0].id
    await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [{ id, unit: "hours", value: 336, enabled: false }] }, new Date("2030-05-21T08:00:00Z"))
    const now = new Date("2030-06-09T18:00:00Z")
    const reEnabled = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [{ id, unit: "hours", value: 336, enabled: true }] }, now)
    expect(reEnabled).toMatchObject({ ok: true, state: { rules: [{ id, enabled: true }], preview: { state: "blocked", reason: "no-upcoming-reminder" } } })
    expect((await queueCustomRuleReminders(now)).queued).toBe(0)
    expect(await customOutbox()).toHaveLength(0)
  })

  it("saving an unchanged rule after its time keeps its reminder", async () => {
    // A rule set up in time, then saved again (reordering, no change) after its due instant but
    // before the hourly run: the reminder is still owed.
    const first = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ unit: "hours", value: 336 })] }, new Date("2030-05-20T08:00:00Z"))
    if (!first.ok) throw new Error("save failed")
    const id = first.state.rules[0].id
    const now = new Date("2030-05-27T08:30:00Z")
    expect(await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [{ id, unit: "days", value: 14, enabled: true }] }, now))
      .toMatchObject({ ok: true })
    expect((await queueCustomRuleReminders(now)).queued).toBe(2)
  })

  it("editing a kept rule to the delay of an archived one does not re-send that delay", async () => {
    // Rule A (7 days) already reminded both volunteers, then rule B (2 hours) is the only one kept
    // and is edited to 7 days. B's id must not stop the resolution: the archived 7-day row is
    // revived, and its sent occurrences still protect the people who already received it.
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [rule({ value: 7 }), rule({ unit: "hours", value: 2 })],
    }, now)
    if (!first.ok) throw new Error("save failed")
    const sevenId = first.state.rules[0].id
    const twoId = first.state.rules[1].id
    await queueCustomRuleReminders(now)
    expect(await markSent(sevenId, now)).toHaveLength(2)

    const removed = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: twoId, unit: "hours", value: 2, enabled: true }],
    }, now)
    expect(removed).toMatchObject({ ok: true })
    expect((await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } })).archivedAt).not.toBeNull()

    const edited = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: twoId, unit: "days", value: 7, enabled: true }],
    }, now)
    expect(edited).toMatchObject({ ok: true })
    if (!edited.ok) throw new Error("save failed")
    // The submitted id was B's; the resolved row is the archived 7-day one.
    expect(edited.state.rules.map((r) => r.id)).toEqual([sevenId])
    expect(await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } }))
      .toMatchObject({ unit: "days", value: 7, archivedAt: null })
    // B had no sent occurrence: it is removed, not archived, once its delay is gone.
    expect(await prisma.eventReminderRule.findUnique({ where: { id: twoId } })).toBeNull()
    expect((await queueCustomRuleReminders(now)).queued).toBe(0)
    expect(await customOutbox()).toHaveLength(2)
  })

  it("changing 7 days to 6 days after a send creates a new row and archives the old", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ value: 7 })] }, now)
    if (!first.ok) throw new Error("save failed")
    const sevenId = first.state.rules[0].id
    await queueCustomRuleReminders(now)
    expect(await markSent(sevenId, now)).toHaveLength(2)

    const edited = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: sevenId, unit: "days", value: 6, enabled: true }],
    }, now)
    if (!edited.ok) throw new Error("save failed")
    const sixId = edited.state.rules[0].id
    expect(sixId).not.toBe(sevenId)
    expect(await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } }))
      .toMatchObject({ unit: "days", value: 7, archivedAt: expect.any(Date) })
    expect(await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sixId } }))
      .toMatchObject({ unit: "days", value: 6, archivedAt: null })
    expect(await prisma.reminderOccurrence.count({ where: { eventId, ruleId: sevenId, status: "sent" } })).toBe(2)

    // The new delay is due on 4 June 08:00Z; the people who got the 7-day reminder get this one.
    const run = await queueCustomRuleReminders(new Date("2030-06-04T08:00:00Z"))
    expect(run.queued).toBeGreaterThanOrEqual(2)
    expect(await prisma.reminderOccurrence.count({ where: { eventId, ruleId: sixId } })).toBe(2)
  })

  it("changing 7 days to 168 hours keeps the row and its sent history", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const first = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ value: 7 })] }, now)
    if (!first.ok) throw new Error("save failed")
    const sevenId = first.state.rules[0].id
    await queueCustomRuleReminders(now)
    expect(await markSent(sevenId, now)).toHaveLength(2)

    const edited = await saveEventReminderRules(prisma, orgId, eventId, {
      mode: "custom",
      rules: [{ id: sevenId, unit: "hours", value: 168, enabled: true }],
    }, now)
    if (!edited.ok) throw new Error("save failed")
    expect(edited.state.rules.map((r) => r.id)).toEqual([sevenId])
    expect(await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: sevenId } }))
      .toMatchObject({ unit: "hours", value: 168, archivedAt: null })
    expect(await prisma.reminderOccurrence.count({ where: { eventId, ruleId: sevenId, status: "sent" } })).toBe(2)
    expect((await queueCustomRuleReminders(now)).queued).toBe(0)
  })

  it("never keeps two rows for one delay after ten edits", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const edits: { unit: "hours" | "days"; value: number; enabled: boolean }[][] = [
      [{ unit: "days", value: 7, enabled: true }],
      [{ unit: "hours", value: 168, enabled: true }],
      [{ unit: "days", value: 7, enabled: true }, { unit: "hours", value: 48, enabled: true }],
      [{ unit: "hours", value: 72, enabled: true }],
      [{ unit: "days", value: 3, enabled: true }, { unit: "days", value: 7, enabled: true }],
      [{ unit: "days", value: 2, enabled: true }, { unit: "hours", value: 72, enabled: true }, { unit: "days", value: 14, enabled: true }],
      [{ unit: "hours", value: 48, enabled: true }],
      [{ unit: "days", value: 7, enabled: true }, { unit: "days", value: 2, enabled: true }],
      [{ unit: "hours", value: 336, enabled: true }],
      [{ unit: "days", value: 14, enabled: true }, { unit: "hours", value: 168, enabled: true }, { unit: "days", value: 3, enabled: true }],
    ]
    for (const rules of edits) {
      expect(await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules }, now)).toMatchObject({ ok: true })
      const rows = await prisma.eventReminderRule.findMany({ where: { eventId } })
      const perHours = new Map<number, number>()
      for (const row of rows) {
        const hours = row.unit === "days" ? row.value * 24 : row.value
        perHours.set(hours, (perHours.get(hours) ?? 0) + 1)
      }
      expect([...perHours.values()].every((count) => count === 1)).toBe(true)
    }
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

  it("finds a later day whose earlier delay is due beyond 2 000 nearer registrations", async () => {
    // The counter-example of #1139: the nearest 2 000 registrations are on 10 June and already got
    // their 7-day reminder (their next one is 2 h before the shift). The 2 001st is on 11 June,
    // whose 7-day reminder is due on 4 June. A cap on the nearest registrations hid that earlier
    // send; the preview must now find it.
    const now = new Date("2030-06-04T07:00:00Z")
    const bigEvent = await prisma.event.create({
      data: {
        organizationId: orgId, slug: "grand", title: "Grand",
        startDate: new Date("2030-06-10T00:00:00Z"), endDate: new Date("2030-06-11T00:00:00Z"),
        publicStatus: "published", remindersEnabled: true,
      },
    })
    const createdVolunteers: string[] = []
    try {
      const nearShift = await prisma.shift.create({
        data: { eventId: bigEvent.id, roleName: "Bar", label: "Bar", date: new Date("2030-06-10T00:00:00Z"), startTime: "10:00", endTime: "18:00", capacity: 2_500, status: "open" },
      })
      const farShift = await prisma.shift.create({
        data: { eventId: bigEvent.id, roleName: "Bar", label: "Bar", date: new Date("2030-06-11T00:00:00Z"), startTime: "10:00", endTime: "18:00", capacity: 5, status: "open" },
      })
      const nearEmails = Array.from({ length: 2_000 }, (_, index) => `${tag}-grand-near-${index}@example.com`)
      await prisma.volunteer.createMany({
        data: nearEmails.map((email, index) => ({ organizationId: orgId, firstName: `Near${index}`, lastName: "Martin", email })),
      })
      const nearVolunteers = await prisma.volunteer.findMany({
        where: { organizationId: orgId, email: { in: nearEmails } },
        select: { id: true },
      })
      const farVolunteer = await prisma.volunteer.create({
        data: { organizationId: orgId, firstName: "Far", lastName: "Martin", email: `${tag}-grand-far@example.com` },
      })
      createdVolunteers.push(...nearVolunteers.map((volunteer) => volunteer.id), farVolunteer.id)
      await prisma.registration.createMany({
        data: [
          ...nearVolunteers.map((volunteer, index) => ({
            eventId: bigEvent.id, shiftId: nearShift.id, volunteerId: volunteer.id, status: "active",
            createdAt: new Date("2030-01-01T00:00:00Z"), editTokenHash: `${tag}-grand-near-${index}`,
          })),
          {
            eventId: bigEvent.id, shiftId: farShift.id, volunteerId: farVolunteer.id, status: "active",
            createdAt: new Date("2030-01-01T00:00:00Z"), editTokenHash: `${tag}-grand-far`,
          },
        ],
      })

      const saved = await saveEventReminderRules(prisma, orgId, bigEvent.id, {
        mode: "custom",
        rules: [rule({ value: 7 }), rule({ unit: "hours", value: 2 })],
      }, now)
      if (!saved.ok) throw new Error("save failed")
      const sevenId = saved.state.rules[0].id
      await prisma.reminderOccurrence.createMany({
        data: nearVolunteers.map((volunteer) => ({
          eventId: bigEvent.id, volunteerId: volunteer.id, localDay: "2030-06-10", ruleId: sevenId,
          dueAt: new Date("2030-06-03T08:00:00Z"), status: "sent", sentAt: now,
        })),
      })

      expect((await loadEventReminderRulesState(prisma, orgId, bigEvent.id, now))?.preview).toMatchObject({
        state: "scheduled",
        ruleId: sevenId,
        dueAt: "2030-06-04T08:00:00.000Z",
        localDay: "2030-06-11",
        recipientCount: 1,
        shiftCount: 1,
      })
    } finally {
      await prisma.event.deleteMany({ where: { id: bigEvent.id } })
      if (createdVolunteers.length > 0) {
        await prisma.volunteer.deleteMany({ where: { id: { in: createdVolunteers } } })
      }
    }
  })

  it("previews a queued occurrence for a day outside every horizon", async () => {
    await prisma.shift.update({ where: { id: shiftId }, data: { date: new Date("2030-09-10T00:00:00Z"), startTime: "10:00" } })
    const now = new Date("2030-06-03T08:00:00Z")
    const saved = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule({ unit: "hours", value: 2 })] }, now)
    if (!saved.ok) throw new Error("save failed")
    const ruleId = saved.state.rules[0].id
    await prisma.reminderOccurrence.createMany({
      data: volunteerIds.map((volunteerId) => ({
        eventId, volunteerId, localDay: "2030-09-10", ruleId,
        dueAt: new Date("2030-09-10T06:00:00Z"), status: "queued",
      })),
    })

    expect((await stateAt(now))?.preview).toMatchObject({
      state: "queued", ruleId, dueAt: "2030-09-10T06:00:00.000Z", localDay: "2030-09-10",
      recipientCount: 2, shiftCount: 2,
    })
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

  it("previews a shift still ahead through the fall-back DST hour", async () => {
    // Europe/Zurich, 2026-10-25: at 00:30Z the local clock reads 02:30 (still summer time), but a
    // stored 02:15 resolves through the real converter to 01:15Z (the repeated hour's second
    // occurrence), still ahead. A wall-clock SQL comparison would drop it.
    const scenario = await createLocalDayScenario("dst-automne", "2026-10-25", [{ startTime: "02:15", endTime: "04:15" }])
    try {
      const now = new Date("2026-10-25T00:30:00Z")
      const saved = await saveEventReminderRules(prisma, orgId, scenario.eventId, {
        mode: "custom", rules: [rule({ unit: "hours", value: 2 })],
      }, now)
      expect(saved).toMatchObject({ ok: true })
      expect((await loadEventReminderRulesState(prisma, orgId, scenario.eventId, now))?.preview).toMatchObject({
        state: "queued",
        dueAt: "2026-10-24T23:15:00.000Z",
        localDay: "2026-10-25",
        recipientCount: 1,
        shiftCount: 1,
      })
    } finally {
      await deleteLocalDayScenario(scenario)
    }
  })

  it("previews a shift still ahead through the spring-forward DST hour", async () => {
    // Europe/Zurich, 2026-03-29: at 01:00Z the local clock already reads 03:00 (summer time), but a
    // stored 02:30 (a non-existent wall time) resolves to 01:30Z, still ahead.
    const scenario = await createLocalDayScenario("dst-printemps", "2026-03-29", [{ startTime: "02:30", endTime: "04:30" }])
    try {
      const now = new Date("2026-03-29T01:00:00Z")
      const saved = await saveEventReminderRules(prisma, orgId, scenario.eventId, {
        mode: "custom", rules: [rule({ unit: "hours", value: 2 })],
      }, now)
      expect(saved).toMatchObject({ ok: true })
      expect((await loadEventReminderRulesState(prisma, orgId, scenario.eventId, now))?.preview).toMatchObject({
        state: "queued",
        dueAt: "2026-03-28T23:30:00.000Z",
        localDay: "2026-03-29",
        recipientCount: 1,
        shiftCount: 1,
      })
    } finally {
      await deleteLocalDayScenario(scenario)
    }
  })

  it("announces nothing for a day whose first shift already started, and the cron queues nothing", async () => {
    // Shifts at 08:00 and 18:00; at 16:00 local the 08:00 one has started. Grouping both makes the
    // day's first shift started, so no reminder may be announced or queued for that day.
    const scenario = await createLocalDayScenario("jour-commence", "2030-06-10", [
      { startTime: "08:00", endTime: "12:00" },
      { startTime: "18:00", endTime: "22:00" },
    ])
    try {
      const now = new Date("2030-06-10T14:00:00Z") // 16:00 in Zurich (summer)
      const saved = await saveEventReminderRules(prisma, orgId, scenario.eventId, {
        mode: "custom", rules: [rule({ unit: "hours", value: 2 })],
      }, now)
      expect(saved).toMatchObject({ ok: true })
      expect((await loadEventReminderRulesState(prisma, orgId, scenario.eventId, now))?.preview).toMatchObject({
        state: "blocked",
        reason: "no-upcoming-reminder",
        dueAt: null,
      })
      const run = await queueCustomRuleReminders(now)
      expect(run.queued).toBe(0)
      expect(await prisma.reminderOccurrence.count({ where: { eventId: scenario.eventId, status: "queued" } })).toBe(0)
    } finally {
      await deleteLocalDayScenario(scenario)
    }
  })

  it("does not announce a night shift started yesterday that is still running", async () => {
    // 22:00 to 02:00 on 10 June, at 01:00 local on 11 June: the start day is yesterday and the
    // shift is still running. It belongs to yesterday's group, whose first shift has started.
    const scenario = await createLocalDayScenario("nuit-encours", "2026-06-10", [{ startTime: "22:00", endTime: "02:00" }])
    try {
      const now = new Date("2026-06-10T23:00:00Z") // 01:00 on 11 June in Zurich (summer)
      const saved = await saveEventReminderRules(prisma, orgId, scenario.eventId, {
        mode: "custom", rules: [rule({ unit: "hours", value: 2 })],
      }, now)
      expect(saved).toMatchObject({ ok: true })
      expect((await loadEventReminderRulesState(prisma, orgId, scenario.eventId, now))?.preview).toMatchObject({
        state: "blocked",
        reason: "no-upcoming-reminder",
      })
      expect((await queueCustomRuleReminders(now)).queued).toBe(0)
    } finally {
      await deleteLocalDayScenario(scenario)
    }
  })

  it("keeps a removed rule archived while one of its emails is in flight, then records its success", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const saved = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    if (!saved.ok) throw new Error("save failed")
    const ruleId = saved.state.rules[0].id
    await queueCustomRuleReminders(now)
    const occurrences = await customOccurrences()
    expect(occurrences).toHaveLength(2)
    const inFlight = occurrences.find((occurrence) => occurrence.volunteerId === volunteerIds[0])
    const other = occurrences.find((occurrence) => occurrence.volunteerId === volunteerIds[1])
    if (!inFlight?.outboxId || !other?.outboxId) throw new Error("missing outbox rows")
    // Delivery passed its last check: its row is claimed, SMTP is in flight.
    await prisma.notificationOutbox.update({
      where: { id: inFlight.outboxId },
      data: { status: "sending", claimedAt: now },
    })

    const removed = await saveEventReminderRules(prisma, orgId, eventId, { mode: "default" }, now)
    expect(removed).toMatchObject({ ok: true })
    // No sent occurrence yet, but the in-flight email archives the rule instead of deleting it.
    expect((await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: ruleId } })).archivedAt).not.toBeNull()
    // The in-flight occurrence is untouched; the other unsent one and its pending row are cancelled.
    expect(await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: inFlight.id } })).toMatchObject({
      status: "queued", outboxId: inFlight.outboxId,
    })
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: inFlight.outboxId } })).status).toBe("sending")
    expect(await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ status: "cancelled" })
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: other.outboxId } })).status).toBe("cancelled")

    // A cron run while SMTP is in flight must not cancel the occurrence out from under its record.
    await queueCustomRuleReminders(now)
    expect((await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: inFlight.id } })).status).toBe("queued")

    // SMTP accepted the email: the real completion path records it even though the rule is archived.
    const completedAt = new Date(now.getTime() + 60_000)
    await completeCustomReminderDelivery(inFlight.outboxId, inFlight.id, completedAt)
    const completed = await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: inFlight.id } })
    expect(completed.status).toBe("sent")
    expect(completed.sentAt?.toISOString()).toBe(completedAt.toISOString())

    // Recreating the same delay revives the archived row; the next run queues nothing for that
    // volunteer and day (the other volunteer's cancelled email is queued again).
    const recreated = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    if (!recreated.ok) throw new Error("save failed")
    expect(recreated.state.rules[0].id).toBe(ruleId)
    const run = await queueCustomRuleReminders(now)
    expect(run.queued).toBe(1)
    const recreatedRows = await prisma.reminderOccurrence.findMany({
      where: { eventId, volunteerId: volunteerIds[0], localDay: "2030-06-10" },
    })
    expect(recreatedRows).toHaveLength(1)
    expect(recreatedRows[0]).toMatchObject({ id: inFlight.id, ruleId, status: "sent" })
  })

  // The claim is not committed yet when the save starts: a plain read would see `pending`, cancel
  // the occurrence and delete the rule, and the email would leave with nothing left to record it.
  it("waits for a delivery claim in progress before deciding what to cancel", async () => {
    const now = new Date("2030-06-03T08:00:00Z")
    const saved = await saveEventReminderRules(prisma, orgId, eventId, { mode: "custom", rules: [rule()] }, now)
    if (!saved.ok) throw new Error("save failed")
    const ruleId = saved.state.rules[0].id
    await queueCustomRuleReminders(now)
    const claimed = (await customOccurrences()).find((occurrence) => occurrence.volunteerId === volunteerIds[0])
    if (!claimed?.outboxId) throw new Error("missing outbox row")
    const outboxId = claimed.outboxId

    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let claimWritten!: () => void
    const written = new Promise<void>((resolve) => { claimWritten = resolve })
    // The delivery's claim, written but not committed.
    const claim = prisma.$transaction(async (tx) => {
      await tx.notificationOutbox.update({ where: { id: outboxId }, data: { status: "sending", claimedAt: now } })
      claimWritten()
      await gate
    }, { timeout: 20_000 })
    await written

    let finished = false
    const removal = saveEventReminderRules(prisma, orgId, eventId, { mode: "default" }, now).then((result) => { finished = true; return result })
    // The save must block on the claimed row, not decide from the stale `pending`.
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%NotificationOutbox%FOR UPDATE%' AND pid <> pg_backend_pid()`
      if (Number(waiting[0].n) > 0) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(finished).toBe(false)
    release()
    await claim
    expect(await removal).toMatchObject({ ok: true })

    expect((await prisma.eventReminderRule.findUniqueOrThrow({ where: { id: ruleId } })).archivedAt).not.toBeNull()
    expect(await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: claimed.id } })).toMatchObject({ status: "queued", outboxId })
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } })).status).toBe("sending")
  })
})
