// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Locator, Page } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { linkToken } from "../../src/lib/token-vault"
import { loadManifest, type AudioMetadata } from "./manifest"
import { prepareRegistrationErrorFixture, registrationErrorFixtureIp } from "./prepare-registration-error-fixture"
import type { Cue } from "./sentence-timing"

const eventId = "video-errors-event", publicPath = "/atelier-inscription?org=formation-erreurs"
function database() { return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }) }

export async function validateRegistrationErrorNarration(directory: string) {
  const manifest = await loadManifest("VOLUNTEER_CONFIRMATION_ERRORS")
  const audio: AudioMetadata = JSON.parse(await readFile(path.join(directory, "audio-metadata.json"), "utf8"))
  const audit = JSON.parse(await readFile(path.join(directory, "narration-audit.json"), "utf8"))
  assert(audio.model === "gemini-3.8-flash-tts" && audio.voice === "Kore" && manifest.continuousNarration)
  const generation = audio.segments[manifest.segments[0].id]?.generationSha256
  assert(generation)
  for (const segment of manifest.segments) {
    const metadata = audio.segments[segment.id], checked = audit.segments.find((item: { id: string }) => item.id === segment.id)
    assert(metadata && metadata.generationSha256 === generation && checked?.expected === segment.transcript && checked.needsReview === false, "Current continuous narration audit required")
    assert.equal(createHash("sha256").update(await readFile(path.join(directory, metadata.file))).digest("hex"), checked.audioSha256)
  }
}

