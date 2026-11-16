// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { PrismaClient } from "../src/generated/prisma/client"
import { pgAdapter } from "../src/lib/prisma-adapter"
import { registrationToken } from "../src/lib/token-vault"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"
import { videoAdminEmail } from "../videos/lib/public-hosts"
import { mkdir, writeFile } from "node:fs/promises"

export const FRONT_DESK_ORG = "video-frontdesk"
export const FRONT_DESK_EVENT = "video-frontdesk-event"
export const FRONT_DESK_EMAIL = "video.frontdesk.colette@example.org"
export async function verifyFrontDeskFixture(db: PrismaClient) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: FRONT_DESK_ORG }, include: { admins: true, volunteers: true, events: { include: { shifts: true, registrations: true } } } })
  assert(org.slug === "formation-accueil" && org.name === "Association du Parc de Montvert")
  assert(org.admins.length >= 1 && org.admins.length <= 2 && org.admins.every(a => a.email === "video.frontdesk.owner@example.org" || a.email === FRONT_DESK_EMAIL && a.role === "front_desk"))
  assert(org.volunteers.length === 2 && org.volunteers.every(v => /^video-frontdesk-person-[01]$/.test(v.id) && v.email === `video.frontdesk.${v.id.slice(-1)}@example.org` && v.lastName === surnameOf(v.firstName) && v.phone === `079 000 10 0${v.id.slice(-1)}` && v.notes === null))
  assert(org.events.length === 1 && org.events[0].id === FRONT_DESK_EVENT && org.events[0].title === "Fête du parc — accueil" && org.events[0].description === "Données fictives de formation uniquement.")
  assert(org.events[0].shifts.length === 1 && org.events[0].shifts[0].id === "video-frontdesk-shift")
  assert(org.events[0].registrations.length === 2 && org.events[0].registrations.every(r => /^video-frontdesk-registration-[01]$/.test(r.id)))
  return org
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: pgAdapter(url.href) })
  try {
    const old = await db.organization.findUnique({ where: { id: FRONT_DESK_ORG } })
    if (old) { assert(process.argv.includes("--reset-owned")); await verifyFrontDeskFixture(db) }
    else assert.equal(await db.organization.count({ where: { slug: "formation-accueil" } }), 0)
    const owner = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: videoAdminEmail() } })
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    const today = new Date(`${date}T00:00:00Z`)
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date())
    const minute = Number(parts.find(p => p.type === "hour")!.value) * 60 + Number(parts.find(p => p.type === "minute")!.value)
    const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
    await db.$transaction(async tx => {
      if (old) {
        await tx.notificationOutbox.deleteMany({ where: { organizationId: FRONT_DESK_ORG } })
        await tx.event.deleteMany({ where: { organizationId: FRONT_DESK_ORG } })
        await tx.adminUser.deleteMany({ where: { organizationId: FRONT_DESK_ORG } })
        await tx.volunteer.deleteMany({ where: { organizationId: FRONT_DESK_ORG } })
      } else await tx.organization.create({ data: { id: FRONT_DESK_ORG, slug: "formation-accueil", name: "Association du Parc de Montvert", timeZone: "Europe/Zurich", active: true, replyToEmail: "video.frontdesk.owner@example.org" } })
      await tx.adminUser.create({ data: { id: "video-frontdesk-owner", organizationId: FRONT_DESK_ORG, email: "video.frontdesk.owner@example.org", name: fullNameOf("Élodie"), passwordHash: owner.passwordHash, role: "admin", isActive: true } })
      await tx.event.create({ data: { id: FRONT_DESK_EVENT, organizationId: FRONT_DESK_ORG, slug: "fete-du-parc", title: "Fête du parc — accueil", description: "Données fictives de formation uniquement.", startDate: today, endDate: new Date(+today + 86400000), publicStatus: "published", remindersEnabled: false } })
      await tx.shift.create({ data: { id: "video-frontdesk-shift", eventId: FRONT_DESK_EVENT, roleName: "Accueil", label: "Accueil du parc", date: today, startTime: fmt(Math.max(0, minute - 30)), endTime: fmt(minute + 90), capacity: 3 } })
      for (const [i, firstName] of ["Zoé", "Nicolas"].entries()) {
        await tx.volunteer.create({ data: { id: `video-frontdesk-person-${i}`, organizationId: FRONT_DESK_ORG, firstName, lastName: surnameOf(firstName), email: `video.frontdesk.${i}@example.org`, phone: `079 000 10 0${i}` } })
        await tx.registration.create({ data: { id: `video-frontdesk-registration-${i}`, volunteerId: `video-frontdesk-person-${i}`, eventId: FRONT_DESK_EVENT, shiftId: "video-frontdesk-shift", status: "active", ...registrationToken.data(`demo-frontdesk-registration-${i}`) } })
      }
    })
    await verifyFrontDeskFixture(db)
    const mailbox = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"
    assert(/^http:\/\/(localhost|127\.0\.0\.1):48026$/.test(mailbox))
    type Mail = { ID: string; Subject: string; To: { Address: string }[]; Cc?: { Address: string }[]; Bcc?: { Address: string }[] }
    const inventory = async (): Promise<Mail[]> => (await (await fetch(`${mailbox}/api/v1/messages?limit=1000`)).json()).messages
    const before = await inventory()
    const owned = before.filter(m => m.Subject.includes("votre accès accueil pour Fête du parc — accueil") && [...m.To, ...(m.Cc ?? []), ...(m.Bcc ?? [])].every(r => r.Address === FRONT_DESK_EMAIL) && m.To.length > 0)
    for (const m of owned) assert((await fetch(`${mailbox}/api/v1/messages`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [m.ID] }) })).ok)
    const after = await inventory(); const ids = new Set(owned.map(m => m.ID))
    assert(before.filter(m => !ids.has(m.ID)).every(m => after.some(a => a.ID === m.ID)))
    await mkdir("videos/output/front-desk-access", { recursive: true })
    await writeFile("videos/output/front-desk-access/seed-proof.json", JSON.stringify({ at: new Date().toISOString(), synthetic: true, deletedMailIds: [...ids], preservedMailIds: after.map(m => m.ID) }, null, 2))
    console.log("Exact synthetic front-desk scenario prepared; unrelated organizations and mail preserved")
  } finally { await db.$disconnect() }
}
if (process.argv[1]?.endsWith("seed-video-front-desk.ts")) main().catch(error => { console.error(error instanceof Error ? error.message : "Front-desk seed failed"); process.exitCode = 1 })
