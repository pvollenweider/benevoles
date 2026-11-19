// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { orgRegistrationsFixture as fixture } from "./org-registrations-fixture"
import type { Cue } from "./sentence-timing"

type Options = {
  page: Page
  mailbox: string
  scene: (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
  tap: (page: Page, locator: Locator) => Promise<void>
}

type Mail = { ID: string; Subject: string; To: { Address: string }[] }

export async function recordOrgRegistrations({ page, mailbox, scene, tap }: Options) {
  const [first, second] = fixture.events
  const origin = `https://${fixture.slug}.benevol.app`
  const scope = `Ce lien donne accès à toutes tes inscriptions auprès de ${fixture.name} et permet de les modifier. Ne le partage pas.`
  const personalHeading = page.getByRole("heading", { name: "Toutes mes inscriptions", exact: true })
  const list = page.getByRole("region", { name: "Tous tes créneaux à venir" })

  const messages = async (): Promise<Mail[]> => {
    const response = await page.request.get(`${mailbox}/api/v1/search`, { params: { query: `to:${fixture.email}` } })
    if (!response.ok()) throw new Error("Cannot read the local video mailbox")
    const result = await response.json() as { messages?: Mail[] }
    return (result.messages ?? []).filter(mail => mail.To.some(recipient => recipient.Address === fixture.email))
  }

  const previous = new Set((await messages()).map(mail => mail.ID))
  const openMail = async (subject: string) => {
    const matches = (await messages()).filter(mail => !previous.has(mail.ID) && mail.Subject === subject)
    if (matches.length !== 1) throw new Error(`Expected one new message for ${subject}, received ${matches.length}`)
    await page.goto(`${mailbox}/view/${encodeURIComponent(matches[0].ID)}`, { waitUntil: "domcontentloaded" })
    const body = page.frameLocator("iframe")
    await body.getByText(scope, { exact: true }).waitFor()
    const button = body.getByRole("link", { name: "Voir mes inscriptions", exact: true })
    const href = await button.getAttribute("href")
    const target = new URL(href ?? "")
    if (target.origin !== origin || !target.pathname.startsWith("/mes-inscriptions/")) {
      throw new Error("Unexpected organisation link in local email")
    }
    return { button, target }
  }

  await scene("recover", async at => {
    await page.goto(`${origin}/${first.slug}`, { waitUntil: "domcontentloaded" })
    const lost = page.getByText("J'ai perdu mon lien personnel", { exact: true })
    await at("Sur la page d’inscription")
    await lost.scrollIntoViewIfNeeded()
    await at("Ouvre J’ai perdu")
    await tap(page, lost)
    await at("Saisis l’adresse email")
    const email = page.getByLabel(/Adresse email utilisée pour t'inscrire/)
    await tap(page, email)
    await email.pressSequentially(fixture.email, { delay: 55 })
    await at("Choisis Recevoir")
    await tap(page, page.getByRole("button", { name: "Recevoir mon lien par email", exact: true }))
    await page.getByText(/^Demande enregistrée\./).waitFor()
  })

  let originalPath = ""
  await scene("email", async at => {
    const mail = await openMail(`Ton lien pour toutes tes inscriptions — ${fixture.name}`)
    originalPath = mail.target.pathname
    await at("Ouvre la page")
    // Avoid switching Chromium compositors when Mailpit opens a new tab. Follow the
    // original href in the recording tab after the real click on the email button.
    await mail.button.evaluate(link => link.addEventListener("click", event => event.preventDefault(), { once: true }))
    await tap(page, mail.button)
    await page.goto(mail.target.href, { waitUntil: "domcontentloaded" })
    await personalHeading.waitFor()
    await page.screenshot()
  })

  await scene("events", async at => {
    await personalHeading.scrollIntoViewIfNeeded()
    await at("Ici, l’Accueil")
    await list.getByText(first.title, { exact: true }).waitFor()
    await list.getByText(second.title, { exact: true }).scrollIntoViewIfNeeded()
  })

  await scene("cancel", async at => {
    const cancel = list.getByRole("button", { name: `Annuler le créneau ${first.role},` })
    await at(0.11) /* mid-sentence */
    await tap(page, cancel)
    await at("Vérifie le nom")
    await at(0.68) /* mid-sentence */
    await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Oui, annuler", exact: true }))
    await cancel.waitFor({ state: "hidden" })
    await list.getByText(second.title, { exact: true }).waitFor()
  })

  await scene("calendar", async at => {
    const card = page.getByRole("region", { name: "Mon calendrier" })
    await card.scrollIntoViewIfNeeded()
    await at("Pour un agenda en ligne")
    await tap(page, card.getByText("Google Agenda ou autre agenda en ligne", { exact: true }))
    await at("Copie l’adresse")
    await tap(page, card.getByRole("button", { name: "Copier l'adresse de l'abonnement", exact: true }))
    await card.getByText("Adresse copiée.", { exact: true }).waitFor()
  })

  await scene("renew", async at => {
    const renew = page.getByRole("button", { name: "Renouveler mon lien", exact: true })
    await renew.scrollIntoViewIfNeeded()
    await at(0.12) /* mid-sentence */
    await tap(page, renew)
    await page.getByText(/^Ton lien a été renouvelé/).waitFor()
    await at("Ouvre le nouvel email")
    const renewed = await openMail(`Ton nouveau lien pour toutes tes inscriptions — ${fixture.name}`)
    if (renewed.target.pathname === originalPath) throw new Error("Renewed email still contains the original link")
  })
}
