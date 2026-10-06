// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { register } from "tsx/cjs/api"
import type { ProductBuild } from "./product-build"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { assertHoursScenario, type HoursScenario } from "./record-volunteer-hours"

export const HOURS_ORG = "video-hours"
export const HOURS_OWNER = "video.hours.owner@example.org"
export const HOURS_ROWS = [
  ["prior", "aline", "may", "2026-05-02", "active", "open", "08:00", "12:00", true],
  ["morning", "aline", "september", "2026-09-12", "active", "open", "08:00", "10:00", true],
  ["afternoon", "aline", "september", "2026-09-12", "active", "open", "14:00", "16:00", false],
  ["benoit", "benoit", "september", "2026-09-12", "active", "open", "10:00", "12:00", false],
  ["cancelled-shift", "aline", "september", "2026-09-12", "active", "cancelled", "16:00", "18:00", true],
  ["cancelled-registration", "aline", "september", "2026-09-12", "cancelled", "open", "18:00", "20:00", false],
  ["waiting", "aline", "september", "2026-09-12", "waiting", "open", "20:00", "22:00", false],
  ["future", "aline", "future", "2026-11-28", "active", "open", "08:00", "12:00", false],
] as const

/** Entire owned cascade, including reverse relations, verified before any reset. */
export async function assertOwnedHoursFixture(db: PrismaClient) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: HOURS_ORG }, include: {
    admins: true, volunteers: { include: { registrations: true, invites: true, questionAnswers: true, pushSubscriptions: true, deliveryOutcomes: true, mergedFrom: true, duplicateDismissalsAsA: true, duplicateDismissalsAsB: true } },
    slugHistory: true, logs: true, targetedMessages: true, messageTemplates: true, duplicateDismissals: true, charterVersions: true, logo: true, erasureRecords: true,
    events: { include: { shifts: { include: { registrations: true } }, registrations: true, memberInvites: true, logs: true, pages: true, sectorLeaders: true, milestones: true, targetedMessages: true, questions: true, questionAnswers: true } },
  } })
  assert(org.name === "Formation — heures et attestations" && org.slug === "formation-heures" && org.timeZone === "Europe/Zurich" && org.replyToEmail === HOURS_OWNER && org.active)
  assert(org.admins.length === 1 && org.admins[0].id === `${HOURS_ORG}-owner` && org.admins[0].email === HOURS_OWNER && org.admins[0].role === "admin" && org.admins[0].isActive)
  assert([org.slugHistory, org.targetedMessages, org.messageTemplates, org.duplicateDismissals, org.charterVersions, org.erasureRecords].every(rows => rows.length === 0) && org.logo === null)
  assert(org.logs.length <= 5 && org.logs.every(log => log.action === "volunteer.certificate_generated" && log.organizationId === HOURS_ORG && log.entityType === "Member" && log.entityId === `${HOURS_ORG}-aline` && log.actorType === "admin" && log.actorId === `${HOURS_ORG}-owner` && log.changes === null), "Unknown organization log")
  assert.equal(await db.notificationOutbox.count({ where: { organizationId: HOURS_ORG } }), 0, "Hours fixture must send no notifications")
  assert.equal(org.volunteers.length, 3)
  for (const [id, name] of [["aline", "Aline"], ["benoit", "Benoît"], ["clara", "Clara"]]) {
    const member = org.volunteers.find(m => m.id === `${HOURS_ORG}-${id}`)
    assert(member && member.organizationId === HOURS_ORG && member.firstName === name && member.lastName === "Exemple" && member.email === `video.hours.${id}@example.org` && member.active && !member.phone && member.tags.length === 0 && member.mergedIntoId === null && member.erasedAt === null)
    assert([member.invites, member.questionAnswers, member.pushSubscriptions, member.deliveryOutcomes, member.mergedFrom, member.duplicateDismissalsAsA, member.duplicateDismissalsAsB].every(rows => rows.length === 0))
    assert(member.registrations.every(r => HOURS_ROWS.some(([key, who, event]) => r.id === `${HOURS_ORG}-registration-${key}` && r.volunteerId === `${HOURS_ORG}-${who}` && r.eventId === `${HOURS_ORG}-event-${event}`)), "Member has foreign registrations")
  }
  assert.equal(org.events.length, 3)
  for (const [kind, date, title] of [["may", "2026-05-02", "Rencontre de printemps"], ["september", "2026-09-12", "Fête de septembre"], ["future", "2026-11-28", "Préparer la prochaine fête"]]) {
    const event = org.events.find(e => e.id === `${HOURS_ORG}-event-${kind}`)
    assert(event && event.organizationId === HOURS_ORG && event.title === title && event.slug === `heures-${kind}` && event.startDate.toISOString() === `${date}T00:00:00.000Z` && event.endDate.toISOString() === `${date}T00:00:00.000Z` && event.publicStatus === "published" && !event.isListed && !event.remindersEnabled)
    assert([event.memberInvites, event.logs, event.pages, event.sectorLeaders, event.milestones, event.targetedMessages, event.questions, event.questionAnswers].every(rows => rows.length === 0))
    const expected = HOURS_ROWS.filter(row => row[2] === kind)
    assert.equal(event.shifts.length, expected.length); assert.equal(event.registrations.length, expected.length)
    for (const [key, who, , day, state, shiftState, start, end, checked] of expected) {
      const shift: (typeof event.shifts)[number] | undefined = event.shifts.find(s => s.id === `${HOURS_ORG}-shift-${key}`)
      const reg: (typeof event.registrations)[number] | undefined = event.registrations.find(r => r.id === `${HOURS_ORG}-registration-${key}`)
      assert(shift && shift.eventId === event.id && shift.roleName === "Accueil" && shift.label === `Formation — ${key}` && shift.date.toISOString() === `${day}T00:00:00.000Z` && shift.startTime === start && shift.endTime === end && shift.status === shiftState && shift.capacity === 3 && shift.reservedTags.length === 0 && !shift.minAge)
      assert(reg && reg.eventId === event.id && reg.shiftId === shift.id && reg.volunteerId === `${HOURS_ORG}-${who}` && reg.status === state && reg.source === "admin_manual" && Boolean(reg.checkedInAt) === checked)
      assert(shift.registrations.length === 1 && shift.registrations[0].id === reg.id, "Foreign shift cascade")
    }
  }
  return org
}

