// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { Cookie, Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"
import { PrismaClient } from "../../src/generated/prisma/client"
import { pgAdapter } from "../../src/lib/prisma-adapter"
import { openPayload } from "../../src/lib/notifications/outbox"
import { FRONT_DESK_EMAIL, FRONT_DESK_EVENT, FRONT_DESK_ORG, verifyFrontDeskFixture } from "../../scripts/seed-video-front-desk"
import { fullNameOf } from "./fixture-names"
import { writeFile } from "node:fs/promises"
import path from "node:path"
type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
export async function recordFrontDesk(options: { page: Page; base: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, scene, tap, settle } = options
  assert.equal(base, "https://formation-accueil.benevol.app")
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: pgAdapter(url.href) })
  const ownerUrl = `${base}/admin/events/${FRONT_DESK_EVENT}/day-of`
  const guestBase = "https://www.benevol.app", guestUrl = `${guestBase}/admin/front-desk/events/${FRONT_DESK_EVENT}`
  const mailbox = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"
  assert(/^http:\/\/(localhost|127\.0\.0\.1):48026$/.test(mailbox))
  const go = async (target: string) => { await page.goto(target); await settle(page) }
  const restore = async (cookies: Cookie[]) => { await page.goto("about:blank"); await page.context().clearCookies(); await page.context().addCookies(cookies) }
  const panel = () => page.locator("section").filter({ has: page.getByRole("heading", { name: /^Accès accueil \(/ }) })
  const openPanel = async () => { await tap(page, page.getByText("Gérer les accès accueil de cet événement", { exact: true })) }
  const responseFor = (action: string) => page.waitForResponse(r => r.url().endsWith(`/events/${FRONT_DESK_EVENT}/registrations/bulk`) && r.request().method() === "POST" && r.request().postDataJSON().action === action)
  let ownerCookies: Cookie[] = [], guestCookies: Cookie[] = []
  let mailId = ""
  const checks: Record<string, unknown> = { syntheticOnly: true, audiovisualValidated: false }
  try {
    await verifyFrontDeskFixture(db)
    assert.equal(await db.adminUser.count({ where: { email: FRONT_DESK_EMAIL } }), 0, "Fresh reset required")
    ownerCookies = await page.context().cookies()
    await go(ownerUrl)
    await scene("welcome", async () => { await page.screencast.showChapter(title, { duration: 2400 }) })
    await scene("invite", async at => {
      await at("En bas, ouvrons la gestion"); await panel().scrollIntoViewIfNeeded(); await openPanel()
      await at("Indiquons Colette Jensen et son adresse")
      await tap(page, panel().getByLabel("Prénom et nom", { exact: false })); await panel().getByLabel("Prénom et nom", { exact: false }).fill(fullNameOf("Colette"))
      await tap(page, panel().getByLabel("Email", { exact: false })); await panel().getByLabel("Email", { exact: false }).fill(FRONT_DESK_EMAIL)
      const pending = page.waitForResponse(r => r.url().endsWith(`/events/${FRONT_DESK_EVENT}/front-desk-access`) && r.request().method() === "POST")
      await tap(page, panel().getByRole("button", { name: "Inviter", exact: true })); assert((await pending).ok())
      await panel().getByText("Invitation envoyée", { exact: true }).waitFor()
      // Real queued email, made due off screen; the compiled cron and SMTP produce it.
      const heldUntil = new Date(Date.now() + 3600000)
      const pendingRows = await db.notificationOutbox.findMany({ where: { status: "pending" } })
      assert(pendingRows.every(row => { const email = openPayload(row.payload).recipient.email ?? ""; return email.endsWith("@example.org") || ["admin@localhost", "org-admin@localhost"].includes(email) }))
      const own = pendingRows.filter(row => row.organizationId === FRONT_DESK_ORG)
      assert(own.every(row => openPayload(row.payload).kind === "front_desk_invite" && openPayload(row.payload).recipient.email === FRONT_DESK_EMAIL))
      const held = pendingRows.filter(row => row.organizationId !== FRONT_DESK_ORG && row.nextAttemptAt <= new Date())
      try {
        for (const row of held) await db.notificationOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: heldUntil } })
        for (const row of own) await db.notificationOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
        const cron = await fetch("http://localhost:43102/api/cron/outbox", { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "local-video-fixture-cron-only"}` } }); assert(cron.ok)
        checks.realCron = await cron.json()
      } finally { for (const row of held) await db.notificationOutbox.updateMany({ where: { id: row.id, status: "pending", nextAttemptAt: heldUntil }, data: { nextAttemptAt: row.nextAttemptAt } }) }
      checks.invitationQueuedByProduct = true
    })
    type Mail = { ID: string; To: { Address: string }[]; Subject: string }
    let actual: Mail | undefined
    for (let i = 0; i < 60 && !actual; i++) {
      const messages: Mail[] = (await (await page.request.get(`${mailbox}/api/v1/messages?limit=1000`)).json()).messages
      actual = messages.find(m => m.To.length === 1 && m.To[0].Address === FRONT_DESK_EMAIL && m.Subject.includes("votre accès accueil pour Fête du parc — accueil"))
      if (!actual) await page.waitForTimeout(200)
    }
    assert(actual, "Actual invitation missing"); mailId = actual.ID
    await go(`${mailbox}/view/${mailId}`)
    const activation = page.frameLocator("iframe").getByRole("link", { name: "Choisir mon mot de passe", exact: true })
    await activation.waitFor()
    const receivedUrl = new URL((await activation.getAttribute("href"))!)
    assert(receivedUrl.origin === guestBase && receivedUrl.pathname === "/admin/accept-invite")
    await scene("email", async at => {
      await at("Ouvrons ce lien pour activer")
      await page.context().clearCookies()
      const popup = page.waitForEvent("popup"); await tap(page, activation); const opened = await popup
      assert.equal(opened.url(), receivedUrl.href); await opened.close(); await page.bringToFront(); await go(receivedUrl.href)
    })
    const password = "Colette-Accueil-2026!"
    await scene("activate", async at => {
      await tap(page, page.getByLabel("Nouveau mot de passe", { exact: true })); await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(password)
      await tap(page, page.getByLabel("Confirmer le mot de passe", { exact: true })); await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill(password)
      await tap(page, page.getByRole("button", { name: "Créer mon mot de passe", exact: true }))
      await page.getByRole("heading", { name: "Mot de passe créé", exact: true }).waitFor()
      await at("Connectons-nous avec son adresse")
      await tap(page, page.getByRole("link", { name: "Se connecter", exact: true }))
      await tap(page, page.getByLabel("Email", { exact: true })); await page.getByLabel("Email", { exact: true }).fill(FRONT_DESK_EMAIL)
      await tap(page, page.getByLabel("Mot de passe", { exact: true })); await page.getByLabel("Mot de passe", { exact: true }).fill(password)
      await tap(page, page.getByRole("button", { name: "Se connecter", exact: true }))
      await page.waitForURL(/\/admin\/front-desk$/); await page.getByRole("heading", { name: "Accès accueil", exact: true }).waitFor()
      guestCookies = await page.context().cookies()
    })
    await scene("scope", async () => {
      await tap(page, page.getByRole("link", { name: /^Ouvrir le pointage/ }))
      await page.getByRole("heading", { name: "Fête du parc — accueil", exact: true }).waitFor()
      assert.equal(await page.getByRole("button", { name: "Ajouter un besoin", exact: true }).count(), 0)
      assert.equal(await page.getByText("video.frontdesk.0@example.org", { exact: true }).count(), 0)
      await page.getByRole("link", { name: `Appeler ${fullNameOf("Zoé")} au 079 000 10 00`, exact: true }).waitFor()
    })
    const mark = async (action: string, label: string, next: string) => {
      const pending = responseFor(action)
      await tap(page, page.getByRole("button", { name: `${label}, ${fullNameOf("Zoé")}`, exact: true })); assert((await pending).ok())
      await page.getByRole("button", { name: `${next}, ${fullNameOf("Zoé")}`, exact: true }).waitFor()
    }
    await scene("marks", async at => {
      await mark("check_in", "Marquer présent", "Annuler la présence")
      await at("Marquons ce départ"); await mark("mark_left_early", "Marquer parti avant la fin", "Annuler le départ")
      await at("Annuler le départ retrouve"); await mark("undo_left_early", "Annuler le départ", "Annuler la présence")
      const persisted = await db.registration.findUniqueOrThrow({ where: { id: "video-frontdesk-registration-0" } })
      assert(persisted.checkedInAt && persisted.attendanceStatus === null); checks.realAttendancePersisted = true
    })
    await scene("end", async () => { await go(`${guestBase}/admin/front-desk`); await page.getByRole("link", { name: /^Ouvrir le pointage/ }).waitFor() })
    await scene("revoke", async at => {
      await restore(ownerCookies); await go(ownerUrl); await panel().scrollIntoViewIfNeeded(); await openPanel()
      await at("Sur la ligne de Colette")
      await tap(page, panel().getByRole("button", { name: /Révoquer/ }))
      const dialog = page.getByRole("alertdialog"); await dialog.waitFor(); await page.waitForTimeout(600)
      const revoked = page.waitForResponse(r => r.url().includes(`/events/${FRONT_DESK_EVENT}/front-desk-access/`) && r.request().method() === "DELETE")
      await tap(page, dialog.getByRole("button", { name: "Révoquer", exact: true })); assert((await revoked).ok())
      await panel().getByText("Révoqué", { exact: true }).waitFor()
      await at("Revenons au compte de Colette")
      await restore(guestCookies); await go(guestUrl); await page.waitForURL(/\/admin\/front-desk$/)
      await page.getByText("Vous n'avez plus d'accès en cours.", { exact: false }).waitFor()
      assert.equal(await page.getByRole("link", { name: /^Ouvrir le pointage/ }).count(), 0)
      checks.revocationRefusedPointage = true
    })
    await writeFile(path.join(directory, "front-desk-checks.json"), JSON.stringify({ ...checks, checkedAt: new Date().toISOString(), realMailId: mailId }, null, 2))
  } finally { await db.$disconnect() }
}