export async function prepareRegistrationErrorRecording(page: Page, base: string, directory: string) {
  assert.equal(base, "http://localhost:43102")
  const db = database()
  try {
    const proof = await prepareRegistrationErrorFixture(db, true)
    await writeFile(path.join(directory, "recording-preparation.json"), JSON.stringify({ preparedAt: new Date().toISOString(), ...proof }, null, 2))
    console.log(`Reset recorder-owned fictional fixture: ${proof.removedSyntheticPeople} people, ${proof.removedSyntheticOutboxRows} outbox rows; reproducible from seed. Other organizations untouched.`)
  } finally { await db.$disconnect() }
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": registrationErrorFixtureIp })
  await page.goto(`${base}/admin/login`)
  await page.getByLabel("Email", { exact: true }).fill("video.errors.owner@example.org")
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(/\/admin\/dashboard/)
  await page.goto(`${base}${publicPath}`)
  await page.getByRole("heading", { name: "Inscription robuste — démonstration", exact: true }).waitFor()
}

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
export async function recordRegistrationErrors(options: { page: Page; base: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, scene, tap, settle } = options
  assert.equal(base, "http://localhost:43102")
  const db = database()
  try {
    const checks: Record<string, unknown> = {}
    const inboxBefore = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    const priorIds = new Set(inboxBefore.messages.map((mail: { ID: string }) => mail.ID))
    const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
    const write = async (field: Locator, text: string) => { await tap(page, field); await field.pressSequentially(text, { delay: 110 }) }
    const agree = async () => {
      await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
      await tap(page, page.locator("label").filter({ hasText: "J'accepte que l'association" }).getByRole("checkbox"))
    }
    const form = async (role: string, name: string, email: string, token?: string, beforeConsent?: () => Promise<void>, beforeSelect?: () => Promise<void>) => {
      // Autre appareil : chaque persona ouvre son formulaire sans contact mémorisé.
      // Conserver les cookies organisateur et le préremplissage de l'invitation.
      await page.goto(`${base}${publicPath}`)
      await page.evaluate(() => localStorage.removeItem("benevoles_contact"))
      await go(`${publicPath}${token ? `&token=${encodeURIComponent(token)}` : ""}`)
      await beforeSelect?.()
      await tap(page, page.getByRole("button", { name: new RegExp(`, ${role}[^:]* : sélectionner`) }))
      await tap(page, page.getByRole("button", { name: /^Continuer/ }))
      if (!token) {
        // Les champs restent visiblement remplis, sans consommer les phrases suivantes.
        for (const [label, value] of [["Prénom *", name], ["Nom *", "Exemple"], ["Email *", email]]) {
          const field = page.getByLabel(label, { exact: true })
          await tap(page, field)
          await field.fill(value)
        }
      } else assert.equal(await page.getByLabel("Email *", { exact: true }).inputValue(), email)
      assert.equal(await page.getByText(/Coordonnées reprises/).count(), 0, "Autre appareil : aucun contact repris")
      await beforeConsent?.()
      await tap(page, page.getByRole("radio", { name: "M", exact: true }))
      await agree()
    }
    const submit = page.getByRole("button", { name: "Confirmer mon inscription", exact: true })
    const post = async (expected: number) => {
      const response = page.waitForResponse(item => item.url().endsWith("/api/public/registrations") && item.request().method() === "POST")
      await tap(page, submit)
      const actual = await response
      assert.equal(actual.status(), expected)
      return actual.json()
    }
    const mailFor = async (recipient: string) => {
      for (let n = 0; n < 40; n++) {
        const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
        const mail = inbox.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => !priorIds.has(item.ID) && item.Subject.includes("Inscription confirmée") && item.To.some((to: { Address: string }) => to.Address === recipient))
        if (mail) { await page.goto(`http://localhost:48026/view/${mail.ID}`); await settle(page); return mail.ID }
        await page.waitForTimeout(250)
      }
      throw new Error("New actual confirmation email required")
    }
    await scene("welcome", async () => { await page.screencast.showChapter(title, { description: "Comprendre l'erreur, reprendre et vérifier le résultat", duration: 2300 }) })
    await scene("form", async () => {
      await tap(page, page.getByRole("button", { name: /, Accueil[^:]* : sélectionner/ }))
      await tap(page, page.getByRole("button", { name: /^Continuer/ }))
      await write(page.getByLabel("Prénom *", { exact: true }), "Alex")
      await write(page.getByLabel("Nom *", { exact: true }), "Exemple")
      await write(page.getByLabel("Email *", { exact: true }), "video.errors.alex@example.org")
      await write(page.getByLabel(/Téléphone/), "079 000 12 34")
      await agree()
    })
    await scene("validation", async at => {
      await at("Confirmer affiche la question à"); await tap(page, submit)
      await page.locator('[role="alert"]').first().waitFor()
      await at("choisis une taille, puis tu"); await tap(page, page.getByRole("radio", { name: "M", exact: true }))
    })
    await scene("capacity", async at => {
      const response = await page.request.patch(`${base}/api/admin/shifts/video-errors-shift-0`, { data: { capacity: 1 } })
      assert.equal(response.status(), 200)
      await at("La confirmation répond Ta sélection"); await post(409)
      await page.getByText("Ta sélection n'est plus disponible", { exact: true }).waitFor()
      await at("Une place visible quelques minutes"); await page.getByLabel("Email *", { exact: true }).scrollIntoViewIfNeeded()
      checks.actualCapacityRefusal = true
    })
    await scene("network", async at => {
      assert.equal((await page.request.patch(`${base}/api/admin/shifts/video-errors-shift-0`, { data: { capacity: 3 } })).status(), 200)
      await page.route("**/api/public/registrations", route => route.abort("internetdisconnected"))
      await tap(page, submit)
      await page.getByText("Connexion interrompue", { exact: true }).waitFor()
      assert.equal(await db.registration.count({ where: { eventId } }), 1)
      await at("Après retour de la connexion,"); await page.unroute("**/api/public/registrations")
      assert.equal((await post(201)).editToken, null)
      checks.interruptionBeforeCommit = true
    })
    await scene("success", async at => {
      await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      assert.equal(await page.getByRole("link", { name: "Accéder à mon inscription" }).count(), 0)
      await at("il n’est pas affiché simplement")
      checks.publicSuccessDoesNotExposeToken = true
    })
    await scene("email", async () => { checks.publicConfirmationMailId = await mailFor("video.errors.alex@example.org") })
    await scene("overlap", async at => {
      await form("Vestiaire", "Aline", "video.errors.aline@example.org", undefined, undefined, async () => { await at("Essayons le vestiaire") })
      const before = await db.registration.count({ where: { eventId } })
      await at("Remplissons le formulaire et confirmons.")
      const refusal = await post(409)
      assert(/chevauch/i.test(refusal.error))
      const overlapMessage = page.locator('[role="alert"]').filter({ hasText: /chevauch/i }).first()
      await overlapMessage.waitFor()
      await overlapMessage.scrollIntoViewIfNeeded()
      await settle(page)
      // The response assertion alone can finish before the browser paints the error.
      // Keep the actual result on screen even when slow typing exhausts the cue.
      await at("Pour continuer, reviens au planning")
      await page.waitForTimeout(1800)
      assert.equal(await db.registration.count({ where: { eventId } }), before)
      checks.actualOverlapRefused = true
    })
    await scene("response-loss", async at => {
      await form("Logistique", "Nicolas", "video.errors.nicolas@example.org", undefined, undefined, async () => { await at("Nicolas choisit la logistique") })
      let committed = 0
      await page.route("**/api/public/registrations", async route => { const result = await route.fetch(); committed = result.status(); await route.abort("internetdisconnected") })
      await at("Le formulaire affiche Connexion interrompue"); await tap(page, submit)
      await page.getByText("Connexion interrompue", { exact: true }).waitFor()
      assert.equal(committed, 201)
      await page.unroute("**/api/public/registrations")
      await at("Rétablissons la connexion et confirmons")
      assert(/^Tu as déjà une inscription pour l'un de ces créneaux\./.test((await post(409)).error))
      const duplicateMessage = page.locator('[role="alert"]').filter({ hasText: /Tu as déjà une inscription/ }).first()
      await duplicateMessage.waitFor()
      await duplicateMessage.scrollIntoViewIfNeeded()
      await settle(page)
      const regs = await db.registration.findMany({ where: { eventId, volunteer: { email: "video.errors.nicolas@example.org" } } })
      assert.equal(regs.length, 1)
      await at("Vérifions côté organisation"); await go(`/admin/events/${eventId}/registrations`)
      assert.equal(await page.getByRole("row").filter({ hasText: "video.errors.nicolas@example.org" }).count(), 1)
      checks.responseLostAfterCommit = true; checks.retryCreatedNoDuplicate = true
    })
    await scene("invitation-success", async at => {
      await form("Vestiaire", "Zoé", "video.errors.zoe@example.org", undefined, async () => { await at("Après ses informations et les consentements") }, async () => { await at("Zoé choisit le vestiaire") })
      assert.equal((await post(201)).editToken, null)
      await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      assert.equal(await page.getByRole("link", { name: "Accéder à mon inscription" }).count(), 0)
      await at("Aline a ensuite reçu une")
      const response = await page.request.post(`${base}/api/admin/events/${eventId}/invitations`, { data: { volunteerIds: ["video-errors-aline"], message: "Invitation fictive à choisir une autre mission disponible." } })
      assert.equal(response.status(), 201)
      const invitationResult = await response.json()
      assert.equal(invitationResult.emailsSent, 1, "The invitation must actually be sent")
      const invitation = await db.memberInvite.findFirstOrThrow({ where: { eventId, volunteerId: "video-errors-aline" } })
      await at("Ouvrons ce lien pour choisir la logistique")
      await form("Logistique", "Aline", "video.errors.aline@example.org", linkToken.reveal(invitation), async () => { await at("vérifions-les, choisissons sa taille") })
      const invited = await post(201)
      assert(typeof invited.editToken === "string" && invited.editToken.length > 0)
      const link = page.getByRole("link", { name: "Accéder à mon inscription" })
      await link.waitFor()
      await at("Aline retrouve ses deux créneaux"); await tap(page, link)
      await page.getByRole("heading", { name: "Mes inscriptions", exact: true }).waitFor()
      await settle(page)
      await page.waitForTimeout(1800)
      checks.invitedSuccessHasPersonalLink = true
    })
    await scene("result", async () => {
      await go(`/admin/events/${eventId}/registrations`)
      assert.equal(await db.registration.count({ where: { eventId } }), 5)
      checks.finalRegistrations = 5
    })
    await writeFile(path.join(directory, "registration-error-capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks, personalTokensStored: false, audiovisualValidated: false }, null, 2))
  } finally { await db.$disconnect() }
}
