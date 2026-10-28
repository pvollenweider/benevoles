// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixtures of the beta videos (#1168, #1147, #1169, #1174): BETA_ACCESS, SECTORS, SHIFT_SWAPS and
 * the sector part of SECTOR_LEADERS. One dedicated synthetic organisation, « Association du
 * Festival de Montvert » (`video-beta`, slug `formation-beta`), with its owner and a separate
 * operator account (super admin) for the « Fonctions bêta » page. Never the demo organisation.
 *
 * The beta gate is set the way the app reads it (src/lib/beta-capabilities.ts, beta-access.ts):
 * the operator's open list in PlatformSetting `beta.capabilities` ({ open: [...] }, level 1) and
 * `Organization.betaOptInAt` (level 2). Each scenario opens only the capabilities its video needs.
 * The open list is platform-wide: scripts/seed-demo.ts removes it again, so the demo videos never
 * show the « Fonctions bêta » card.
 *
 * Reset guards: an existing `video-beta` organisation is emptied only when every account, member
 * and event in it is one of this fixture's (exact ids and example.org addresses); the operator
 * account is reused only when it is exactly this fixture's. Anything else stops the seed.
 * Called through scripts/seed-video-scenario.ts, which refuses any database but the video one.
 * Dates are relative to the take, in Europe/Zurich: the videos do not rot.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"
import { BETA_SETTING_KEY, type BetaCapabilityId } from "../src/lib/beta-capabilities"
import { addDays } from "../src/lib/shift-series"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"

export const BETA_ORG = { id: "video-beta", slug: "formation-beta", name: "Association du Festival de Montvert" } as const
export const BETA_OWNER = { id: "video-beta-owner", email: "video.beta.owner@example.org", firstName: "Élodie" } as const
export const BETA_OPERATOR = { id: "video-beta-operator", email: "video.beta.operator@example.org", firstName: "Morgane" } as const
export const BETA_EVENT = { id: "video-beta-event", slug: "festival-de-montvert", title: "Festival de Montvert" } as const
/** Every member and leader address of the fixture; the recorder's mailbox cleanup uses the same rule. */
export const BETA_PERSON_EMAIL = /^video\.beta\.[a-z]+@example\.org$/
const TIME_ZONE = "Europe/Zurich"

const email = (key: string) => `video.beta.${key}@example.org`
/** The personal-page token of a fixture registration: `/my/<token>`. */
export const betaToken = (scenario: string, key: string) => `demo-beta-${scenario}-${key}-0001`

/** Today in the organisation's zone, as YYYY-MM-DD. */
export function localToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

/** The first Saturday at least `minDays` after today: the swaps need shifts well ahead. */
export function saturdayAfter(today: string, minDays: number): string {
  const from = addDays(today, minDays)
  const weekday = new Date(`${from}T00:00:00Z`).getUTCDay()
  return addDays(from, (6 - weekday + 7) % 7)
}

type Db = PrismaClient

