// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Only this exact independent synthetic organization; no reset of default or other fixtures. */
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../../src/lib/token-vault"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { verifyDayOfReviewFixture } from "../lib/verify-dayof-review-fixture"

async function main() {
  assert(process.argv.slice(2).every(arg => arg === "--reset-owned") && process.argv.length <= 3)
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
  const orgId = "video-dayof", eventId = "video-dayof-event-pointage", liveId = "video-dayof-event-live"
  try {
    const existing = await db.organization.findUnique({ where: { id: orgId }, include: { volunteers: true, admins: true, events: { include: { shifts: true, registrations: true, sectorLeaders: true } } } })
    if (existing) {
      assert(process.argv.includes("--reset-owned"), "Fixture exists; explicit --reset-owned required")
      await verifyDayOfReviewFixture(db)
      assert(existing.name === "Formation — accueil et jour J" && existing.slug === "formation-jour-j" && existing.admins.length === 1 && existing.admins[0].email === "video.dayof.owner@example.org")
      assert(existing.volunteers.length === 8 && existing.volunteers.every(v => /^video-dayof-attendance-person-[0-7]$/.test(v.id) && /^video\.attendance\.[0-7]@example\.org$/.test(v.email ?? "") && v.lastName === "Exemple"))
      assert(existing.events.length === 2 && existing.events.every(e => [eventId, liveId].includes(e.id) && !e.sectorLeaders.length && e.shifts.every(s => /^video-dayof-shift-(old-[0-2]|running|upcoming|earlier|night)$/.test(s.id)) && e.registrations.every(r => /^video-dayof-registration-(old-[0-7]|zoe|upcoming|earlier|night)$/.test(r.id))))
    } else assert.equal(await db.organization.count({ where: { slug: "formation-jour-j" } }), 0, "Slug belongs to another organization")
    const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: "org-admin@localhost" }, select: { passwordHash: true } })
    const now = new Date()
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)
    const value = (type: string) => parts.find(p => p.type === type)!.value
    const today = new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00Z`)
    const minute = Number(value("hour")) * 60 + Number(value("minute"))
    assert(minute >= 180 && minute < 1380, "Prepare between 03:00 and 23:00 Zurich so all real today/overnight cases exist")
    const idsElsewhere = await db.volunteer.count({ where: { id: { startsWith: "video-dayof-attendance-person-" }, organizationId: { not: orgId } } })
    assert.equal(idsElsewhere, 0, "Dedicated volunteer IDs belong to another organization")
    const dateOffset = (days: number) => new Date(today.getTime() + days * 86_400_000)
    const fmt = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    const slot = (start: number, end: number) => { const day = Math.floor(start / 1440); return { date: dateOffset(day), startTime: fmt(start - day * 1440), endTime: fmt(end - day * 1440) } }
    await db.$transaction(async tx => {
      if (existing) await tx.event.deleteMany({ where: { organizationId: orgId, id: { in: [eventId, liveId] } } })
      else {
        await tx.organization.create({ data: { id: orgId, slug: "formation-jour-j", name: "Formation — accueil et jour J", timeZone: "Europe/Zurich", active: true, replyToEmail: "video.dayof.owner@example.org" } })
        await tx.adminUser.create({ data: { id: `${orgId}-owner`, organizationId: orgId, email: "video.dayof.owner@example.org", name: "Élodie Exemple", passwordHash: source.passwordHash, role: "admin", isActive: true } })
      }
      const firstNames = ["Aline", "Nicolas", "Léa", "Noah", "Sarah", "Lucas", "Camille", "Zoé"]
      for (const [index, firstName] of firstNames.entries()) await tx.volunteer.upsert({ where: { id: `video-dayof-attendance-person-${index}` }, create: { id: `video-dayof-attendance-person-${index}`, organizationId: orgId, firstName, lastName: "Exemple", email: `video.attendance.${index}@example.org`, phone: index === 7 ? "079 000 00 01" : null }, update: {} })
      await tx.event.create({ data: { id: eventId, organizationId: orgId, slug: "atelier-pointage", title: "Accueil des bénévoles — pointage", description: "Données fictives de formation uniquement.", startDate: dateOffset(-2), endDate: dateOffset(-2), publicStatus: "published", remindersEnabled: false } })
      for (const [index, definition] of [["Accueil", "Accueil du matin", "08:00", "10:00"], ["Buvette", "Buvette de midi", "12:00", "14:00"], ["Logistique", "Installation à annuler après arrivée", "10:00", "12:00"]].entries()) await tx.shift.create({ data: { id: `video-dayof-shift-old-${index}`, eventId, roleName: definition[0], label: definition[1], startTime: definition[2], endTime: definition[3], date: dateOffset(-2), capacity: 8 } })
      for (let index = 0; index < 8; index++) await tx.registration.create({ data: { id: `video-dayof-registration-old-${index}`, eventId, volunteerId: `video-dayof-attendance-person-${index === 7 ? 2 : index}`, shiftId: `video-dayof-shift-old-${index === 7 ? 1 : index === 4 ? 2 : 0}`, status: index === 5 ? "requested" : index === 6 ? "waiting" : "active", checkedInAt: null, ...(index === 6 ? { waitingPosition: 1 } : {}), ...registrationToken.data(`demo-dayof-old-${index}`) } })
      await tx.event.create({ data: { id: liveId, organizationId: orgId, slug: "jour-j-terrain", title: "Jour J — équipe sur le terrain", description: "Données fictives de formation uniquement.", startDate: dateOffset(-1), endDate: dateOffset(1), publicStatus: "published", remindersEnabled: false } })
      for (const [key, role, label, timing, person] of [
        ["running", "Accueil", "Accueil sur place", slot(minute - 30, minute + 90), 7],
        ["upcoming", "Buvette", "Relève dans une heure", slot(minute + 60, minute + 120), 0],
        ["earlier", "Logistique", "Installation terminée", slot(minute - 180, minute - 120), 1],
        ["night", "Veille", "Veille commencée hier", { date: dateOffset(-1), startTime: "23:00", endTime: fmt(1440 + minute + 60) }, 3],
      ] as const) {
        const shiftId = `video-dayof-shift-${key}`
        await tx.shift.create({ data: { id: shiftId, eventId: liveId, roleName: role, label, ...timing, capacity: 3, contactName: "Élodie Exemple", contactPhone: "079 000 00 02" } })
        await tx.registration.create({ data: { id: `video-dayof-registration-${key === "running" ? "zoe" : key}`, eventId: liveId, shiftId, volunteerId: `video-dayof-attendance-person-${person}`, status: "active", checkedInAt: null, ...registrationToken.data(`demo-dayof-live-${key}`) } })
      }
    })
    const directory = path.resolve("videos/output/attendance-check-in")
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "dayof-preparation.json"), JSON.stringify({ preparedAt: now.toISOString(), organizationId: orgId, eventId, liveId, locale: "fr-FR", timeZone: "Europe/Zurich", currentServerWindow: true, captured: false }, null, 2))
    console.log("Independent fictional attendance/Jour J fixture prepared; no email or capture. Default untouched.")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Jour J preparation failed"); process.exitCode = 1 })
