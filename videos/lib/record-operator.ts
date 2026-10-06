// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { Cookie, Locator, Page } from "playwright"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { loadManifest } from "./manifest"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
const subject = "Formation — préparer votre prochain événement"
const content = "# Bienvenue !\n- Vérifie ton planning.\n- Partage ton lien public.\n[Lire le guide](http://video.invalid/guide-admin)"
const ownerEmail = "video.operator.disposable.owner@example.org"
const initialSlug = "formation-operateur-jetable"
const finalSlug = "formation-operateur-jetable-renommee"
const password = "Formation-Operator-2026!"
function database() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video_operator")
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
}

export async function validateOperatorNarration(directory: string) {
    const manifest = await loadManifest("PLATFORM_INTERNAL_ADMINISTRATION")
    const audio = JSON.parse(await readFile(path.join(directory, "audio-metadata.json"), "utf8"))
    const audit = JSON.parse(await readFile(path.join(directory, "narration-audit.json"), "utf8"))
    assert.equal(audio.model, "gemini-3.8-flash-tts")
    assert.equal(audio.voice, manifest.voice)
    for (const segment of manifest.segments) {
      const entry = audit.segments.find((entry: { id: string }) => entry.id === segment.id)
      assert(entry && entry.expected === segment.transcript && !entry.needsReview, `Fresh independently checked narration required for ${segment.id}`)
      const wav = await readFile(path.join(directory, "audio", `${segment.id}.wav`))
      assert.equal(entry.audioSha256, createHash("sha256").update(wav).digest("hex"), "Narration changed after its audit")
      assert.equal(audio.segments[segment.id].generationSha256, audio.segments.welcome.generationSha256)
    }
}

export async function prepareOperatorRecording(page: Page, base: string, directory: string, rehearsal = false) {
  assert.equal(base, "http://localhost:43104")
  if (!rehearsal) await validateOperatorNarration(directory)
  const proof = JSON.parse(await readFile(path.join(directory, "lifecycle-preparation.json"), "utf8"))
  assert(proof.oldLinkRefused && proof.disposableOrganizationDeleted && proof.existingSessionWhileInactiveStatus === 401)
  const db = database()
  try {
    const disposable = await db.organization.findFirst({ where: { OR: [{ slug: initialSlug, name: "Formation Opérateur Jetable" }, { slug: finalSlug, name: "Formation Opérateur Jetable renommée" }], admins: { some: { email: ownerEmail } } }, select: { id: true, slug: true, active: true, admins: { select: { email: true } }, _count: { select: { events: true, volunteers: true } } } })
    if (disposable) {
      const before = await db.organization.findMany({ select: { id: true } })
      assert.equal(before.length, 4)
      assert(before.every(org => /^video-operator-org-[abc]$/.test(org.id) || org.id === disposable.id))
      assert.deepEqual(disposable.admins, [{ email: ownerEmail }])
      assert.deepEqual(disposable._count, { events: 0, volunteers: 0 })
      const endpoint = `${base}/api/super-admin/organizations/${disposable.id}`
      if (disposable.active) assert.equal((await page.request.patch(endpoint, { data: { active: false } })).status(), 200)
      assert.equal((await page.request.delete(endpoint, { data: { confirmSlug: disposable.slug } })).status(), 200, "Reset only this video's exact disposable prior take")
    }
    const orgs = await db.organization.findMany({ select: { id: true } })
    assert.equal(orgs.length, 3)
    assert(orgs.every(org => /^video-operator-org-[abc]$/.test(org.id)))
    const admins = await db.adminUser.findMany({ select: { id: true, email: true, receiveProductUpdates: true, isActive: true } })
    assert.equal(admins.length, 4)
    assert(admins.every(admin => /^video\.operator\.(?:platform|[abc]\.owner)@example\.org$/.test(admin.email)))
    assert.deepEqual(admins.filter(admin => admin.receiveProductUpdates && admin.isActive).map(admin => admin.email), ["video.operator.a.owner@example.org"])
    assert.equal(await db.jobRun.count(), 0)
    const previous = await db.productUpdateSend.findMany({ select: { id: true, subject: true, sentByAdminId: true } })
    assert(previous.every(send => send.subject === subject && send.sentByAdminId === "video-operator-platform"))
    // Remove only this video's already-owned rehearsal summaries, not another scenario's history.
    if (previous.length) await db.productUpdateSend.deleteMany({ where: { id: { in: previous.map(send => send.id) } } })
    await page.goto(`${base}/super-admin/organizations`)
    await page.getByRole("heading", { name: "Organisations", exact: true }).waitFor()
    assert.equal((await page.request.get(`${base}/api/admin/events`)).status(), 409)
    return { platformCookies: await page.context().cookies() }
  } finally { await db.$disconnect() }
}