async function resetOrganization(db: Db) {
  const previous = await db.organization.findUnique({ where: { id: BETA_ORG.id }, include: { admins: true, volunteers: true, events: true } })
  if (previous) {
    assert.equal(previous.slug, BETA_ORG.slug, "video-beta organisation has an unexpected slug")
    assert(previous.admins.every((a) => a.id === BETA_OWNER.id && a.email === BETA_OWNER.email), "video-beta organisation has an unknown account")
    assert(previous.volunteers.every((v) => BETA_PERSON_EMAIL.test(v.email ?? "")), "video-beta organisation has an unknown member")
    assert(previous.events.every((e) => e.id === BETA_EVENT.id), "video-beta organisation has an unknown event")
    // Cascades remove shifts, sectors, registrations, leaders and swap requests of the fixture.
    await db.event.deleteMany({ where: { organizationId: BETA_ORG.id } })
    await db.volunteer.deleteMany({ where: { organizationId: BETA_ORG.id } })
    await db.orgLog.deleteMany({ where: { organizationId: BETA_ORG.id } })
  } else {
    assert.equal(await db.organization.count({ where: { slug: BETA_ORG.slug } }), 0, "slug formation-beta already used by another organisation")
    assert.equal(await db.adminUser.count({ where: { email: BETA_OWNER.email } }), 0, "owner address already used outside the fixture")
  }
  const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
  const org = {
    name: BETA_ORG.name, timeZone: TIME_ZONE, active: true, suspendedAt: null, hasOrgInsurance: true,
    outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(),
    volunteerCharter: "Je viens à l'heure à mes créneaux, je préviens si j'ai un empêchement et je suis les consignes des responsables.",
    betaOptInAt: null, betaOptInById: null, sectorsDefault: false, shiftSwapsDefault: true,
  }
  if (previous) await db.organization.update({ where: { id: BETA_ORG.id }, data: org })
  else await db.organization.create({ data: { id: BETA_ORG.id, slug: BETA_ORG.slug, ...org } })
  const owner = { organizationId: BETA_ORG.id, email: BETA_OWNER.email, name: fullNameOf(BETA_OWNER.firstName), role: "admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: BETA_OWNER.id }, create: { id: BETA_OWNER.id, ...owner }, update: owner })

  const operator = await db.adminUser.findUnique({ where: { id: BETA_OPERATOR.id } })
  if (operator) {
    assert(operator.email === BETA_OPERATOR.email && operator.role === "super_admin" && operator.organizationId === null, "video-beta operator account is not the fixture's")
  } else {
    assert.equal(await db.adminUser.count({ where: { email: BETA_OPERATOR.email } }), 0, "operator address already used outside the fixture")
  }
  const op = { email: BETA_OPERATOR.email, name: fullNameOf(BETA_OPERATOR.firstName), role: "super_admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: BETA_OPERATOR.id }, create: { id: BETA_OPERATOR.id, ...op }, update: op })

  // Repeated local takes share one browser IP and the same fictitious recipients: stale counters
  // of an earlier take must not hold this one's emails (seed-demo.ts does the same).
  await db.rateLimit.deleteMany()
}

/** Level 1 (operator) and level 2 (organisation) of the beta gate. */
async function setBeta(db: Db, open: BetaCapabilityId[], optedIn: boolean) {
  const value = { open }
  await db.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value, updatedById: BETA_OPERATOR.id }, update: { value, updatedById: BETA_OPERATOR.id } })
  await db.organization.update({ where: { id: BETA_ORG.id }, data: optedIn ? { betaOptInAt: new Date(), betaOptInById: BETA_OWNER.id } : { betaOptInAt: null, betaOptInById: null } })
}

type PosteSeed = { roleName: string; sector?: string; colorKey: string; locationDetails: string; shifts: { day: number; start: string; end: string; capacity: number; people?: string[] }[] }

/**
 * The event, its sectors (when given), postes, shifts and confirmed registrations. Each person is
 * one fixture member (cast name, example.org address); `day` counts from `firstDay`.
 */
async function createEvent(db: Db, options: {
  scenario: string; firstDay: string; days: number; sectors: string[] | null; swaps?: boolean; postes: PosteSeed[]; people: Record<string, string>
}) {
  const { scenario, firstDay, days, sectors, postes, people } = options
  const event = await db.event.create({
    data: {
      id: BETA_EVENT.id, organizationId: BETA_ORG.id, slug: BETA_EVENT.slug, title: BETA_EVENT.title,
      description: "Trois scènes au bord du lac, un chapiteau et un village associatif : le festival compte sur ses bénévoles pour l'accueil, les bars, le parking et la technique.",
      location: "Rives du lac, Montvert", publicStatus: "published", registrationsOpen: true, remindersEnabled: false,
      startDate: new Date(firstDay), endDate: new Date(addDays(firstDay, days - 1)),
      sectorsEnabled: sectors !== null, sectorsAdoptedAt: sectors && sectors.length ? new Date() : null,
      shiftSwapsEnabled: options.swaps ?? false, shiftSwapsApproval: false,
    },
  })
  const sectorIds = new Map<string, string>()
  for (const [index, name] of (sectors ?? []).entries()) {
    const sector = await db.sector.create({ data: { eventId: event.id, name, displayOrder: index } })
    sectorIds.set(name, sector.id)
  }
  const volunteerIds = new Map<string, string>()
  for (const [key, firstName] of Object.entries(people)) {
    const volunteer = await db.volunteer.create({ data: { id: `video-beta-person-${key}`, organizationId: BETA_ORG.id, firstName, lastName: surnameOf(firstName), email: email(key) } })
    volunteerIds.set(key, volunteer.id)
  }
  const registrations: Record<string, string[]> = {}
  for (const [order, poste] of postes.entries()) {
    for (const s of poste.shifts) {
      const shift = await db.shift.create({ data: {
        eventId: event.id, roleName: poste.roleName, label: poste.roleName, date: new Date(addDays(firstDay, s.day)),
        startTime: s.start, endTime: s.end, capacity: s.capacity, displayOrder: order, colorKey: poste.colorKey,
        locationDetails: poste.locationDetails, sectorId: poste.sector ? sectorIds.get(poste.sector) ?? null : null,
      } })
      for (const key of s.people ?? []) {
        const n = (registrations[key] ??= []).length
        const token = n === 0 ? betaToken(scenario, key) : `demo-beta-${scenario}-${key}-${String(n + 1).padStart(4, "0")}`
        await db.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: volunteerIds.get(key)!, status: "active", source: "public_form", ...registrationToken.data(token) } })
        registrations[key].push(token)
      }
    }
  }
  return { event, sectorIds, volunteerIds, registrations }
}

