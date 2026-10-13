import { test, expect, type Page } from "@playwright/test"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, randomIp, type PublicEvent } from "./helpers/public-signup"
import { getMessageText, waitForMessage } from "./helpers/mailpit"
import { EMBED_HEIGHT_MESSAGE, embedFrameId, embedSnippet } from "../src/lib/embed"

/**
 * The sign-up embedded on the association's own website (#948): only `?embed=1` may be framed,
 * every other route family refuses it (headers checked on the running server), and a volunteer
 * completes a sign-up inside an iframe of another origin, with the snippet's auto-resize, while
 * the frame has no usable storage (a third-party frame with blocked site data).
 */

/**
 * The association's site: a tiny HTTP server of this spec, on the other loopback name than the
 * app's (localhost ↔ 127.0.0.1), so another site. Each test hands it the page to serve. A page
 * fulfilled by Playwright's router would not do: Chromium counts it as public, and its Local
 * Network Access checks then block the frame to the localhost app before any request.
 */
let association: Server
let associationOrigin = ""
let associationHtml = ""

let event: PublicEvent

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(120_000)
  const host = new URL(baseURL!).hostname === "localhost" ? "127.0.0.1" : "localhost"
  association = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(associationHtml)
  })
  await new Promise<void>((resolve) => association.listen(0, host, resolve))
  associationOrigin = `http://${host}:${(association.address() as AddressInfo).port}`
  event = await createPublicEvent(browser, `E2E Intégration ${Date.now()}`, [
    { label: "Buvette", startTime: "10:00", endTime: "12:00" },
    { label: "Montage", startTime: "12:00", endTime: "14:00" },
  ])
})

test.afterAll(async () => {
  await new Promise((resolve) => association?.close(resolve))
})

const DENY = { csp: "frame-ancestors 'none'", xfo: "DENY" }

async function framing(page: Page, path: string) {
  const res = await page.request.get(path, { headers: { "x-forwarded-for": randomIp() } })
  const headers = res.headers()
  return { csp: headers["content-security-policy"], xfo: headers["x-frame-options"] }
}

test("only the embeddable sign-up may be framed, every other route family refuses it", async ({ page }) => {
  expect(await framing(page, `/${event.slug}?org=default&embed=1`)).toEqual({ csp: "frame-ancestors *", xfo: undefined })
  expect(await framing(page, `/${event.slug}/success?org=default&embed=1`)).toEqual({ csp: "frame-ancestors *", xfo: undefined })
  for (const path of [
    `/${event.slug}?org=default`,
    `/${event.slug}/success?org=default`,
    "/admin/login",
    "/admin/login?embed=1",
    "/admin/forgot-password?embed=1",
    "/my/not-a-token?embed=1",
    "/leader/not-a-token?embed=1",
    "/waitlist/not-a-token?embed=1",
    "/api/health",
    "/api/public/events?org=default&embed=1",
    "/fonctionnalites?embed=1",
    "/legal/privacy",
  ]) expect(await framing(page, path), path).toEqual(DENY)
})

/** The association's page: some text, then the snippet the admin panel gives. */
function associationPage(src: string, autoResize: boolean) {
  const snippet = embedSnippet({ url: src, eventTitle: "Intégration E2E", frameId: embedFrameId(event.slug), height: 700, autoResize })
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Association</title></head>
<body><h1>Site de l'association</h1><p>Inscrivez-vous ci-dessous.</p>${snippet}</body></html>`
}