export async function recordOperator(options: { page: Page; base: string; directory: string; title: string; setup: { platformCookies: Cookie[] }; scene: Scene; tap: (page: Page, locator: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, setup, scene, tap, settle } = options
  const db = database()
  const go = async (route: string) => { await page.goto(route.startsWith("http://localhost:48026/") ? route : `${base}${route}`); await settle(page) }
  const session = async (cookies: Cookie[] | null) => {
    // Stop the previous page's in-flight session refresh before restoring a real cookie jar.
    // Otherwise its response can overwrite the newly restored account's cookie.
    await page.goto("about:blank")
    await page.context().clearCookies()
    if (cookies) await page.context().addCookies(cookies)
  }
  const write = async (field: Locator, value: string) => { await tap(page, field); await field.press("ControlOrMeta+A"); await field.pressSequentially(value, { delay: 110 }) }
  type Mail = { ID: string; To: { Address: string }[]; Subject: string }
  const inbox = async (): Promise<Mail[]> => (await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()).messages
  const ids = async () => new Set((await inbox()).map(mail => mail.ID))
  const openMail = async (before: Set<string>, email: string, kind: "invite" | "test" | "broadcast") => {
    let mail: Mail | undefined
    for (let attempt = 0; attempt < 60 && !mail; attempt++) {
      mail = (await inbox()).find(item => !before.has(item.ID) && item.To.some(to => to.Address === email) && (kind === "invite" ? !item.Subject.includes("Bienvenue") : item.Subject === `${kind === "test" ? "[Test] " : ""}${subject}`))
      if (!mail) await page.waitForTimeout(200)
    }
    assert(mail, `Actual ${kind} email missing`)
    await go(`http://localhost:48026/view/${mail.ID}`)
    const selector = kind === "invite" ? 'a[href*="/admin/accept-invite?token="]' : 'a[href*="product-updates/unsubscribe?"]'
    const link = page.frameLocator("iframe").locator(selector).first()
    await link.waitFor()
    const target = new URL((await link.getAttribute("href"))!)
    assert(target.pathname === (kind === "invite" ? "/admin/accept-invite" : "/api/public/product-updates/unsubscribe"))
    return { id: mail.ID, localPath: `${target.pathname}${target.search}` }
  }
  let orgId = "", oldInvite = "", newInvite = "", ownerCookies: Cookie[] = []
  let testBefore: Set<string>, broadcastBefore: Set<string>, lastMail: Awaited<ReturnType<typeof openMail>>
  const checks: Record<string, unknown> = { audiovisualValidated: false, localDatabaseOnly: true, isolatedSmtpOnly: true }
  try {
    await scene("welcome", async at => {
      await page.screencast.showChapter(title, { duration: 2800 })
      await at(.22); await page.getByRole("row").filter({ hasText: "Formation Opérateur Réserve" }).scrollIntoViewIfNeeded()
      await at(.53); await tap(page, page.getByRole("link", { name: "Formation Opérateur Parc", exact: true }))
      await page.getByRole("heading", { name: "Formation Opérateur Parc", exact: true }).waitFor()
      await at(.78); await page.getByRole("heading", { name: "Administrateurs", exact: true }).scrollIntoViewIfNeeded()
    })
    await scene("create", async at => {
      await at(.04); await go("/super-admin/organizations/new")
      await write(page.getByLabel(/^Nom de l'organisation/), "Formation Opérateur Jetable")
      await write(page.getByLabel(/^Nom complet/), "Lou Exemple")
      await write(page.getByLabel(/^Adresse email/), ownerEmail)
      await at(.47)
      const response = page.waitForResponse(res => res.url().endsWith("/api/super-admin/organizations") && res.request().method() === "POST")
      await tap(page, page.getByRole("button", { name: "Créer l'organisation", exact: true }))
      const created = await response; assert.equal(created.status(), 201)
      orgId = (await created.json()).org.id
      await page.getByRole("heading", { name: "Organisation créée", exact: true }).waitFor()
      assert.equal((await db.adminUser.findUniqueOrThrow({ where: { email: ownerEmail } })).isActive, false)
      checks.createdPendingOrganization = true
    })
    await scene("renew", async at => {
      const firstBefore = await ids()
      await at(.04); await tap(page, page.getByRole("button", { name: "Envoyer l'invitation par email", exact: true }))
      await page.getByRole("button", { name: "Invitation envoyée", exact: true }).waitFor()
      await at(.17); const first = await openMail(firstBefore, ownerEmail, "invite"); oldInvite = first.localPath
      await at(.36); await go(`/super-admin/organizations/${initialSlug}`)
      const secondBefore = await ids()
      await tap(page, page.getByRole("button", { name: /^Renvoyer l'invitation/ }))
      await page.getByText("Nouveau lien d'activation", { exact: false }).first().waitFor()
      await at(.52); await session(null); await go(oldInvite)
      await page.getByRole("heading", { name: "Lien invalide", exact: true }).waitFor()
      await at(.85); const second = await openMail(secondBefore, ownerEmail, "invite"); newInvite = second.localPath
      checks.actualInviteMails = [first.id, second.id]; checks.oldInviteRefused = true
    })
    await scene("activate", async at => {
      await at(.03); await go(newInvite)
      await page.getByLabel("Nouveau mot de passe", { exact: true }).waitFor()
      await write(page.getByLabel("Nouveau mot de passe", { exact: true }), password)
      await write(page.getByLabel("Confirmer le mot de passe", { exact: true }), password)
      await at(.27); await tap(page, page.getByRole("button", { name: "Créer mon mot de passe", exact: true }))
      await page.getByRole("heading", { name: "Mot de passe créé", exact: true }).waitFor()
      await at(.42); await tap(page, page.getByRole("link", { name: "Se connecter", exact: true }))
      await write(page.getByLabel("Email", { exact: true }), ownerEmail)
      await write(page.getByLabel("Mot de passe", { exact: true }), password)
      await tap(page, page.getByRole("button", { name: "Se connecter", exact: true }))
      await page.waitForURL(/\/admin\/events/); ownerCookies = await page.context().cookies()
      assert.equal((await page.request.get(`${base}/api/admin/events`)).status(), 200)
      await at(.70); await session(setup.platformCookies); await go(`/super-admin/organizations/${initialSlug}`)
      await page.getByRole("row").filter({ hasText: ownerEmail }).getByText("Actif", { exact: true }).waitFor()
      checks.actualActivationAndLogin = true
    })
    await scene("identity", async at => {
      await at(.04); await write(page.getByLabel("Nom", { exact: true }), "Formation Opérateur Jetable renommée")
      await tap(page, page.locator("form").filter({ has: page.getByLabel("Nom", { exact: true }) }).getByRole("button", { name: "OK", exact: true }))
      await page.getByRole("heading", { name: "Formation Opérateur Jetable renommée", exact: true }).waitFor()
      await at(.25); await write(page.getByLabel("Slug", { exact: true }), "formation-operateur-a")
      const slugForm = page.locator("form").filter({ has: page.getByLabel("Slug", { exact: true }) })
      await tap(page, slugForm.getByRole("button", { name: "OK", exact: true }))
      await page.getByRole("alert").filter({ hasText: "Ce slug est déjà utilisé." }).waitFor()
      await at(.41); await write(page.getByLabel("Slug", { exact: true }), finalSlug)
      await tap(page, slugForm.getByRole("button", { name: "OK", exact: true }))
      await page.waitForURL(new RegExp(`/super-admin/organizations/${finalSlug}$`))
      assert.equal(await db.orgSlugHistory.count({ where: { organizationId: orgId, slug: initialSlug } }), 1)
      await at(.67)
      const redirected = await page.request.get(`${base}/?org=${initialSlug}`, { maxRedirects: 0 })
      const location = redirected.headers().location
      assert(location && new URL(location, base).hostname === `${finalSlug}.video.invalid`, "Actual old public slug redirects to new canonical host")
      checks.publicAliasRedirect = { status: redirected.status(), targetHost: `${finalSlug}.video.invalid` }
    })
    await scene("availability", async at => {
      await at(.04); await tap(page, page.getByRole("button", { name: "Désactiver", exact: true }))
      await at(.18); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: /^Désactiver/ }))
      await page.getByRole("button", { name: "Réactiver", exact: true }).waitFor()
      await at(.32); await session(ownerCookies); await go("/admin/events")
      assert.equal((await page.request.get(`${base}/api/admin/events`)).status(), 401)
      await at(.51); await session(setup.platformCookies); await go(`/super-admin/organizations/${finalSlug}`)
      await tap(page, page.getByRole("button", { name: "Réactiver", exact: true }))
      await tap(page, page.getByRole("dialog").getByRole("button", { name: "Réactiver", exact: true }))
      await page.getByRole("button", { name: "Désactiver", exact: true }).waitFor()
      await at(.69); await session(ownerCookies); await go("/admin/events")
      assert.equal((await page.request.get(`${base}/api/admin/events`)).status(), 200)
      checks.sessionRejectedWhileInactive = true; checks.sessionRestoredAfterReactivation = true
    })
    await scene("context", async at => {
      await session(setup.platformCookies)
      await at(.04); await go("/admin/events")
      await page.waitForURL(/\/super-admin\/organizations/)
      await at(.28); await go("/super-admin/organizations/formation-operateur-a")
      await at(.42); await tap(page, page.getByRole("link", { name: "Gérer l'organisation Formation Opérateur Parc", exact: true }))
      await page.waitForURL(/\/admin\/events/)
      await page.getByRole("link", { name: "Parc — Fête de formation", exact: true }).waitFor()
      assert(!(await page.locator("body").innerText()).includes("Quartier — Fête de formation"))
      checks.explicitContextSelection = true
    })
    await scene("health", async at => {
      await at(.03); await go("/super-admin/health")
      await page.getByRole("heading", { name: "Santé du service", exact: true }).waitFor()
      for (const [fraction, name] of [[.12, "Service"], [.30, "Tâches planifiées et sauvegardes"], [.57, "Configuration"]] as const) { await at(fraction); await page.getByRole("heading", { name, exact: true }).scrollIntoViewIfNeeded() }
      assert.equal(await db.jobRun.count(), 0)
      checks.realHealthWithoutInventedJobs = true
    })
    await scene("preview", async at => {
      await at(.03); await go("/super-admin/product-updates")
      await write(page.getByLabel("Objet *", { exact: true }), subject)
      await write(page.getByLabel(/^Contenu \(Markdown/), content)
      await at(.37); await page.getByRole("heading", { name: "Aperçu", exact: true }).scrollIntoViewIfNeeded()
      testBefore = await ids()
      await at(.49); await tap(page, page.getByRole("button", { name: "Envoyer un test", exact: true }))
      await at(.66); const mail = await openMail(testBefore, "video.operator.platform@example.org", "test")
      assert.equal(await db.productUpdateSend.count(), 0)
      checks.actualTestEmail = mail.id
    })
    await scene("broadcast", async at => {
      // Navigation really clears this form: show re-entry, never invent a saved draft.
      await at(.03); await go("/super-admin/product-updates")
      await write(page.getByLabel("Objet *", { exact: true }), subject)
      await write(page.getByLabel(/^Contenu \(Markdown/), content)
      assert.equal(await page.getByLabel("Objet *", { exact: true }).inputValue(), subject)
      const recipients = await db.adminUser.findMany({ where: { isActive: true, receiveProductUpdates: true }, select: { email: true } })
      assert.deepEqual(recipients.map(row => row.email).sort(), ["video.operator.a.owner@example.org", ownerEmail].sort())
      broadcastBefore = await ids()
      await at(.45); await tap(page, page.getByRole("button", { name: "Envoyer (2)", exact: true }))
      await at(.57); await tap(page, page.getByRole("dialog").getByRole("button", { name: "Envoyer", exact: true }))
      await page.getByRole("status").filter({ hasText: "Communication envoyée à 2/2 destinataires." }).waitFor()
      assert.equal(await db.productUpdateSend.count({ where: { subject, successCount: 2, recipientCount: 2 } }), 1)
      await at(.72); lastMail = await openMail(broadcastBefore, ownerEmail, "broadcast")
      const delivered = (await inbox()).filter(mail => !broadcastBefore.has(mail.ID) && mail.Subject === subject)
      assert.deepEqual(delivered.flatMap(mail => mail.To.map(to => to.Address)).sort(), recipients.map(row => row.email).sort())
      await at(.82)
      const unsubscribe = await page.request.get(`${base}${lastMail.localPath}`, { maxRedirects: 0 })
      assert.equal(unsubscribe.status(), 307)
      const redirect = new URL(unsubscribe.headers().location)
      await session(null); await go(`${redirect.pathname}${redirect.search}`)
      assert.equal((await db.adminUser.findUniqueOrThrow({ where: { email: ownerEmail } })).receiveProductUpdates, false)
      checks.actualBroadcastEmails = delivered.map(mail => mail.ID); checks.actualUnsubscribe = true
    })
    await scene("delete", async at => {
      await session(setup.platformCookies); await go(`/super-admin/organizations/${finalSlug}`)
      await at(.12); await tap(page, page.getByRole("button", { name: "Désactiver", exact: true }))
      await tap(page, page.getByRole("alertdialog").getByRole("button", { name: /^Désactiver/ }))
      await at(.27); await tap(page, page.getByRole("button", { name: "Supprimer définitivement", exact: true }))
      const dialog = page.getByRole("alertdialog")
      await at(.56); await write(dialog.getByRole("textbox"), finalSlug)
      await at(.71); await tap(page, dialog.getByRole("button", { name: /^Supprimer/ }))
      await page.waitForURL(/\/super-admin\/organizations$/)
      assert.equal(await db.organization.count(), 3)
      assert.equal(await db.adminUser.count({ where: { email: ownerEmail } }), 0)
      checks.exactDisposableDeletion = true
    })
    await scene("result", async at => {
      await at(.08); await session(ownerCookies); await go("/super-admin/organizations")
      assert.equal((await page.request.get(`${base}/api/super-admin/organizations`)).status(), 401, "Deleted owner's former session cannot administer platform")
      // Use the still-existing ordinary owner for the actual role boundary, not the deleted account.
      await go("/admin/login")
      await page.getByLabel("Email", { exact: true }).fill("video.operator.a.owner@example.org")
      await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await tap(page, page.getByRole("button", { name: "Se connecter", exact: true }))
      await page.waitForURL(/\/admin\/events/)
      assert.equal((await page.request.get(`${base}/api/super-admin/organizations`)).status(), 403)
      await at(.36); await session(setup.platformCookies); await go("/super-admin/organizations")
      checks.ordinaryOwnerPlatformAccessRefused = true
    })
    await writeFile(path.join(directory, "capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
  } finally { await db.$disconnect() }
}
