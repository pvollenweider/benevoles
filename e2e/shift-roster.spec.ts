import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

/**
 * « Qui est inscrit » (#1068): on by default on a new event (the organisation's default), the
 * organiser's short hint and reminder shown, the details behind « En savoir plus »; the sign-up form offers an optional, unticked box; a public
 * sign-up's acceptance waits for a confirmation from the personal page. Nobody anonymous sees the
 * switch, nor the embed; a confirmed volunteer sees their own shifts on their personal page and,
 * through its link, every shift on the event page behind the « Voir qui est inscrit » switch (list
 * and frise); a member invited by email sees it too before signing up.
 */

let event: PublicEvent
const title = `E2E Qui est inscrit ${Date.now()}`
const stamp = Date.now()
const alineEmail = `e2e-roster-aline-${stamp}@example.com`
const guestEmail = `e2e-roster-guest-${stamp}@example.com`

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, title, [
    { label: "Buvette", startTime: "10:00", endTime: "12:00", capacity: 10 },
    { label: "Caisse", startTime: "14:00", endTime: "16:00", capacity: 10 },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000) // dev server compiles each page on first visit, emails through Mailpit
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function openMyPage(page: Page, link: string) {
  await page.goto(`/my/${link}`)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
}

const card = (page: Page) => page.getByRole("region", { name: "Qui est inscrit" })
const SWITCH = { name: "Voir qui est inscrit" }

