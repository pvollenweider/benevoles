// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real public versus invitation success, scoped to the synthetic errors fixture. */
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { linkToken, registrationToken } from "../../src/lib/token-vault"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(url.hostname === "localhost" && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  const browser = await chromium.launch()
  const eventId = "video-errors-event", directory = path.resolve("videos/output/volunteer-confirmation-errors/server-preflight")
  await mkdir(directory, { recursive: true })
  try {
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { organization: true } })
    assert(event.organizationId === "video-errors" && event.organization.slug === "formation-erreurs" && event.title === "Inscription robuste — démonstration")
    if (process.argv.includes("--finish-readonly")) {
      const regs = await db.registration.findMany({ where: { eventId }, include: { volunteer: true } })
      assert.equal(regs.length, 4)
      const ordinary = regs.filter(reg => reg.volunteer.email === "video.errors.zoe@example.org")
      const personal = regs.filter(reg => reg.volunteerId === "video-errors-aline" && reg.shiftId === "video-errors-shift-2")
      assert(ordinary.length === 1 && personal.length === 1 && ordinary[0].source === "public_form" && personal[0].source === "public_form")
      const invitation = await db.memberInvite.findFirstOrThrow({ where: { eventId, volunteerId: "video-errors-aline" } })
      assert(invitation.usedAt)
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.goto(`http://localhost:43102/my/${registrationToken.reveal(personal[0])}`)
      await page.getByRole("heading", { name: "Mes inscriptions", exact: true }).waitFor()
      await page.getByRole("button", { name: /^Annuler le créneau Logistique/ }).waitFor()
      await page.screenshot({ path: path.join(directory, "invited-personal-result.png") })
      const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
      const mail = inbox.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => item.Subject.includes("Inscription confirmée") && item.To.some((to: { Address: string }) => to.Address === "video.errors.zoe@example.org"))
      assert(mail)
      const received = await (await page.request.get(`http://localhost:48026/api/v1/message/${mail.ID}`)).json()
      assert(received.Text.includes("/my/"))
      await writeFile(path.join(directory, "success-comparison.json"), JSON.stringify({ checkedAt: new Date().toISOString(), completionMode: "read-only after original UI run reached personal page", ordinaryPublicRegistrationExists: true, invitedPublicRegistrationExists: true, inviteUsageRecorded: true, personalPageOpened: true, publicConfirmationMailId: mail.ID, publicConfirmationEmailHasPersonalLink: true, originalPublicSuccessScreenshot: "ordinary-success-no-personal-link.png", originalInvitedSuccessScreenshot: "invited-success-personal-link.png", noNewRegistrationOrInvitationOnResume: true, personalTokensStoredInReport: false, audiovisualValidated: false }, null, 2))
      console.log("✓ Completed comparison verified read-only: actual public registrations, used invitation, personal page and received ordinary confirmation email")
      return
    }
    assert.equal(await db.registration.count({ where: { eventId } }), 2, "Fresh comparison required; refusing to remove completed comparisons")
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const inboxBefore = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    const priorIds = new Set(inboxBefore.messages.map((mail: { ID: string }) => mail.ID))
    const open = async (role: string, token?: string) => {
      const route = new URL("http://localhost:43102/atelier-inscription")
      route.searchParams.set("org", "formation-erreurs")
      if (token) route.searchParams.set("token", token)
      await page.goto(route.toString())
      await page.getByRole("heading", { name: event.title, exact: true }).waitFor()
      await page.getByRole("button", { name: new RegExp(`^Sélectionner — ${role}`) }).click()
      await page.getByRole("button", { name: /^Continuer/ }).click()
    }
    const agree = async () => {
      const size = page.getByRole("radio", { name: "M", exact: true })
      if (await size.count()) await size.check()
      await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox").check()
      await page.locator("label").filter({ hasText: "J'accepte que l'association" }).getByRole("checkbox").check()
    }
    const submit = async () => {
      const response = page.waitForResponse(item => item.url().endsWith("/api/public/registrations") && item.request().method() === "POST")
      await page.getByRole("button", { name: "Confirmer mon inscription", exact: true }).click()
      const actual = await response
      assert.equal(actual.status(), 201)
      const body = await actual.json()
      await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      return body
    }
    await open("Vestiaire")
    await page.getByLabel("Prénom *", { exact: true }).fill("Zoé")
    await page.getByLabel("Nom *", { exact: true }).fill("Exemple")
    await page.getByLabel("Email *", { exact: true }).fill("video.errors.zoe@example.org")
    await agree()
    const publicResult = await submit()
    assert.equal(publicResult.editToken, null)
    assert.equal(await page.getByRole("link", { name: "Accéder à mon inscription" }).count(), 0)
    await page.screenshot({ path: path.join(directory, "ordinary-success-no-personal-link.png") })
    await page.goto("http://localhost:43102/admin/login")
    await page.getByLabel("Email", { exact: true }).fill("video.errors.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    const invited = await page.request.post(`http://localhost:43102/api/admin/events/${eventId}/invitations`, { data: { volunteerIds: ["video-errors-aline"], message: "Invitation fictive à choisir une autre mission disponible." } })
    assert.equal(invited.status(), 201)
    assert.equal((await invited.json()).emailsSent, 1)
    const invitation = await db.memberInvite.findFirstOrThrow({ where: { eventId, volunteerId: "video-errors-aline" } })
    await open("Logistique", linkToken.reveal(invitation))
    assert.equal(await page.getByLabel("Email *", { exact: true }).inputValue(), "video.errors.aline@example.org")
    assert.equal(await page.getByLabel("Prénom *", { exact: true }).inputValue(), "Aline")
    await agree()
    const invitedResult = await submit()
    assert(typeof invitedResult.editToken === "string" && invitedResult.editToken.length > 0)
    const link = page.getByRole("link", { name: "Accéder à mon inscription" })
    await link.waitFor()
    await page.screenshot({ path: path.join(directory, "invited-success-personal-link.png") })
    const href = await link.getAttribute("href")
    assert(href?.includes("/my/"))
    await link.click()
    await page.getByRole("heading", { name: "Mes inscriptions", exact: true }).waitFor()
    await page.getByRole("button", { name: /^Annuler le créneau Logistique/ }).waitFor()
    await page.screenshot({ path: path.join(directory, "invited-personal-result.png") })
    assert.equal(await db.registration.count({ where: { eventId, volunteerId: "video-errors-aline" } }), 2)
    assert((await db.memberInvite.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt)
    let inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    for (let attempt = 0; attempt < 40 && !inbox.messages.some((mail: { ID: string; Subject: string; To: { Address: string }[] }) => !priorIds.has(mail.ID) && mail.Subject.includes("Inscription confirmée") && mail.To.some((to: { Address: string }) => to.Address === "video.errors.zoe@example.org")); attempt++) {
      await page.waitForTimeout(250)
      inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    }
    const mail = inbox.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => !priorIds.has(item.ID) && item.Subject.includes("Inscription confirmée") && item.To.some((to: { Address: string }) => to.Address === "video.errors.zoe@example.org"))
    assert(mail, "New actual public confirmation email required")
    const received = await (await page.request.get(`http://localhost:48026/api/v1/message/${mail.ID}`)).json()
    assert(received.Text.includes("/my/"))
    await writeFile(path.join(directory, "success-comparison.json"), JSON.stringify({ checkedAt: new Date().toISOString(), publicSignupStatus: 201, publicResponseTokenAbsent: true, publicSuccessPersonalLinkAbsent: true, publicConfirmationNewMailId: mail.ID, publicConfirmationEmailHasPersonalLink: true, actualInvitationSent: true, invitationPrefilledCorrectMember: true, invitedSignupStatus: 201, invitedSuccessPersonalLinkPresent: true, personalPageOpened: true, inviteUsageRecorded: true, personalTokensStoredInReport: false, audiovisualValidated: false }, null, 2))
    console.log("✓ Real ordinary confirmation without exposed personal link, new confirmation email, invitation-prefilled signup and personal access verified")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/token=[^&\s]+/g, "token=[masked]").replace(/\/my\/[^?\s/]+/g, "/my/[masked]") : "Success comparison failed"); process.exitCode = 1 })
