// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"
/** Create only this video's missing classroom; preserve every existing object. */
export async function seedVideoDeliveryClassroom(db: PrismaClient) {
  const organizationId = "video-delivery", eventId = "video-delivery-event", shiftId = "video-delivery-shift"
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } })
  assert.equal(org.slug, "formation-livraisons")
  const existing = await db.event.findUnique({ where: { id: eventId } })
  if (existing) assert(existing.organizationId === organizationId && existing.title === "Atelier des emails" && existing.slug === "atelier-des-emails")
  else {
    assert.equal(await db.event.count({ where: { organizationId } }), 0)
    await db.event.create({ data: { id: eventId, organizationId, title: "Atelier des emails", slug: "atelier-des-emails", startDate: new Date("2026-11-07T00:00:00Z"), endDate: new Date("2026-11-07T00:00:00Z"), publicStatus: "draft", isListed: false, remindersEnabled: false } })
  }
  const shift = await db.shift.findUnique({ where: { id: shiftId } })
  if (shift) assert(shift.eventId === eventId && shift.roleName === "Accueil")
  else {
    assert.equal(await db.shift.count({ where: { eventId } }), 0)
    await db.shift.create({ data: { id: shiftId, eventId, roleName: "Accueil", label: "Accueil de démonstration", date: new Date("2026-11-07T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 5, status: "open" } })
  }
  for (const [id, label, token] of [["video-delivery-registration", "wrong", "demo-delivery-corrected-registration"], ["video-delivery-registration-partial", "recoverable", "demo-delivery-partial-registration"]]) {
    const volunteerId = `video-delivery-member-${label}`
    assert.equal((await db.volunteer.findUniqueOrThrow({ where: { id: volunteerId } })).organizationId, organizationId)
    const previous = await db.registration.findUnique({ where: { id } })
    if (previous) assert(previous.eventId === eventId && previous.volunteerId === volunteerId && previous.shiftId === shiftId && previous.status === "active")
    else await db.registration.create({ data: { id, eventId, volunteerId, shiftId, status: "active", source: "admin_manual", ...registrationToken.data(token) } })
  }
  assert.equal(await db.registration.count({ where: { eventId } }), 2)
  console.log("✓ Owned delivery classroom: one event, one shift, Léa and Emma registered; existing records preserved")
}