/**
 * BETA_ACCESS: nothing open, the organisation not taking part. One published event without
 * sectors or swaps: once the organisation joins, its information page offers both options.
 */
export async function seedVideoBetaAccess(db: Db) {
  await resetOrganization(db)
  await setBeta(db, [], false)
  const firstDay = addDays(localToday(new Date()), 30)
  await createEvent(db, {
    scenario: "access", firstDay, days: 2, sectors: null,
    people: { aline: "Aline", nicolas: "Nicolas" },
    postes: [
      { roleName: "Parking Nord", colorKey: "slate", locationDetails: "Entrée nord du site", shifts: [{ day: 0, start: "16:00", end: "20:00", capacity: 4, people: ["aline"] }] },
      { roleName: "Bar Grande Scène", colorKey: "amber", locationDetails: "Bar à gauche de la Grande Scène", shifts: [{ day: 0, start: "18:00", end: "22:00", capacity: 6, people: ["nicolas"] }] },
    ],
  })
  assert.equal(await db.platformSetting.count({ where: { key: BETA_SETTING_KEY } }), 1)
  console.log("✓ Beta access fixture: nothing open for trial, « Association du Festival de Montvert » not taking part, one event without sectors or swaps; operator account video.beta.operator@example.org")
}

/**
 * SECTORS: « Secteurs » open, the organisation taking part. The event starts tomorrow (so « Jour J »
 * is offered today), with four postes and their registrations but sectors still off: the video
 * turns the option on, creates « Parking » and « Backline », adds a poste inside, then moves the
 * two parking postes. « Bar Grande Scène » and « Accueil Chapiteau » stay in « Autres postes ».
 */
export async function seedVideoSectors(db: Db) {
  await resetOrganization(db)
  await setBeta(db, ["sectors"], true)
  const firstDay = addDays(localToday(new Date()), 1)
  await createEvent(db, {
    scenario: "sectors", firstDay, days: 2, sectors: null,
    people: { aline: "Aline", nicolas: "Nicolas", lea: "Léa", noah: "Noah", sarah: "Sarah", lucas: "Lucas", camille: "Camille", zoe: "Zoé" },
    postes: [
      { roleName: "Parking Nord", colorKey: "slate", locationDetails: "Entrée nord du site", shifts: [
        { day: 0, start: "16:00", end: "20:00", capacity: 4, people: ["aline", "nicolas", "lea"] },
        { day: 1, start: "16:00", end: "20:00", capacity: 4, people: ["noah"] },
      ] },
      { roleName: "Parking Mairie", colorKey: "slate", locationDetails: "Place de la Mairie", shifts: [{ day: 0, start: "16:00", end: "20:00", capacity: 3, people: ["sarah"] }] },
      { roleName: "Bar Grande Scène", colorKey: "amber", locationDetails: "Bar à gauche de la Grande Scène", shifts: [
        { day: 0, start: "18:00", end: "22:00", capacity: 6, people: ["lucas", "camille"] },
        { day: 1, start: "18:00", end: "22:00", capacity: 6, people: ["zoe"] },
      ] },
      { roleName: "Accueil Chapiteau", colorKey: "sky", locationDetails: "Entrée du Chapiteau", shifts: [{ day: 1, start: "14:00", end: "18:00", capacity: 3 }] },
    ],
  })
  console.log("✓ Sectors fixture: « Secteurs » open, organisation taking part, « Festival de Montvert » from tomorrow, sectors off, 4 postes, 5 confirmed people on the two parking postes")
}

/**
 * SECTOR_LEADERS (sector part), after scripts/seed-demo.ts: « Secteurs » and « Responsables de
 * secteur » open, the organisation taking part, an event that adopted sectors: « Parking »
 * (Parking Nord, Parking Mairie), « Backline » (Backline Grande Scène) and « Bar Grande Scène »
 * without sector. No leader yet: the video names Paul for the whole « Parking » sector.
 */