/** Numeric semantics are imported from the proven compilation, not copied. */
export async function readHoursScenario(db: PrismaClient, product: ProductBuild): Promise<HoursScenario> {
  const org = await assertOwnedHoursFixture(db)
  const previous = process.env.TSX_TSCONFIG_PATH
  process.env.TSX_TSCONFIG_PATH = path.join(product.snapshot, "tsconfig.json")
  // register() with a namespace returns a scoped loader; ReturnType only sees the last overload.
  let loader: ReturnType<typeof register> & { require: (id: string, fromFile: string | URL) => ReturnType<typeof import("tsx/cjs/api").require>; resolve: (id: string, fromFile: string | URL) => string; unregister: () => void }
  try { loader = register({ namespace: `hours-${randomUUID()}` }) }
  finally { if (previous === undefined) delete process.env.TSX_TSCONFIG_PATH; else process.env.TSX_TSCONFIG_PATH = previous }
  try {
    const parent = path.join(product.snapshot, "package.json")
    const hours = loader.require(path.join(product.snapshot, "src/lib/volunteer-hours.ts"), parent)
    const calendar = loader.require(path.join(product.snapshot, "src/lib/ics.ts"), parent)
    const summary = loader.require(path.join(product.snapshot, "src/lib/event-summary.ts"), parent)
    const registrations = org.events.flatMap(event => event.registrations.map(reg => ({ ...reg, event: { id: event.id, title: event.title }, shift: event.shifts.find(shift => shift.id === reg.shiftId)! })))
    const all = hours.volunteerHourEntries(registrations, org.timeZone)
    const today = hours.localToday(new Date(), org.timeZone)
    const september = org.events.find(e => e.id === `${HOURS_ORG}-event-september`)!
    const returned = new Set(all.filter((entry: { localDate: string }) => entry.localDate < "2026-09-12").map((entry: { volunteerId: string }) => entry.volunteerId))
    const actual = summary.eventSummary(registrations.filter(r => r.eventId === september.id), returned, september.shifts.filter(s => s.status !== "cancelled").map(s => ({ ...s, date: s.date.toISOString().slice(0, 10), active: september.registrations.filter(r => r.shiftId === s.id && r.status === "active").length, waiting: september.registrations.filter(r => r.shiftId === s.id && ["waiting", "offered"].includes(r.status)).length, requested: 0, closed: s.status === "closed" })), [], org.timeZone)
    const scenario: HoursScenario = { organizationId: org.id, organizationName: org.name, organizationSlug: org.slug, product,
      members: org.volunteers.map(member => ({ id: member.id, firstName: member.firstName, lastName: member.lastName, email: member.email!, ...(() => { const total = hours.splitMinutes(hours.pastEntries(all.filter((e: { volunteerId: string }) => e.volunteerId === member.id), today)); return { plannedMinutes: total.plannedMinutes, attestedMinutes: total.attestedMinutes } })() })),
      rows: registrations.map(r => { const instants = calendar.shiftInstants(r.shift, org.timeZone); return { id: r.id, volunteerId: r.volunteerId, eventId: r.eventId, localDate: r.shift.date.toISOString().slice(0, 10), status: r.status, shiftStatus: r.shift.status, minutes: Math.round((instants.end.getTime() - instants.start.getTime()) / 60000), checkedInAt: r.checkedInAt?.toISOString() ?? null } }),
      confirmedSummary: { distinct: actual.distinctVolunteers, firstTime: actual.firstTimeCount, returning: actual.returningCount, confirmed: actual.shiftsConfirmed, withPresence: actual.shiftsWithPresence, plannedMinutes: actual.plannedMinutes, attestedMinutes: actual.attestedMinutes },
    }
    assertHoursScenario(scenario, product)
    return scenario
  } finally { loader.unregister() }
}
