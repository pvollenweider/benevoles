// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real delivery journey, with freshly received emails checked per take. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Page, Locator } from "playwright"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { controlledSmtp } from "./controlled-smtp"
import { loadCurrentDeliveryRuntime } from "../tools/prepare-delivery"
import { verifyProductBuild } from "./product-build"
import { loadManifest, type AudioMetadata } from "./manifest"

export async function validateDeliveryNarration(directory: string) {
  const manifest = await loadManifest("EMAIL_DELIVERY_FAILURES")
  const audio: AudioMetadata = JSON.parse(await readFile(path.join(directory, "audio-metadata.json"), "utf8"))
  const audit: { segments: { id: string; expected: string; audioSha256: string; needsReview: boolean }[] } = JSON.parse(await readFile(path.join(directory, "narration-audit.json"), "utf8"))
  assert(audio.model === "gemini-3.8-flash-tts" && audio.voice === manifest.voice && manifest.continuousNarration)
  const generation = audio.segments[manifest.segments[0].id]?.generationSha256
  assert(generation)
  for (const segment of manifest.segments) {
    const metadata = audio.segments[segment.id]
    const checked = audit.segments.find(item => item.id === segment.id)
    assert(metadata && metadata.generationSha256 === generation && checked && checked.expected === segment.transcript && !checked.needsReview, "Current continuous delivery narration audit required")
    const bytes = await readFile(path.join(directory, metadata.file))
    assert.equal(createHash("sha256").update(bytes).digest("hex"), checked.audioSha256)
  }
}

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
export async function recordDeliveryStates(options: {
  page: Page; base: string; directory: string; title: string; db: PrismaClient;
  scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void>;
}) {
  const { page, base, directory, title, db, scene, tap, settle } = options
  assert.equal(base, "http://localhost:43106")
  const proof = JSON.parse(await readFile(path.join(directory, "outbox-preparation.json"), "utf8"))
  assert.equal(proof.organizationId, "video-delivery")
  const product = await verifyProductBuild("http://localhost:43106")
  assert(proof.product?.commit === product.commit && proof.product?.buildId === product.buildId && proof.product?.productSourceSha256 === product.productSourceSha256, "Outbox fixture must be produced by current-main worker, not an old checkout")
  const expected = { pending: ["pending", 0], retrying: ["pending", 1], recoverable: ["failed", 6], wrong: ["failed", 1], sent: ["sent", 0] } as const
  for (const [label, [status, attempts]] of Object.entries(expected)) {
    const row = await db.notificationOutbox.findUniqueOrThrow({ where: { id: proof.ids[label] } })
    assert(row.organizationId === proof.organizationId && row.status === status && row.attempts === attempts, "Fresh real SMTP/outbox preparation required")
  }
  const go = async () => { await page.goto(`${base}/admin/settings/notifications`); await settle(page) }
  const rowFor = (label: string) => page.getByRole("row").filter({ hasText: `video.delivery.${label}@example.org` })
  const checks: Record<string, unknown> = { actualInitialWorkerStates: true }
  await go()
  await scene("welcome", async at => {
    await page.screencast.showChapter(title, { description: "Lire l'état, vérifier la cause, choisir le bon envoi", duration: 6000 })
    await at(0.18)
    await rowFor("pending").scrollIntoViewIfNeeded()
    assert(await rowFor("pending").isVisible(), "Owner's actual delivery history must be visible while described")
    await at(0.58)
    // Switch to the real synthetic organizer account, rather than injecting a
    // role or hiding the owner's form with CSS. Keep this account for the rest.
    await page.goto("about:blank")
    await page.context().clearCookies()
    await page.goto(`${base}/admin/login`)
    await tap(page, page.getByLabel("Email", { exact: true }))
    await page.getByLabel("Email", { exact: true }).pressSequentially("video.delivery.organizer@example.org", { delay: 110 })
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await tap(page, page.getByRole("button", { name: "Se connecter", exact: true }))
    await page.waitForURL(/\/admin\/events/)
    await go()
    await page.getByText("Votre rôle : organisateur. Ces réglages sont réservés aux propriétaires de l'organisation.", { exact: true }).scrollIntoViewIfNeeded()
    checks.actualOrganizerReadOnlySettings = true
  })
  await scene("states", async at => {
    for (const [index, label] of ["pending", "retrying", "sent", "wrong"].entries()) {
      await at(0.08 + index * 0.21)
      const row = rowFor(label)
      await row.scrollIntoViewIfNeeded()
      assert(await row.count() === 1, "Prepared delivery row absent or duplicated")
    }
    // Educational annotation, explicitly a timing shortcut, not an altered state.
    await page.evaluate(() => {
      const note = document.createElement("div")
      note.id = "video-delivery-time-note"
      note.textContent = "Démonstration : les délais entre les six essais réels ont été accélérés."
      note.style.cssText = "position:fixed;bottom:18px;left:10%;width:80%;padding:14px;box-sizing:border-box;background:#172033;color:white;border-radius:10px;text-align:center;font:18px/1.4 Arial,sans-serif;z-index:2147483647;pointer-events:none"
      document.body.append(note)
    })
    await at(0.94)
    await page.evaluate(() => document.getElementById("video-delivery-time-note")?.remove())
  })
  await scene("reason", async at => {
    await rowFor("wrong").scrollIntoViewIfNeeded()
    const wrongText = await rowFor("wrong").innerText()
    assert(wrongText.includes("Refus définitif du serveur d'envoi") && wrongText.includes("Adresse à vérifier"))
    assert(!wrongText.includes("Synthetic recipient rejected") && !wrongText.includes("550 5.1.1"), "Raw SMTP recipient details must stay out of UI")
    await at(0.55)
    await rowFor("retrying").scrollIntoViewIfNeeded()
  })
  await scene("retry", async at => {
    const before = await db.notificationOutbox.findUniqueOrThrow({ where: { id: proof.ids.recoverable } })
    const inboxBefore = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    const priorIds = new Set(inboxBefore.messages.map((mail: { ID: string }) => mail.ID))
    await rowFor("recoverable").scrollIntoViewIfNeeded()
    await at(0.18)
    await tap(page, rowFor("recoverable").getByRole("button", { name: /^Renvoyer/ }))
    await page.getByRole("status").filter({ hasText: "Renvoi programmé" }).waitFor()
    let after = await db.notificationOutbox.findUniqueOrThrow({ where: { id: before.id } })
    for (let attempt = 0; attempt < 40 && after.status !== "sent"; attempt++) {
      await page.waitForTimeout(250)
      after = await db.notificationOutbox.findUniqueOrThrow({ where: { id: before.id } })
    }
    assert(after.status === "sent" && JSON.stringify(after.payload) === JSON.stringify(before.payload))
    await at(0.45)
    await go()
    await rowFor("recoverable").scrollIntoViewIfNeeded()
    assert((await rowFor("recoverable").innerText()).includes("Envoyé"))
    const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    const mail = inbox.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => !priorIds.has(item.ID) && item.Subject === "Formation — recoverable — Atelier des emails" && item.To.some(to => to.Address === "video.delivery.recoverable@example.org"))
    assert(mail, "Actual new retry email required")
    await at(0.62)
    await page.goto(`http://localhost:48026/view/${mail.ID}`)
    await settle(page)
    await page.frameLocator("iframe").getByText("Données fictives. Rendez-vous au stand quinze minutes avant votre créneau.", { exact: true }).filter({ visible: true }).first().waitFor()
    checks.actualRetryMailId = mail.ID
    checks.samePayloadOnRetry = true
  })
  return checks
}

