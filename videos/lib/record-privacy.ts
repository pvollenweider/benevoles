// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { BrowserContext, Cookie, Locator, Page } from "playwright"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { PrismaClient } from "../../src/generated/prisma/client"
import { pgAdapter } from "../../src/lib/prisma-adapter"
import { linkToken, registrationToken } from "../../src/lib/token-vault"
import { PERSONAL_LINK_NOTICE, LINK_REQUEST_RESPONSE } from "../../src/lib/personal-link"
import { showMembersCsv } from "./show-export-files"
import type { Cue } from "./sentence-timing"
import { PUBLIC_APP_URL } from "./public-hosts"
const MAILPIT = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"
import { fullNameOf, surnameOf } from "./fixture-names"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
export type PrivacySetup = { cookiesA: Cookie[]; cookiesB: Cookie[]; leaderId: string; leaderToken: string }
type Mail = { ID: string; To: { Address: string }[] }

function localDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Isolated local video DB required")
  return new PrismaClient({ adapter: pgAdapter(process.env.DATABASE_URL) })
}

/** Actual A/B logins prepared before the screencast, not fabricated session cookies. */
export async function preparePrivacyRecording(page: Page, base: string, directory: string): Promise<PrivacySetup> {
  if (base !== PUBLIC_APP_URL && !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Local video host required")
  const proof = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8"))
  if (!proof.crossOrganizationDetailRefusedBothWays || !proof.leaderRevocationRefusesOldLink || proof.actualEmailsReceived?.length !== 3) throw new Error("Actual privacy preflight required")
  const db = localDatabase()
  let other: BrowserContext | undefined
  try {
    for (const side of ["a", "b"]) {
      const people = await db.volunteer.findMany({ where: { organizationId: `video-privacy-${side}` } })
      if (people.length !== 5 || people.some(person => !new RegExp(`^video\\.privacy\\.${side}\\.member\\.[0-4]@example\\.org$`).test(person.email ?? ""))) throw new Error("Fresh dedicated privacy fixture required")
    }
    if (await db.sectorLeader.count({ where: { eventId: "video-privacy-a-event" } }) || await db.memberInvite.count({ where: { eventId: "video-privacy-a-event" } })) throw new Error("Privacy fixture already modified; run its real seed")
    const cookiesA = await page.context().cookies()
    other = await page.context().browser()!.newContext({ locale: "fr-CH", timezoneId: "Europe/Zurich" })
    const b = await other.newPage()
    await b.goto(`${base}/admin/login`)
    await b.getByLabel(/^Email(?:\s|$)/).fill("video.privacy.b.owner@example.org")
    await b.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await b.getByRole("button", { name: "Se connecter", exact: true }).click()
    await b.waitForURL(/\/admin\/dashboard/)
    const cookiesB = await other.cookies()
    const created = await page.request.post(`${base}/api/admin/events/video-privacy-a-event/sector-leaders`, { data: { roleName: "Accueil", name: fullNameOf("Camille"), email: "video.privacy.a.leader@example.org" } })
    if (created.status() !== 201) throw new Error("Actual dedicated leader creation failed")
    const leader = await db.sectorLeader.findFirstOrThrow({ where: { eventId: "video-privacy-a-event", roleName: "Accueil" } })
    await page.goto(`${base}/admin/members`)
    await page.getByRole("button", { name: `Modifier ${fullNameOf("Léa")}`, exact: true }).waitFor()
    return { cookiesA, cookiesB, leaderId: leader.id, leaderToken: linkToken.reveal(leader) }
  } finally { await other?.close(); await db.$disconnect() }
}

export async function recordPrivacy(options: { page: Page; base: string; directory: string; title: string; setup: PrivacySetup; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, setup, scene, tap, settle } = options
  const db = localDatabase()
  const eventId = "video-privacy-a-event"
  const go = async (route: string) => { await page.goto(route.startsWith(`${MAILPIT}/`) ? route : `${base}${route}`); await settle(page) }
  const session = async (cookies: Cookie[] | null) => { await page.context().clearCookies(); if (cookies) await page.context().addCookies(cookies) }
  const write = async (field: Locator, value: string, delay = 110) => { await field.scrollIntoViewIfNeeded(); await tap(page, field); await field.press("ControlOrMeta+A"); await field.pressSequentially(value, { delay }) }
  const inbox = async (): Promise<Mail[]> => (await (await page.request.get(`${MAILPIT}/api/v1/messages?limit=1000`)).json()).messages
  const ids = async () => new Set((await inbox()).map(mail => mail.ID))
  const openMail = async (before: Set<string>, recipient: string, kind: "personal" | "invitation") => {
    let found: Mail | undefined
    for (let attempt = 0; attempt < 40 && !found; attempt++) {
      for (const mail of (await inbox()).filter(mail => !before.has(mail.ID) && mail.To.some(to => to.Address === recipient))) {
        const detail = await (await page.request.get(`${MAILPIT}/api/v1/message/${mail.ID}`)).json() as { Text: string }
        if (detail.Text.includes(kind === "personal" ? "/my/" : "?token=")) { found = mail; break }
      }
      if (!found) await page.waitForTimeout(250)
    }
    if (!found) throw new Error("New actual privacy demonstration email missing")
    await go(`${MAILPIT}/view/${found.ID}`)
    const link = page.frameLocator("iframe").locator(kind === "personal" ? 'a[href*="/my/"]' : 'a[href*="?token="]').first()
    await link.waitFor()
    const href = await link.getAttribute("href")
    if (!href) throw new Error("Actual email has no usable link")
    const target = new URL(href)
    if (kind === "personal" ? !target.pathname.startsWith("/my/") : target.pathname !== "/fete-des-liens") throw new Error("Unexpected actual email link")
    return { mailId: found.ID, localPath: `${target.pathname}${target.search}` }
  }
  const checks: Record<string, unknown> = { audiovisualValidated: false, sessionPreparation: "Two real local administrator logins; no invented sessions" }
  const showRecordedLeader = async () => {
    const recordedLeader = await readFile(path.join(directory, "leader-before-revocation.png"))
    if (createHash("sha256").update(recordedLeader).digest("hex") !== checks.leaderFrameSha256) throw new Error("Recorded leader frame changed")
    // Labelled replay of this take's earlier real screen, never a fabricated live access.
    await page.evaluate(base64 => {
      const replay = document.createElement("div")
      replay.id = "video-recorded-leader-recap"
      replay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:white;display:flex;flex-direction:column"
      const image = document.createElement("img")
      image.src = `data:image/png;base64,${base64}`
      image.alt = "Écran réellement enregistré du responsable avant son retrait"
      image.style.cssText = "width:100%;height:calc(100% - 48px);object-fit:contain"
      const caption = document.createElement("div")
      caption.textContent = "Rappel en lecture seule · écran enregistré avant le retrait du responsable"
      caption.style.cssText = "height:48px;background:#172033;color:white;display:flex;align-items:center;justify-content:center;font:18px Arial,sans-serif"
      replay.append(image, caption); document.body.append(replay)
    }, recordedLeader.toString("base64"))
  }
  let personalPath = "", signupMail: Awaited<ReturnType<typeof openMail>> | undefined
  try {
    await scene("welcome", async at => {
      await page.screencast.showChapter(title, { duration: 2800 })
      await at("Dans notre démonstration, deux organisations"); await page.getByRole("row").filter({ hasText: "video.privacy.a.member.0@example.org" }).scrollIntoViewIfNeeded()
      await at("Les noms se ressemblent, mais"); await session(setup.cookiesB); await go("/admin/members")
      await page.getByRole("row").filter({ hasText: "video.privacy.b.member.0@example.org" }).scrollIntoViewIfNeeded()
      if ((await page.locator("body").innerText()).includes("video.privacy.a.member.0@example.org")) throw new Error("Other organization member in B view")
      await at("Toutes les personnes et coordonnées"); await session(null); await go("/fete-des-liens?org=formation-confidentialite-a")
    })
    await scene("signup", async at => {
      const before = await ids()
      await at("Jules choisit un créneau et"); await tap(page, page.getByRole("button", { name: /^10h.*12h.*, [^:]*Accueil[^:]* : sélectionner/ }))
      await tap(page, page.getByRole("button", { name: /^Continuer/ }).first())
      await write(page.getByLabel(/^Prénom(?:\s|$)/), "Jules")
      await write(page.getByLabel(/^Nom(?:\s|$)/), surnameOf("Jules"))
      await write(page.getByLabel(/^Email(?:\s|$)/), "video.privacy.a.new@example.org")
      await write(page.getByLabel(/^Téléphone/), "+41 79 000 1999")
      await at("Il accepte ensuite les conditions")
      await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
      await tap(page, page.locator("label").filter({ hasText: "J'accepte que l'association" }).getByRole("checkbox"))
      // Read the actual response before the successful form navigates away.
      const sent = page.waitForResponse(response => response.url().endsWith("/api/public/registrations") && response.request().method() === "POST")
        .then(async response => ({ status: response.status(), data: await response.json() }))
      await at("Après l'envoi, l'inscription est enregistrée"); await tap(page, page.getByRole("button", { name: "Confirmer mon inscription", exact: true }))
      const { status, data } = await sent
      if (status !== 201 || data.editToken !== null || data.linkSentByEmail !== true) throw new Error("Anonymous signup unexpectedly disclosed an access link")
      await page.waitForURL(/\/fete-des-liens\/success/); await settle(page)
      // A public sign-up without proof of the address lands on the neutral page (AUTHZ-01).
      await page.getByRole("heading", { name: "Demande d'inscription reçue", exact: true }).waitFor()
      if (await page.getByRole("link", { name: "Accéder à mon inscription", exact: true }).count()) throw new Error("Personal link revealed on anonymous success screen")
      await at("Ouvrons donc le vrai message"); signupMail = await openMail(before, "video.privacy.a.new@example.org", "personal")
      personalPath = signupMail.localPath
      await at("Nous arrivons sur sa propre"); await go(personalPath)
      await page.getByRole("heading", { name: "Mes inscriptions", exact: true }).waitFor()
      checks.anonymousSignupLinkOnlyInEmail = true
      checks.signupMail = signupMail.mailId
    })
    await scene("personal", async at => {
      const before = await ids()
      await at("Le panneau Ton lien personnel"); await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      await page.getByText(PERSONAL_LINK_NOTICE, { exact: true }).waitFor()
      await at("Utilisons Recevoir ce lien par"); await tap(page, page.getByRole("button", { name: "Recevoir ce lien par email", exact: true }))
      await at("Cette action renvoie l'accès "); const mail = await openMail(before, "video.privacy.a.new@example.org", "personal")
      checks.resendMail = mail.mailId
      if (await db.registration.count({ where: { eventId, volunteer: { email: "video.privacy.a.new@example.org" } } }) !== 1) throw new Error("Resend duplicated the registration")
      await at("Pour inviter des amis à"); await go(personalPath)
    })
    await scene("recovery", async at => {
      const before = await ids()
      const invalid = "/my/demo-invalid-privacy?org=formation-confidentialite-a"
      await go(invalid)
      const request = async (email: string) => {
        await write(page.getByLabel(/Adresse email utilisée pour t'inscrire/), email, 20)
        await tap(page, page.getByRole("button", { name: "Recevoir un nouveau lien", exact: true }))
        await page.getByText(LINK_REQUEST_RESPONSE, { exact: true }).waitFor()
      }
      await at("Depuis la page de récupération"); await request("video.privacy.a.member.0@example.org")
      await at("Vérifions le message reçu dans"); const mail = await openMail(before, "video.privacy.a.member.0@example.org", "personal")
      checks.recoveryMail = mail.mailId
      await at("Recommençons avec une adresse fictive"); await go(invalid); await request("video.privacy.unknown@example.org")
      await at("Enfin, demandons depuis l'organisation A"); await go(invalid); await request("video.privacy.b.member.0@example.org")
      if (await db.notificationOutbox.count({ where: { organizationId: "video-privacy-b" } })) throw new Error("Recovery emailed another organization")
      checks.sameRecoveryMessageThreeAddresses = true
    })
    await scene("invitation", async at => {
      await session(setup.cookiesA); await go(`/admin/events/${eventId}/invitations`)
      const before = await ids()
      await at("L'organisation l'envoie à Zoé, puis"); await tap(page, page.getByRole("button", { name: "+ Inviter des membres", exact: true }))
      const dialog = page.getByRole("dialog", { name: "Inviter des membres", exact: true })
      await tap(page, dialog.getByRole("checkbox", { name: `Inviter ${fullNameOf("Zoé")}`, exact: true }))
      await tap(page, dialog.getByRole("button", { name: "Envoyer 1 invitation", exact: true }))
      await dialog.waitFor({ state: "hidden" })
      // Zoé is a different viewer, not Jules returning on his already-selected shift.
      // Reset this event's remembered session on the application's origin, before Mailpit.
      await page.evaluate(() => localStorage.removeItem("benevoles_token_fete-des-liens"))
      const mail = await openMail(before, "video.privacy.a.member.3@example.org", "invitation")
      checks.invitationMail = mail.mailId
      await at("Son lien conduit au formulaire"); await session(null)
      await go(`${mail.localPath}&org=formation-confidentialite-a`)
      await tap(page, page.getByRole("button", { name: /^10h.*12h.*, [^:]*Accueil[^:]* : sélectionner/ }))
      await tap(page, page.getByRole("button", { name: /^Continuer/ }).first())
      if (await page.getByLabel(/^Prénom(?:\s|$)/).inputValue() !== "Zoé" || await page.getByLabel(/^Email(?:\s|$)/).inputValue() !== "video.privacy.a.member.3@example.org") throw new Error("Actual invitation did not prefill its recipient")
      checks.invitationPrefill = true
    })
    await scene("leader", async at => {
      await at("Ouvrons le lien de Camille")
      await go(`/leader/${setup.leaderToken}`)
      await page.getByRole("heading", { name: "Responsable · Accueil", exact: true }).waitFor()
      await at("Il voit les bénévoles de"); await page.getByText("video.privacy.a.member.0@example.org", { exact: true }).scrollIntoViewIfNeeded()
      const body = await page.locator("body").innerText()
      if (body.includes(fullNameOf("Nicolas")) || body.includes(fullNameOf("Sarah")) || body.includes("video.privacy.b.") || body.includes("Note interne fictive")) throw new Error("Leader view exceeds intended scope")
      const leaderFrame = await page.screenshot({ path: path.join(directory, "leader-before-revocation.png") })
      checks.leaderFrameSha256 = createHash("sha256").update(leaderFrame).digest("hex")
      await at("Revenons dans l'administration et retirons"); await session(setup.cookiesA); await go(`/admin/events/${eventId}/sector-leaders`)
      await tap(page, page.getByRole("button", { name: `Retirer ${fullNameOf("Camille")} des responsables de Accueil`, exact: true }))
      await at("En rouvrant son ancien lien"); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: /^Retirer/ }))
      await page.getByRole("button", { name: `Retirer ${fullNameOf("Camille")} des responsables de Accueil`, exact: true }).waitFor({ state: "hidden" })
      await at("Cela permet de retirer cet"); await go(`/leader/${setup.leaderToken}`)
      await page.getByRole("heading", { name: "Lien introuvable", exact: true }).waitFor()
      checks.actualLeaderRevocation = true
    })
    await scene("admin", async at => {
      await go(`/admin/events/${eventId}/registrations`)
      const lea = page.getByRole("row").filter({ hasText: "video.privacy.a.member.0@example.org" })
      await at("Dans les inscriptions, il retrouve"); await lea.scrollIntoViewIfNeeded()
      if (!(await lea.innerText()).includes("Taille du t-shirt : M")) throw new Error("Actual answer missing from admin row")
      await at("Dans les membres, il peut"); await go("/admin/members")
      await at("Regardons la fiche de Léa"); await tap(page, page.getByRole("button", { name: `Modifier ${fullNameOf("Léa")}`, exact: true }))
      if (await page.getByLabel("Notes", { exact: true }).inputValue() !== "Note interne fictive — organisation A") throw new Error("Dedicated internal note missing")
      await page.getByLabel("Notes", { exact: true }).scrollIntoViewIfNeeded()
      await at("Sa page Mes inscriptions ne montre"); await tap(page, page.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }))
      const leaReg = await db.registration.findUniqueOrThrow({ where: { id: "video-privacy-a-registration-0" } })
      await go(`/my/${registrationToken.reveal(leaReg)}`)
      if ((await page.locator("body").innerText()).includes("Note interne fictive")) throw new Error("Internal note visible in personal page")
      await at("Le responsable reçoit les contacts"); await showRecordedLeader()
      await at("Avant de transmettre une information"); await page.locator("#video-recorded-leader-recap").evaluate(element => element.remove())
      await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      checks.actualAdminAnswerAndInternalNote = true
    })
    await scene("legal", async at => {
      await at("Ouvrons Confidentialité."); await page.getByRole("link", { name: "Confidentialité", exact: true }).scrollIntoViewIfNeeded()
      await tap(page, page.getByRole("link", { name: "Confidentialité", exact: true }))
      await page.getByRole("heading", { name: "Politique de confidentialité", exact: true }).waitFor()
      await at("Repérons aussi les indications de"); await page.getByRole("heading", { name: "7. Conservation des données", exact: true }).scrollIntoViewIfNeeded()
      await at("Pour une question ou une"); await page.getByRole("heading", { name: "6. Droits des personnes concernées", exact: true }).scrollIntoViewIfNeeded()
      await at("Ouvrons maintenant les conditions d'utilisation"); await go(personalPath); await page.getByRole("link", { name: "CGU", exact: true }).scrollIntoViewIfNeeded(); await tap(page, page.getByRole("link", { name: "CGU", exact: true }))
      await page.getByRole("heading", { name: "Conditions générales d'utilisation", exact: true }).waitFor()
      await at("elle ne remplace pas une"); await page.getByRole("heading", { name: "5. Données personnelles", exact: true }).scrollIntoViewIfNeeded()
      checks.actualPublicLegalPages = true
    })
    await scene("copies", async at => {
      await go(`/admin/events/${eventId}/print`)
      await at("Ouvrons le rapport prévu pour"); const ready = page.waitForEvent("popup")
      await tap(page, page.getByRole("link", { name: /^Planning par jour/ }))
      const popup = await ready; await popup.waitForLoadState("networkidle")
      const url = new URL(popup.url()); await popup.close()
      if (url.origin !== new URL(base).origin || !url.pathname.endsWith("/sheets/day")) throw new Error("Unexpected real report")
      // Closing the foreground popup can leave the main tab's compositor suspended.
      // Restore its real focus before showing the actual report on the filmed page.
      await page.bringToFront()
      await page.goto(url.href); await settle(page)
      await page.bringToFront()
      await page.getByRole("heading", { level: 1, name: "Fête des liens — organisation A", exact: true }).waitFor()
      await page.getByText(/^Planning par jour · Formation/).waitFor()
      await page.screenshot({ path: path.join(directory, "report-before-csv.png") })
      await page.waitForTimeout(600)
      const body = await page.locator("body").innerText()
      if (body.includes("Note interne fictive") || body.includes("video.privacy.a.member.0@example.org")) throw new Error("Stand report contains private member fields")
      await at("Comparons-le au CSV des membres"); await go("/admin/members")
      const pending = page.waitForEvent("download"); await tap(page, page.getByRole("link", { name: /^Exporter les membres/ }))
      const file = path.join(directory, "privacy-members.csv"); await (await pending).saveAs(file)
      const csv = await showMembersCsv(page, file)
      if (csv.rows.length !== 6 || !csv.rows.some(row => row.includes("Note interne fictive — organisation A"))) throw new Error("Actual member CSV lacks expected private fields")
      // Current CSV has long delivery/charter columns after Notes; far-right hides the named evidence.
      await at("ce fichier comporte notamment des")
      await page.getByRole("columnheader", { name: "Notes", exact: true }).scrollIntoViewIfNeeded()
      const note = page.getByRole("cell", { name: "Note interne fictive — organisation A", exact: true })
      await note.scrollIntoViewIfNeeded()
      await note.waitFor()
      const visibleNote = await note.boundingBox()
      if (!visibleNote || visibleNote.x < 0 || visibleNote.x + visibleNote.width > 1280) throw new Error("CSV internal note is outside the captured viewport")
      await at("Il n'est donc pas à")
      await at("Choisissez le document adapté à")
      checks.actualReportVsMemberCsv = true
      checks.memberCsvSha256 = csv.sha256
    })
    await go(personalPath)
    await scene("result", async at => {
      await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      await page.getByText(PERSONAL_LINK_NOTICE, { exact: true }).waitFor()
      await at("Pour recruter, partagez la page"); await go("/fete-des-liens?org=formation-confidentialite-a")
      await page.getByRole("heading", { name: "Fête des liens — organisation A", exact: true }).waitFor()
      await at("Pour gérer une inscription, gardez"); await go(personalPath)
      await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      await at("Pour coordonner un poste, remettez"); await showRecordedLeader()
      await at("Si un accès a été"); await page.locator("#video-recorded-leader-recap").evaluate(element => element.remove())
      await page.getByRole("region", { name: "Ton lien personnel", exact: true }).getByRole("link", { name: "Écrire à l'organisation", exact: true }).scrollIntoViewIfNeeded()
    })
    if (await db.registration.count({ where: { eventId, volunteer: { email: "video.privacy.a.new@example.org" } } }) !== 1 || await db.sectorLeader.count({ where: { id: setup.leaderId } })) throw new Error("Final privacy state differs")
    await writeFile(path.join(directory, "capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
  } finally { await db.$disconnect() }
}