export async function seedVideoSectorLeadersBeta(db: Db) {
  await resetOrganization(db)
  await setBeta(db, ["sectors", "sectorLeaders"], true)
  const firstDay = saturdayAfter(localToday(new Date()), 14)
  await createEvent(db, {
    scenario: "leaders", firstDay, days: 2, sectors: ["Parking", "Backline"],
    people: { aline: "Aline", nicolas: "Nicolas", lea: "Léa", noah: "Noah", sarah: "Sarah" },
    postes: [
      { roleName: "Parking Nord", sector: "Parking", colorKey: "slate", locationDetails: "Entrée nord du site", shifts: [
        { day: 0, start: "16:00", end: "20:00", capacity: 4, people: ["aline", "nicolas"] },
        { day: 1, start: "16:00", end: "20:00", capacity: 4, people: ["lea"] },
      ] },
      { roleName: "Parking Mairie", sector: "Parking", colorKey: "slate", locationDetails: "Place de la Mairie", shifts: [{ day: 0, start: "16:00", end: "20:00", capacity: 3, people: ["sarah"] }] },
      { roleName: "Backline Grande Scène", sector: "Backline", colorKey: "violet", locationDetails: "Arrière de la Grande Scène", shifts: [{ day: 0, start: "14:00", end: "18:00", capacity: 4, people: ["noah"] }] },
      { roleName: "Bar Grande Scène", colorKey: "amber", locationDetails: "Bar à gauche de la Grande Scène", shifts: [{ day: 1, start: "18:00", end: "22:00", capacity: 6 }] },
    ],
  })
  assert.equal(await db.sectorLeader.count({ where: { eventId: BETA_EVENT.id } }), 0)
  console.log("✓ Sector leaders fixture: event with sectors Parking and Backline, no leader; « Responsables de secteur » open and organisation taking part")
}

/**
 * SHIFT_SWAPS: « Secteurs » and « Échanges de créneaux » open, the organisation taking part. The
 * event (a Saturday and Sunday at least two weeks ahead) adopted sectors and has swaps OFF: the
 * video turns them on. Same poste: Léa (Bar Grande Scène, Saturday) and Jules (two Sunday shifts
 * of the same bar). Same sector, two postes: Noah (Accueil Scène du Lac, Saturday) and Lou
 * (Accueil Grande Scène, Sunday), validated by the organisation once « Valider chaque échange » is on.
 */
export async function seedVideoShiftSwaps(db: Db) {
  await resetOrganization(db)
  await setBeta(db, ["sectors", "shiftSwaps"], true)
  const firstDay = saturdayAfter(localToday(new Date()), 14)
  const { registrations } = await createEvent(db, {
    scenario: "swaps", firstDay, days: 2, sectors: ["Bars", "Accueil"],
    people: { lea: "Léa", jules: "Jules", noah: "Noah", lou: "Lou", aline: "Aline", sarah: "Sarah" },
    postes: [
      { roleName: "Bar Grande Scène", sector: "Bars", colorKey: "amber", locationDetails: "Bar à gauche de la Grande Scène", shifts: [
        { day: 0, start: "14:00", end: "18:00", capacity: 4, people: ["lea"] },
        { day: 0, start: "18:00", end: "22:00", capacity: 4, people: ["aline"] },
        { day: 1, start: "14:00", end: "18:00", capacity: 4, people: ["jules"] },
        { day: 1, start: "18:00", end: "22:00", capacity: 4, people: ["jules"] },
      ] },
      { roleName: "Accueil Scène du Lac", sector: "Accueil", colorKey: "sky", locationDetails: "Entrée de la Scène du Lac", shifts: [
        { day: 0, start: "10:00", end: "14:00", capacity: 3, people: ["noah"] },
        { day: 1, start: "10:00", end: "14:00", capacity: 3, people: ["sarah"] },
      ] },
      { roleName: "Accueil Grande Scène", sector: "Accueil", colorKey: "sky", locationDetails: "Entrée principale", shifts: [{ day: 1, start: "10:00", end: "14:00", capacity: 3, people: ["lou"] }] },
    ],
  })
  assert.equal(registrations.jules.length, 2)
  assert.equal(await db.shiftSwapRequest.count({ where: { eventId: BETA_EVENT.id } }), 0)
  console.log(`✓ Shift swaps fixture: event on ${firstDay} and the next day, sectors Bars and Accueil, swaps off; Léa, Jules, Noah and Lou on their personal pages`)
}