test("on by default, sign up with the notice, confirm, seen on the event page by a confirmed volunteer and an invited member", async ({ page, browser }) => {
  // 1. A new event starts with the organisation's default (on): the setting is ticked, the
  //    organiser's duty to inform is said.
  const admin = await browser.newPage()
  await login(admin)
  await admin.goto(`/admin/events/${event.eventId}/edit`)
  const setting = admin.getByLabel("Montrer aux bénévoles qui est inscrit")
  await waitForHydration(setting)
  await expect(setting).toBeChecked()
  await expect(setting).toHaveAccessibleDescription(/membres invités voient le prénom.*Informez vos bénévoles, y compris les personnes déjà inscrites/)
  // The details are in the guide, at an existing heading (a new tab).
  const more = admin.locator("#event-shift-roster-setting").getByRole("link", { name: /^En savoir plus/ })
  await expect(more).toHaveAttribute("href", "/doc/creer-un-evenement#activer-qui-est-inscrit-sur-un-evenement-qui-a-deja-des-inscrits")
  await expect(more).toHaveAttribute("target", "_blank")

  // 2. Anonymous visitor: no switch, no names.
  await page.goto(`/${event.slug}?org=default`)
  const select = page.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first()
  await waitForHydration(select)
  await expect(page.getByRole("switch", SWITCH)).toHaveCount(0)

  // 3. A public sign-up: the optional box, unticked, separate from the required ones.
  await select.click()
  await page.getByRole("button", { name: /^Continuer/ }).click()
  await page.getByLabel("Prénom *", { exact: true }).fill("Aline")
  await page.getByLabel("Nom *", { exact: true }).fill("Martin")
  await page.getByLabel("Email *", { exact: true }).fill(alineEmail)
  await page.getByRole("button", { name: "convention des bénévoles" }).click()
  await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await page.getByLabel(/J.accepte que l.association/).check()
  const box = page.getByLabel(/J.accepte que les bénévoles confirmés et les membres invités par l.organisation/)
  await expect(box).not.toBeChecked()
  await expect(box).toHaveAccessibleDescription(/Facultatif, sans effet sur ton inscription/)
  await box.check()
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(page).toHaveURL(new RegExp(`/${event.slug}/success`))
  const mail = await waitForMessage(`to:"${alineEmail}"`)
  const alineLink = (await getMessageText(mail.ID)).match(/\/my\/([\w-]+)/)?.[1] ?? ""
  expect(alineLink).toBeTruthy()

  // 4. Another confirmed volunteer (Caisse): their card shows their own shift only, nobody named
  //    yet (a public form proves nothing about who sent it), and the link to the other shifts.
  const brunoContext = await browser.newContext()
  const bruno = await brunoContext.newPage()
  await bruno.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  const brunoLink = await publicSignUp(bruno, event, [event.shifts[1].id])
  await openMyPage(bruno, brunoLink)
  await expect(card(bruno)).toBeVisible()
  await expect(card(bruno).getByRole("heading", { level: 3, name: /Caisse/ })).toBeVisible()
  await expect(card(bruno).getByRole("heading", { level: 3, name: /Buvette/ })).toHaveCount(0)
  await expect(card(bruno)).toContainText("Personne d'autre pour l'instant.")

  // 5. Aline confirms from her personal page (its link came by email).
  const alineContext = await browser.newContext()
  const aline = await alineContext.newPage()
  await aline.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await openMyPage(aline, alineLink)
  // Ticked at sign-up, not confirmed: the switch off, « À confirmer »; one tap confirms.
  await expect(card(aline)).toContainText("À confirmer : tu l'as demandé à l'inscription")
  const nameSwitch = card(aline).getByRole("switch", { name: "Afficher mon nom aux autres bénévoles" })
  await waitForHydration(nameSwitch)
  await expect(nameSwitch).toHaveAttribute("aria-checked", "false")
  expect(await seriousViolations(aline)).toEqual([])
  await nameSwitch.click()
  await expect(nameSwitch).toHaveAttribute("aria-checked", "true")
  await expect(nameSwitch).toBeFocused()
  await expect(card(aline)).toContainText(/Visible : «\s*Aline\s+M\.\s*»/)
  await expect(card(aline).getByRole("status")).toHaveText("Ton nom est maintenant affiché.")
  await aline.setViewportSize({ width: 320, height: 800 })
  expect(await aline.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // 6. Bruno follows « Voir qui est inscrit sur les autres créneaux »: the event page, switch on.
  await bruno.reload()
  await card(bruno).getByRole("link", { name: "Voir qui est inscrit sur les autres créneaux" }).click()
  await expect(bruno).toHaveURL(/inscrits=1/)
  const brunoSwitch = bruno.getByRole("switch", SWITCH)
  await expect(brunoSwitch).toHaveAttribute("aria-checked", "true")
  await bruno.getByRole("button", { name: "Liste", exact: true }).click()
  const buvette = bruno.getByRole("button", { name: /^10h–12h · Buvette/ })
  await expect(buvette).toHaveAccessibleDescription("Sur ce créneau : Aline, initiale M.")
  await expect(bruno.getByRole("button", { name: /^14h–16h · Caisse/ })).not.toHaveAttribute("aria-describedby", /roster/)
  await expect(bruno.locator("main")).not.toContainText("Martin")
  expect(await seriousViolations(bruno)).toEqual([])
  // Frise: the bars are unchanged, the line under the day says who is on the bar focused.
  await bruno.getByRole("button", { name: "Frise", exact: true }).click()
  await expect(bruno.getByText(/Touche, survole ou sélectionne/)).toBeVisible()
  await bruno.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first().focus()
  await expect(bruno.getByText("Buvette · 10h–12h")).toBeVisible()
  // #1075: a shift that can't be chosen (here Bruno's own) is reached with the arrows too, and
  // brings up its line; its description says who is on it.
  await bruno.keyboard.press("ArrowDown")
  const own = bruno.locator(`[data-shift-id="${event.shifts[1].id}"]`)
  await expect(own).toBeFocused()
  await expect(own).toHaveAccessibleName("14h–16h, Caisse : inscription confirmée")
  await expect(own).toHaveAttribute("aria-disabled", "true")
  await expect(own).toHaveAccessibleDescription("Avec toi : personne d'autre pour l'instant.")
  await expect(bruno.getByText("Caisse · 14h–16h")).toBeVisible()
  await bruno.keyboard.press("ArrowUp")
  await expect(bruno.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first()).toBeFocused()
  await bruno.setViewportSize({ width: 320, height: 800 })
  expect(await bruno.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // Off: the names go.
  await brunoSwitch.click()
  await expect(brunoSwitch).toHaveAttribute("aria-checked", "false")
  await expect(bruno.getByText(/Touche, survole ou sélectionne/)).toHaveCount(0)
  // The embed never offers it, even to a recognised volunteer.
  await bruno.goto(`/${event.slug}?org=default&embed=1`)
  await waitForHydration(bruno.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first())
  await expect(bruno.getByRole("switch", SWITCH)).toHaveCount(0)

  // 7. A member invited by email sees it before signing up.
  const post = async (url: string, body: unknown) => {
    const res = await admin.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const member = await post("/api/admin/members", { firstName: "Gina", lastName: `Guest${stamp}`, email: guestEmail })
  await post(`/api/admin/events/${event.eventId}/invitations`, { volunteerIds: [member.id] })
  await admin.close()
  const invitation = await waitForMessage(`to:"${guestEmail}"`)
  const inviteUrl = (await getMessageText(invitation.ID)).match(/https?:\/\/\S*[?&]token=\S+/)?.[0]
  expect(inviteUrl).toBeTruthy()
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  const url = new URL(inviteUrl!)
  await guest.goto(url.pathname + url.search)
  const guestSwitch = guest.getByRole("switch", SWITCH)
  await waitForHydration(guestSwitch)
  await guestSwitch.click()
  await guest.getByRole("button", { name: "Liste", exact: true }).click()
  await expect(guest.getByRole("button", { name: /^10h–12h · Buvette/ })).toHaveAccessibleDescription("Sur ce créneau : Aline, initiale M.")
  await expect(guest.getByRole("button", { name: /^14h–16h · Caisse/ })).toHaveAccessibleDescription("Sur ce créneau : 1 autre bénévole, sans nom affiché.")

  // 8. Aline hides her name: gone for everyone.
  await nameSwitch.click()
  await expect(nameSwitch).toHaveAttribute("aria-checked", "false")
  await expect(card(aline)).toContainText("Masqué")
  await guest.reload()
  await guest.getByRole("switch", SWITCH).click()
  await expect(guest.getByRole("button", { name: /^10h–12h · Buvette/ })).toHaveAccessibleDescription("Sur ce créneau : 1 autre bénévole, sans nom affiché.")
  await guestContext.close()
  await alineContext.close()
  await brunoContext.close()
})
