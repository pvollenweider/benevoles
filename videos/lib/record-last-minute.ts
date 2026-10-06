// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import type { Page, Locator } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../../src/lib/token-vault"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
type Mail = { ID: string; To: { Address: string }[] }
export async function recordLastMinute(options: { page: Page; base: string; directory: string; title: string; scene: Scene; tap: (page: Page, locator: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, scene, tap, settle } = options
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video database required")
  const proof = JSON.parse(await readFile(path.join(directory, "functional-checks.json"), "utf8"))
  const mailProof = JSON.parse(await readFile(path.join(directory, "mail-checks.json"), "utf8"))
  if (!proof.priorAttendancePreserved || !proof.actualCausalJournal || !mailProof.schedulePendingExcluded) throw new Error("Actual functional and SMTP preflight required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const eventId = "video-last-minute-event", url = `${base}/admin/events/${eventId}`
  const go = async (target: string) => { await page.goto(target); await settle(page) }
  const write = async (field: Locator, value: string) => { await tap(page, field); await field.press("ControlOrMeta+A"); await field.pressSequentially(value, { delay: 110 }) }
  const reg = (n: number) => db.registration.findUniqueOrThrow({ where: { id: `video-last-minute-registration-${n}` } })
  const inbox = async (): Promise<Mail[]> => (await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()).messages
  const openNewMail = async (prior: Set<string>, recipient: string, expected: string[]) => {
    let found: Mail | undefined
    for (let attempt = 0; attempt < 40 && !found; attempt++) {
      for (const mail of (await inbox()).filter(mail => !prior.has(mail.ID) && mail.To.some(to => to.Address === recipient))) {
        const detail = await (await page.request.get(`http://localhost:48026/api/v1/message/${mail.ID}`)).json() as { Text: string }
        if (expected.every(text => detail.Text.includes(text))) { found = mail; break }
      }
      if (!found) await page.waitForTimeout(250)
    }
    if (!found) throw new Error("Expected newly received actual email missing")
    await go(`http://localhost:48026/view/${found.ID}`)
    await page.frameLocator("iframe").getByText(expected[0], { exact: false }).filter({ visible: true }).first().waitFor()
    return found.ID
  }
  const registrations = async () => { await go(`${url}/registrations`) }
  const shifts = async () => { await go(`${url}/shifts`); await tap(page, page.getByRole("button", { name: "Liste", exact: true })) }
  const coverage = async () => { await go(`${url}/staffing`); await page.getByRole("heading", { name: "Où manque-t-il du monde ?", exact: true }).waitFor() }
  const checks: Record<string, unknown> = { audiovisualValidated: false, humanAgreement: "Demonstration assumption, not recorded consent" }
  try {
    const aline = await reg(0), nicolas = await reg(1), priorAttendance = (await reg(5)).checkedInAt
    if (aline.status !== "active" || nicolas.status !== "waiting" || !priorAttendance || await db.notificationOutbox.count({ where: { organizationId: "video-last-minute" } })) throw new Error("Fresh dedicated fixture required before capture")
    await go(url)
    await scene("welcome", async () => { await page.screencast.showChapter(title, { description: "Vérifier, prévenir, contrôler le résultat", duration: 11500 }) })
    await scene("withdrawal", async at => {
      const prior = new Set((await inbox()).map(mail => mail.ID))
      await go(`${base}/my/${registrationToken.reveal(aline)}`)
      await at(0.15); await tap(page, page.getByRole("button", { name: "Annuler le créneau Accueil du matin", exact: true }))
      const withdrawal = page.waitForResponse(response => response.url().includes("/api/public/registrations/") && response.request().method() === "DELETE")
      await at(0.26); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Oui, annuler", exact: true }))
      if (!(await withdrawal).ok()) throw new Error("Actual public withdrawal failed")
      await at(0.42); await registrations()
      if ((await reg(0)).status !== "cancelled" || (await reg(1)).status !== "offered") throw new Error("Actual withdrawal and offer missing")
      await at(0.66); checks.offerMail = await openNewMail(prior, "video.last-minute.person.1@example.org", ["Accueil du matin"])
    })
    await scene("offer", async at => {
      await go(`${base}/my/${registrationToken.reveal(nicolas)}`)
      const take = page.getByRole("link", { name: "Prendre la place : Accueil du matin", exact: true })
      await take.waitFor(); await at(0.24); await tap(page, take)
      await page.getByRole("heading", { name: "Place confirmée !", exact: true }).waitFor()
      await at(0.46); await registrations()
      if ((await reg(1)).status !== "active") throw new Error("Offer acceptance not active")
      await page.getByRole("row").filter({ hasText: "Nicolas Exemple" }).scrollIntoViewIfNeeded()
      checks.offerConfirmed = true
    })
    await scene("coverage", async at => {
      await coverage()
      await page.locator('section[aria-labelledby="staffing-full"]').scrollIntoViewIfNeeded()
      await at(0.27); await page.locator('section[aria-labelledby="staffing-underfilled"]').scrollIntoViewIfNeeded()
      await page.locator('section[aria-labelledby="staffing-underfilled"]').getByRole("link", { name: /Logistique/ }).waitFor()
      await at(0.55); await page.locator('section[aria-labelledby="staffing-overview"]').scrollIntoViewIfNeeded()
    })
    await scene("availability", async at => {
      await go(`${base}/admin/members`)
      await write(page.getByPlaceholder("Rechercher (nom, email, téléphone)…"), "Zoé")
      await at(0.18); await page.getByRole("row").filter({ hasText: "Zoé Exemple" }).scrollIntoViewIfNeeded()
      await at(0.34); await tap(page, page.getByRole("button", { name: "Éditer Zoé Exemple", exact: true }))
      const note = page.getByLabel(/Sauf \/ à savoir/)
      await note.scrollIntoViewIfNeeded()
      if (await note.inputValue() !== "Peut aussi aider en début d'après-midi après confirmation.") throw new Error("Actual availability note missing")
      if (!await page.getByRole("checkbox", { name: "Matin", exact: true }).isChecked()) throw new Error("Actual morning availability missing")
      await at(0.52); await tap(page, page.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }))
      await at(0.61); await go(`${base}/admin/members/video-last-minute-person-2`)
      await page.getByRole("heading", { name: "Activité de Zoé Exemple", exact: true }).waitFor()
      await page.getByText("Accueil du soir", { exact: false }).first().scrollIntoViewIfNeeded()
    })
    await scene("message", async at => {
      const prior = new Set((await inbox()).map(mail => mail.ID))
      await go(`${url}/message`)
      await tap(page, page.getByRole("radio", { name: "Les bénévoles d'un créneau", exact: true }))
      await page.getByLabel("Créneau", { exact: true }).selectOption("video-last-minute-shift-1")
      await write(page.getByLabel("Objet *", { exact: true }), "Un coup de main pour la logistique ?")
      await write(page.getByLabel("Message *", { exact: true }), "Il reste une place de 12h à 14h. Connais-tu quelqu'un qui pourrait aider ? Merci !")
      await at(0.40); await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true }))
      await at(0.46); await tap(page, page.getByRole("dialog").getByRole("button", { name: /^Envoyer à/ }))
      await tap(page, page.getByRole("dialog").getByRole("button", { name: "Confirmer l'envoi", exact: true }))
      await at(0.51); checks.targetedMail = await openNewMail(prior, "video.last-minute.person.3@example.org", ["Connais-tu quelqu'un"])
      await at(0.63); await registrations()
      await tap(page, page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }))
      await write(page.getByLabel("Prénom *", { exact: true }), "Zoé")
      await write(page.getByLabel("Nom *", { exact: true }), "Exemple")
      await write(page.getByLabel("Email", { exact: true }), "video.last-minute.person.2@example.org")
      await tap(page, page.getByRole("combobox", { name: "Créneau *", exact: true }))
      await tap(page, page.getByRole("option", { name: /de 12h à 14h, Logistique/ }))
      const addition = page.waitForResponse(response => response.url().endsWith("/api/admin/registrations") && response.request().method() === "POST")
      await at(0.89); await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
      if (!(await addition).ok()) throw new Error("Actual manual add request failed")
      if (await db.registration.count({ where: { shiftId: "video-last-minute-shift-1", status: "active" } }) !== 2) throw new Error("Actual manual add failed")
      await coverage(); checks.logisticsFilled = true
    })
    await scene("schedule", async at => {
      const prior = new Set((await inbox()).map(mail => mail.ID))
      await shifts()
      await tap(page, page.getByRole("row").filter({ hasText: "Réception du matériel" }).getByRole("button", { name: "Modifier", exact: true }))
      await at(0.16); await write(page.getByLabel("Début *", { exact: true }), "14:30")
      await at(0.29); await write(page.getByLabel("Fin *", { exact: true }), "16:30")
      await at(0.40); await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
      await page.getByRole("row").filter({ hasText: "Réception du matériel" }).getByText("14:30–16:30", { exact: true }).waitFor()
      await at(0.49); checks.changedMail = await openNewMail(prior, "video.last-minute.person.4@example.org", ["14:00–16:00", "14:30–16:30"])
      await at(0.76); await shifts()
      await page.getByRole("row").filter({ hasText: "Réception du matériel" }).scrollIntoViewIfNeeded()
    })
    await scene("cancel", async at => {
      const prior = new Set((await inbox()).map(mail => mail.ID))
      await at(0.20)
      await tap(page, page.getByRole("row").filter({ hasText: "Caisse de la petite scène" }).getByRole("button", { name: "Supprimer", exact: true }))
      if ((await reg(5)).status !== "active" || (await reg(6)).status !== "requested") throw new Error("Actual confirmed and requested registrations required for the explanatory caption")
      await page.evaluate(() => {
        const caption = document.createElement("div")
        caption.id = "video-cancellation-explanation"
        caption.textContent = "1 inscription confirmée + 1 demande à valider : toutes deux seront annulées."
        caption.style.cssText = "position:fixed;bottom:18px;left:10%;width:80%;padding:14px 20px;box-sizing:border-box;background:#172033;color:white;border-radius:10px;text-align:center;font:18px/1.4 Arial,sans-serif;z-index:2147483647;pointer-events:none"
        document.body.append(caption)
      })
      const cancellation = page.waitForResponse(response => response.url().endsWith("/shifts/video-last-minute-shift-3") && response.request().method() === "DELETE")
      await at(0.37); await page.evaluate(() => document.getElementById("video-cancellation-explanation")?.remove())
      await tap(page, page.getByRole("alertdialog").getByRole("button", { name: /^Supprimer/ }))
      if (!(await cancellation).ok()) throw new Error("Actual cancellation request failed")
      if ((await reg(5)).status !== "cancelled" || (await reg(6)).status !== "cancelled" || (await reg(5)).checkedInAt?.getTime() !== priorAttendance.getTime()) throw new Error("Actual cancellation did not retain attendance")
      await at(0.46); await go(`${url}/log`)
      await page.locator("#panel-explore > div > div").filter({ hasText: "Caisse" }).first().scrollIntoViewIfNeeded()
      await at(0.70); checks.cancelledMail = await openNewMail(prior, "video.last-minute.person.5@example.org", ["Caisse de la petite scène"])
      await at(0.90); await registrations()
      checks.cancelledActiveAndRequested = true; checks.priorAttendancePreserved = true; checks.confirmedAndRequestedCaption = true
    })
    await scene("journal", async at => {
      await go(`${url}/log`)
      await page.locator("#panel-explore > div > div").first().waitFor()
      await at(0.25); await page.locator("#panel-explore > div > div").last().scrollIntoViewIfNeeded()
      await at(0.42); await tap(page, page.getByRole("tab", { name: "Récit", exact: true }))
      const root = await db.eventLog.findFirstOrThrow({ where: { eventId, action: "registration.cancelled", entityId: aline.id }, orderBy: { createdAt: "asc" } })
      const response = await page.request.get(`${url.replace("/admin/events/", "/api/admin/events/")}/log/candidates?kind=story`)
      const candidate = (await response.json()).candidates.find((item: { logId: string }) => item.logId === root.id) as { label: string } | undefined
      if (!candidate) throw new Error("Actual withdrawal story candidate missing")
      await at(0.57); await tap(page, page.locator("#panel-story").getByRole("button", { name: candidate.label, exact: true }))
      checks.actualCausalStory = true
    })
    await scene("result", async at => {
      await coverage()
      if (await page.locator('section[aria-labelledby="staffing-underfilled"]').getByRole("link", { name: /Logistique|Caisse/ }).count()) throw new Error("Filled or cancelled mission still shown as missing")
      await at(0.13); await registrations()
      await page.getByRole("row").filter({ hasText: "Nicolas Exemple" }).scrollIntoViewIfNeeded()
      await at(0.22); await page.getByRole("row").filter({ hasText: "Zoé Exemple" }).first().scrollIntoViewIfNeeded()
      await at(0.36); await shifts()
      await page.getByRole("row").filter({ hasText: "Réception du matériel" }).getByText("14:30–16:30", { exact: true }).waitFor()
      if (await page.getByRole("row").filter({ hasText: "Caisse de la petite scène" }).count()) throw new Error("Cancelled shift remains in the current list")
      await at(0.54); await coverage()
    })
    await writeFile(path.join(directory, "capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
  } finally { await db.$disconnect() }
}
