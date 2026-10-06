// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { linkToken } from "../../src/lib/token-vault"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Local video environment required")
  const proofPath = "videos/output/privacy-personal-links/preparation.json"
  const proof = JSON.parse(await readFile(proofPath, "utf8"))
  assert.equal(proof.crossOrganizationDetailRefusedBothWays, true)
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.privacy.a.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    const invite = await db.memberInvite.findFirstOrThrow({ where: { eventId: "video-privacy-a-event", volunteerId: "video-privacy-a-member-3" } })
    const invitePath = `/api/public/member-invite/${linkToken.reveal(invite)}?slug=fete-des-liens`
    const own = await page.request.get(`${base}${invitePath}&org=formation-confidentialite-a`)
    assert.equal(own.status(), 200)
    const member = (await own.json()).member
    assert.equal(member.email, "video.privacy.a.member.3@example.org")
    const other = await page.request.get(`${base}${invitePath}&org=formation-confidentialite-b`)
    assert.equal(other.status(), 404)
    assert.deepEqual(await other.json(), { error: "Lien invalide" })
    const leader = await db.sectorLeader.findUniqueOrThrow({ where: { id: proof.leaderId } })
    const leaderPath = `/api/public/leader/${linkToken.reveal(leader)}`
    const removed = await page.request.delete(`${base}/api/admin/events/video-privacy-a-event/sector-leaders/${leader.id}`)
    assert.equal(removed.status(), 200)
    const oldLink = await page.request.get(`${base}${leaderPath}`)
    assert.equal(oldLink.status(), 404)
    assert.deepEqual(await oldLink.json(), { error: "Lien introuvable." })
    const inboxResponse = await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")
    assert.equal(inboxResponse.status(), 200)
    const inbox = await inboxResponse.json() as { messages: { ID: string; To: { Address: string }[] }[] }
    const received: { recipient: string; mailId: string; personalLink: boolean }[] = []
    for (const [recipient, personalLink] of [["video.privacy.a.new@example.org", true], ["video.privacy.a.member.0@example.org", true], ["video.privacy.a.member.3@example.org", false]] as const) {
      const mail = inbox.messages.find(item => item.To.some(to => to.Address === recipient))
      assert(mail, "Expected actual fictitious email missing")
      const response = await page.request.get(`http://localhost:48026/api/v1/message/${mail.ID}`)
      const content = await response.json() as { Text: string }
      assert(personalLink ? content.Text.includes("/my/") : content.Text.includes("?token="), "Actual email must contain the expected kind of link")
      received.push({ recipient, mailId: mail.ID, personalLink })
    }
    await writeFile(proofPath, JSON.stringify({ ...proof, detailsCheckedAt: new Date().toISOString(), actualEmailsReceived: received, invitationPrefillsOwnMemberOnly: true, invitationRefusedOnOtherOrganization: true, leaderRevocationRefusesOldLink: true }, null, 2))
    console.log("✓ Three actual received emails, invitation scoped to its organization, revoked leader link refused; no tokens retained in proof")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