test("a volunteer signs up inside an iframe of another site, storage blocked, height adjusted", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000)
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  // A third-party frame with blocked site data: every storage access throws, in every frame.
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("The operation is insecure.", "SecurityError") } })
  })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))

  const src = `${baseURL}/${event.slug}?org=default&embed=1`
  associationHtml = associationPage(src, true)
  await page.goto(`${associationOrigin}/benevoles`)

  const iframe = page.locator(`iframe#${embedFrameId(event.slug)}`)
  await expect(iframe).toHaveAttribute("title", "Inscription bénévoles – Intégration E2E")
  const frame = page.frameLocator(`iframe#${embedFrameId(event.slug)}`)

  // The organisation's page, without the site's « Retour » nor its footer columns.
  await expect(frame.getByRole("heading", { level: 1 })).toContainText("E2E Intégration")
  await expect(frame.getByRole("link", { name: /Retour/ })).toHaveCount(0)
  await expect(frame.getByRole("link", { name: "Espace organisateur" })).toHaveCount(0)

  // The auto-resize: the listener of the snippet sets the frame to the page's height.
  await expect.poll(() => iframe.evaluate((el) => (el as HTMLIFrameElement).style.height)).toMatch(/^\d+px$/)

  const select = frame.getByRole("button", { name: /Buvette[^:]* : sélectionner/ }).first()
  await waitForHydration(select)
  await select.click()
  await frame.getByRole("button", { name: /^Continuer/ }).first().click()
  await expect(frame.getByRole("heading", { name: "Tes informations" })).toBeFocused()

  const stamp = Date.now()
  const email = `e2e-embed-${stamp}@example.com`
  await frame.getByLabel("Prénom *", { exact: true }).fill("E2E")
  await frame.getByLabel("Nom *", { exact: true }).fill(`Integre${stamp}`)
  await frame.getByLabel("Email *", { exact: true }).fill(email)
  await frame.getByRole("button", { name: "convention des bénévoles" }).click()
  await frame.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await frame.getByLabel(/J.accepte que l.association/).check()
  await frame.getByRole("button", { name: "Confirmer mon inscription" }).click()

  // The confirmation, still in the frame. The personal link goes by email (#285): the page says so
  // (when the page shows it too, it opens in a new tab: src/components/__tests__/SuccessPageEmbed).
  await expect(frame.getByRole("heading", { level: 1, name: "Inscription confirmée !" })).toBeVisible()
  await expect(frame.getByText("L'email de confirmation contient ton lien personnel")).toBeVisible()
  for (const link of await frame.getByRole("link", { name: /Accéder à mon inscription/ }).all()) {
    await expect(link).toHaveAttribute("target", "_blank")
  }
  for (const link of await frame.getByRole("contentinfo").getByRole("link").all()) {
    await expect(link).toHaveAttribute("target", "_blank")
  }
  const mail = await waitForMessage(`to:"${email}"`)
  expect(await getMessageText(mail.ID)).toMatch(/\/my\/[\w-]+/)
  await expect(frame.getByRole("link", { name: "Revenir au planning" })).toHaveAttribute("href", `/${event.slug}?org=default&embed=1`)
  const confirmation = page.frames().find((f) => f.url().includes(`/${event.slug}/success`))
  expect(new URL(confirmation!.url()).searchParams.get("embed")).toBe("1")

  // The association's page itself never left.
  expect(new URL(page.url()).origin).toBe(associationOrigin)
  expect(errors).toEqual([])
})

test("the public page without embed=1 is not shown in another site's frame", async ({ page, baseURL }) => {
  const src = `${baseURL}/${event.slug}?org=default`
  associationHtml = associationPage(src, false)
  const refused = page.waitForEvent("response", (r) => r.url() === src)
  await page.goto(`${associationOrigin}/sans-embed`)
  expect((await refused).headers()["content-security-policy"]).toBe("frame-ancestors 'none'")
  // The browser blocks the document: nothing of the event page in the frame.
  await page.waitForTimeout(1_000)
  await expect(page.frameLocator("iframe").getByRole("heading", { name: /E2E Intégration/ })).toHaveCount(0)
})

test("the height message is a number under a namespaced type, nothing else", async ({ page, baseURL }) => {
  const src = `${baseURL}/${event.slug}?org=default&embed=1`
  associationHtml = `<!doctype html><html><body><script>window.__msgs = []; window.addEventListener("message", (e) => window.__msgs.push(e.data))</script>
<iframe src="${src}" title="Inscription" style="width:100%;height:600px"></iframe></body></html>`
  await page.goto(`${associationOrigin}/messages`)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __msgs: unknown[] }).__msgs.length)).toBeGreaterThan(0)
  const messages = await page.evaluate(() => (window as unknown as { __msgs: unknown[] }).__msgs)
  for (const m of messages) {
    expect(Object.keys(m as object).sort()).toEqual(["height", "type"])
    expect((m as { type: string }).type).toBe(EMBED_HEIGHT_MESSAGE)
    expect(typeof (m as { height: unknown }).height).toBe("number")
  }
})

test("the organiser gets the code and a live preview from « Partager l'événement »", async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
  await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  await page.goto(`/admin/events/${event.eventId}`)
  const section = page.getByRole("region", { name: "Partager l'événement" })
  const open = section.getByRole("button", { name: "Code d'intégration" })
  await waitForHydration(open)
  await open.click()
  await expect(open).toHaveAttribute("aria-expanded", "true")
  const code = section.getByLabel("Code à coller dans votre site")
  await expect(code).toHaveValue(new RegExp(`src="[^"]*/${event.slug}\\?org=default&amp;embed=1"`))
  await expect(code).toHaveValue(/title="Inscription bénévoles – E2E Intégration \d+"/)

  await section.getByRole("checkbox", { name: "Ajuster la hauteur automatiquement" }).check()
  await expect(code).toHaveValue(/<script>/)

  await section.getByRole("button", { name: "Aperçu en direct" }).click()
  const preview = page.frameLocator(`iframe[title^="Aperçu : Inscription bénévoles"]`)
  await expect(preview.getByRole("heading", { level: 1 })).toContainText("E2E Intégration")
})