export async function recordDelivery(options: Parameters<typeof recordDeliveryStates>[0]) {
  const { page, base, directory, scene, tap, settle } = options
  assert.equal(base, "http://localhost:43106")
  const runtime = await loadCurrentDeliveryRuntime("http://localhost:43106")
  const { db, deliverOutbox } = runtime
  const fixture = await controlledSmtp().catch(async error => { await db.$disconnect(); await runtime.unregister(); throw error })
  try {
    const checks = await recordDeliveryStates({ ...options, db })
    const eventId = "video-delivery-event"
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId } })
    assert(event.organizationId === "video-delivery" && event.title === "Atelier des emails")
    const regs = await db.registration.findMany({ where: { eventId, status: "active" } })
    assert(regs.length === 2 && regs.every(reg => ["video-delivery-member-wrong", "video-delivery-member-recoverable"].includes(reg.volunteerId)))
    assert.equal(await db.targetedMessage.count({ where: { eventId } }), 0)
    const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
    const write = async (field: Locator, text: string) => { await tap(page, field); await field.press("ControlOrMeta+A"); await field.pressSequentially(text, { delay: 110 }) }
    const send = async (subject: string, message: string, beforePreview?: () => Promise<void>) => {
      await go(`/admin/events/${eventId}/message`)
      await write(page.getByLabel("Objet *", { exact: true }), subject)
      await write(page.getByLabel("Message *", { exact: true }), message)
      if (beforePreview) await beforePreview()
      await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true }))
      await tap(page, page.getByRole("dialog", { name: "Aperçu de l'email" }).getByRole("button", { name: "Envoyer à 2 personnes", exact: true }))
      await tap(page, page.getByRole("dialog", { name: "Confirmer l'envoi" }).getByRole("button", { name: "Confirmer l'envoi", exact: true }))
      await page.getByRole("heading", { name: "Message envoyé à 2 personnes", exact: true }).waitFor()
      return db.targetedMessage.findFirstOrThrow({ where: { eventId, subject }, orderBy: { createdAt: "desc" } })
    }
    const waitDelivered = async (id: string) => {
      let row = await db.notificationOutbox.findUniqueOrThrow({ where: { id } })
      for (let n = 0; n < 40 && row.status !== "sent"; n++) { await page.waitForTimeout(250); row = await db.notificationOutbox.findUniqueOrThrow({ where: { id } }) }
      assert.equal(row.status, "sent")
      return row
    }
    await scene("address", async at => {
      const wrong = await db.notificationOutbox.findFirstOrThrow({ where: { organizationId: "video-delivery", dedupeKey: "video-delivery-preparation:wrong" } })
      await go("/admin/members")
      const currentMember = await db.volunteer.findUniqueOrThrow({ where: { id: "video-delivery-member-wrong" } })
      assert(currentMember.organizationId === "video-delivery" && currentMember.firstName === "Léa")
      await at(0.065)
      await tap(page, page.getByRole("button", { name: `Éditer ${currentMember.firstName} ${currentMember.lastName}`, exact: true }))
      const dialog = page.getByRole("dialog", { name: "Modifier le membre" })
      await write(dialog.getByLabel("Email", { exact: true }), "video.delivery.corrected@example.org")
      await tap(page, dialog.getByRole("button", { name: "Enregistrer", exact: true }))
      await dialog.waitFor({ state: "hidden" })
      assert.equal((await db.volunteer.findUniqueOrThrow({ where: { id: "video-delivery-member-wrong" } })).email, "video.delivery.corrected@example.org")
      await at(0.16); await go("/admin/settings/notifications")
      await page.getByRole("row").filter({ hasText: "video.delivery.wrong@example.org" }).scrollIntoViewIfNeeded()
      assert(JSON.stringify((await db.notificationOutbox.findUniqueOrThrow({ where: { id: wrong.id } })).payload) === JSON.stringify(wrong.payload))
      await at(0.44)
      const inboxBefore = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
      const priorIds = new Set(inboxBefore.messages.map((mail: { ID: string }) => mail.ID))
      // A short, actual operational instruction remains readable at the same
      // natural typing speed; do not accelerate keys to fit the narration.
      const history = await send("Formation — adresse corrigée", "Bonjour {prénom}, rendez-vous au stand. Merci !", () => at(0.65))
      const rows = await db.notificationOutbox.findMany({ where: { targetedMessageId: history.id } })
      assert.equal(rows.length, 2)
      for (const row of rows) await waitDelivered(row.id)
      const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
      const mail = inbox.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => !priorIds.has(item.ID) && item.Subject === "Formation — adresse corrigée — Atelier des emails" && item.To.some(to => to.Address === "video.delivery.corrected@example.org"))
      assert(mail, "Actual new corrected-address email required")
      await at(0.82); await page.goto(`http://localhost:48026/view/${mail.ID}`); await settle(page)
      checks.correctedRecipientMailId = mail.ID; checks.correctedRecipientMailIsNew = true; checks.oldPayloadUnchanged = true
    })
    await scene("campaign", async at => {
      fixture.rejected.add("video.delivery.recoverable@example.org")
      const history = await send("Formation — échec partiel", "Bonjour {prénom}, merci pour ton aide !")
      let rows = await db.notificationOutbox.findMany({ where: { targetedMessageId: history.id } })
      // Wait for BOTH actual outcomes; the permanent rejection can finish before
      // the other recipient's independent Mailpit relay. Never infer delivery.
      for (let n = 0; n < 120 && !(rows.some(row => row.attempts === 1 && row.status === "failed") && rows.some(row => row.status === "sent")); n++) { await page.waitForTimeout(250); rows = await db.notificationOutbox.findMany({ where: { targetedMessageId: history.id } }) }
      const failed = rows.find(row => row.attempts === 1 && row.status === "failed")
      const successful = rows.find(row => row.status === "sent")
      assert(failed && successful, `Actual partial campaign outcomes required: ${JSON.stringify(rows.map(row => ({ status: row.status, attempts: row.attempts, error: row.lastError })))}`)
      // A real permanent 550 stops immediately on current main. Advancing the
      // clock must not invent five more SMTP exchanges for this campaign.
      const now = new Date(Math.max(Date.now(), failed.nextAttemptAt.getTime()) + 1)
      const refusedAgain = await deliverOutbox({ ids: [failed.id], now })
      assert.equal(refusedAgain.sent, 0)
      assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } })).attempts, 1)
      await at(0.43); await go(`/admin/events/${eventId}/message`)
      const article = page.getByRole("article").filter({ has: page.locator(`[id="msg-${history.id}"]`) })
      await article.scrollIntoViewIfNeeded()
      assert((await article.innerText()).includes("1 envoyé, 1 en échec"))
      await at(0.45); await tap(page, article.locator("summary"))
      fixture.rejected.delete("video.delivery.recoverable@example.org")
      await at(0.60); await tap(page, article.getByRole("button", { name: /^Renvoyer/ }))
      const used = article.getByRole("button", { name: /^Remis en file/ })
      await used.waitFor(); assert.equal(await used.getAttribute("aria-disabled"), "true")
      await waitDelivered(failed.id)
      const repeated = await page.request.post(`${base}/api/admin/events/${eventId}/messages/${history.id}/resend-failed`)
      assert.equal((await repeated.json()).resent, 0)
      assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { id: successful.id } })).sentAt?.toISOString(), successful.sentAt?.toISOString())
      await at(0.86); await go(`/admin/events/${eventId}/message`)
      const completed = page.getByRole("article").filter({ has: page.locator(`[id="msg-${history.id}"]`) })
      await completed.scrollIntoViewIfNeeded()
      assert((await completed.innerText()).includes("2 envoyés"))
      checks.campaignId = history.id; checks.onlyFailedResent = true; checks.repeatedResendCreatedNothing = true; checks.permanentFailureStoppedAfterOneAttempt = true
    })
    await scene("retention", async at => {
      await go("/admin/settings/notifications")
      await page.getByText(/Les emails envoyés sont effacés chaque nuit/).scrollIntoViewIfNeeded()
      await at(0.46); await go(`/admin/events/${eventId}/message`)
      await page.getByText(/Les messages sont conservés 12 mois/).scrollIntoViewIfNeeded()
    })
    await scene("result", async () => {
      await go("/admin/settings/notifications")
      await page.getByRole("row").filter({ hasText: "video.delivery.corrected@example.org" }).first().scrollIntoViewIfNeeded()
    })
    assert.equal(fixture.attempts.filter(attempt => !attempt.accepted).length, 1)
    assert.equal(fixture.attempts.find(attempt => !attempt.accepted)?.responseCode, 550)
    checks.smtpAttemptsDuringCapture = fixture.attempts
    await writeFile(path.join(directory, "capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks, audiovisualValidated: false }, null, 2))
  } finally { await fixture.close(); await db.$disconnect(); await runtime.unregister() }
}
