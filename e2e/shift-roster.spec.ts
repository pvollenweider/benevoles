import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

/**
 * « Qui est inscrit » (#1068): on by default on a new event (the organisation's default), the
 * organiser's reminder shown; the sign-up form offers an optional, unticked box; a public
 * sign-up's acceptance waits for a confirmation from the personal page. Nobody anonymous sees the
 * switch, nor the embed; a confirmed volunteer sees their own shifts on their personal page and,
 * through its link, every shift on the event page behind « Voir qui est inscrit » (list and
 * frise); a member invited by email sees it too before signing up.
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
  const setting = admin.getByLabel("Permettre aux bénévoles confirmés et aux membres invités de voir qui est inscrit")
  await waitForHydration(setting)
  await expect(setting).toBeChecked()
  await expect(setting).toHaveAccessibleDescription(/Informez les bénévoles/)

  // 2. Anonymous visitor: no switch, no names.
  await page.goto(`/${event.slug}?org=default`)
  const select = page.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first()
  await waitForHydration(select)
  await expect(page.getByRole("button", SWITCH)).toHaveCount(0)

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
  await expect(card(aline)).toContainText("Tu as demandé à l'inscription d'afficher ton nom")
  const show = card(aline).getByRole("button", { name: "Afficher mon nom" })
  await waitForHydration(show)
  expect(await seriousViolations(aline)).toEqual([])
  await show.click()
  const hide = card(aline).getByRole("button", { name: "Masquer mon nom" })
  await expect(hide).toBeVisible()
  await expect(hide).toBeFocused()
  await expect(card(aline)).toContainText("Ton nom est affiché")

  // 6. Bruno follows « Voir qui est inscrit sur les autres créneaux »: the event page, switch on.
  await bruno.reload()
  await card(bruno).getByRole("link", { name: "Voir qui est inscrit sur les autres créneaux" }).click()
  await expect(bruno).toHaveURL(/inscrits=1/)
  const brunoSwitch = bruno.getByRole("button", SWITCH)
  await expect(brunoSwitch).toHaveAttribute("aria-pressed", "true")
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
  await bruno.setViewportSize({ width: 320, height: 800 })
  expect(await bruno.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // Off: the names go.
  await brunoSwitch.click()
  await expect(brunoSwitch).toHaveAttribute("aria-pressed", "false")
  await expect(bruno.getByText(/Touche, survole ou sélectionne/)).toHaveCount(0)
  // The embed never offers it, even to a recognised volunteer.
  await bruno.goto(`/${event.slug}?org=default&embed=1`)
  await waitForHydration(bruno.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first())
  await expect(bruno.getByRole("button", SWITCH)).toHaveCount(0)

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
  const guestSwitch = guest.getByRole("button", SWITCH)
  await waitForHydration(guestSwitch)
  await guestSwitch.click()
  await guest.getByRole("button", { name: "Liste", exact: true }).click()
  await expect(guest.getByRole("button", { name: /^10h–12h · Buvette/ })).toHaveAccessibleDescription("Sur ce créneau : Aline, initiale M.")
  await expect(guest.getByRole("button", { name: /^14h–16h · Caisse/ })).toHaveAccessibleDescription("Sur ce créneau : 1 autre bénévole, sans nom affiché.")

  // 8. Aline hides her name: gone for everyone.
  await hide.click()
  await expect(card(aline).getByRole("button", { name: "Afficher mon nom" })).toBeVisible()
  await guest.reload()
  await guest.getByRole("button", SWITCH).click()
  await expect(guest.getByRole("button", { name: /^10h–12h · Buvette/ })).toHaveAccessibleDescription("Sur ce créneau : 1 autre bénévole, sans nom affiché.")
  await guestContext.close()
  await alineContext.close()
  await brunoContext.close()
})
