// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { linkToken, registrationToken } from "../../src/lib/token-vault"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Isolated local video environment required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const a = await browser.newPage(), b = await browser.newPage(), publicPage = await browser.newPage()
    for (const [side, page] of [["a", a], ["b", b]] as const) {
      await page.goto(`${base}/admin/login`)
      await page.getByLabel("Email", { exact: true }).fill(`video.privacy.${side}.owner@example.org`)
      await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await page.getByRole("button", { name: "Se connecter", exact: true }).click()
      await page.waitForURL(/\/admin\/events/)
      const response = await page.request.get(`${base}/api/admin/events/video-privacy-${side}-event`)
      assert.equal(response.status(), 200, "Own event must be accessible")
      const other = await page.request.get(`${base}/api/admin/events/video-privacy-${side === "a" ? "b" : "a"}-event`)
      assert.equal(other.status(), 404, "Other organization event must be refused")
    }
    const people = await db.volunteer.findMany({ where: { organizationId: { in: ["video-privacy-a", "video-privacy-b"] } } })
    assert.equal(people.length, 10)
    assert(people.every(person => /^video\.privacy\.[ab]\.member\.[0-4]@example\.org$/.test(person.email ?? "")))
    const leaA = people.find(person => person.id === "video-privacy-a-member-0")!
    const leaB = people.find(person => person.id === "video-privacy-b-member-0")!
    assert.equal(leaA.firstName, leaB.firstName)
    assert.notEqual(leaA.email, leaB.email)
    const assigned = await a.request.post(`${base}/api/admin/events/video-privacy-a-event/sector-leaders`, { data: { roleName: "Accueil", name: "Camille Exemple", email: "video.privacy.a.leader@example.org" } })
    assert.equal(assigned.status(), 201, "Actual leader creation required; rerun seed before repeating")
    const leader = await db.sectorLeader.findFirstOrThrow({ where: { eventId: "video-privacy-a-event", roleName: "Accueil" } })
    const rosterResponse = await publicPage.request.get(`${base}/api/public/leader/${linkToken.reveal(leader)}`)
    assert.equal(rosterResponse.status(), 200)
    const roster = await rosterResponse.json()
    assert.equal(roster.registrations.length, 2)
    for (const reg of roster.registrations) {
      assert(["video-privacy-a-registration-0", "video-privacy-a-registration-1"].includes(reg.id))
      assert.deepEqual(Object.keys(reg.volunteer).sort(), ["email", "firstName", "lastName", "phone"])
      assert(reg.volunteer.phone.startsWith("+41 79 000 1"))
      assert.equal(reg.volunteer.notes, undefined)
    }
    const registration = await db.registration.findUniqueOrThrow({ where: { id: "video-privacy-a-registration-0" } })
    const personalResponse = await publicPage.request.get(`${base}/api/public/registrations/${registrationToken.reveal(registration)}`)
    assert.equal(personalResponse.status(), 200)
    const personal = await personalResponse.json()
    assert.equal(personal.registrations.length, 1)
    assert.equal(personal.registrations[0].id, registration.id)
    assert.equal(personal.volunteer.email, leaA.email)
    assert.equal(personal.volunteer.notes, undefined)
    assert.equal(personal.volunteer.availabilityPeriods[0], "morning")
    const registrationResponse = await publicPage.request.post(`${base}/api/public/registrations?org=formation-confidentialite-a`, { data: { eventId: "video-privacy-a-event", shiftIds: ["video-privacy-a-shift-0"], firstName: "Jules", lastName: "Exemple", email: "video.privacy.a.new@example.org", phone: "+41 79 000 1999", consent: true } })
    assert.equal(registrationResponse.status(), 201)
    const signup = await registrationResponse.json()
    assert.equal(signup.editToken, null)
    assert.equal(signup.linkSentByEmail, true)
    const replies = []
    for (const email of [leaA.email, "video.privacy.unknown@example.org", leaB.email]) {
      const response = await publicPage.request.post(`${base}/api/public/registrations/link?org=formation-confidentialite-a`, { data: { email } })
      assert.equal(response.status(), 200)
      replies.push(await response.json())
    }
    assert.deepEqual(replies[0], replies[1])
    assert.deepEqual(replies[0], replies[2])
    assert.deepEqual(Object.keys(replies[0]).sort(), ["message", "ok"])
    const invited = await a.request.post(`${base}/api/admin/events/video-privacy-a-event/invitations`, { data: { volunteerIds: ["video-privacy-a-member-3"], message: "Invitation fictive à découvrir les missions de la fête." } })
    assert.equal(invited.status(), 201)
    assert.equal((await invited.json()).emailsSent, 1)
    await publicPage.waitForTimeout(1500)
    const forbidden = await db.notificationOutbox.count({ where: { organizationId: "video-privacy-b" } })
    assert.equal(forbidden, 0, "Recovery from A must not email B")
    const proof = { checkedAt: new Date().toISOString(), crossOrganizationDetailRefusedBothWays: true, homonymsHaveDistinctAddresses: true, personalPageOwnRegistrationOnly: true, personalAvailabilityVisibleNotesAbsent: true, leaderRosterOwnRoleOnly: true, leaderContactVisibleNotesAbsent: true, anonymousSignupDoesNotReturnPersonalToken: true, recoveryResponsesIdenticalWithoutPersonalData: true, recoveryDoesNotEmailOtherOrganization: true, actualInvitationSent: true, leaderId: leader.id, fixtureModified: true, audiovisualValidated: false }
    await mkdir("videos/output/privacy-personal-links", { recursive: true })
    await writeFile("videos/output/privacy-personal-links/preparation.json", JSON.stringify(proof, null, 2))
    console.log("✓ Actual local routes: organization isolation, scoped leader/personal views, signup without exposed token, identical recovery responses and real invitation")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
