import { test, expect, type Page } from "@playwright/test"
import sharp from "sharp"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"

/**
 * Organization logo (#300): an owner uploads a logo from the settings, sees it on the public
 * organization page, the public event page and a printed sheet (beside the organization's name,
 * decorative), served from the app's own origin; an SVG is refused with a message on the field;
 * the logo is removed after a confirmation.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

/** Waits until the image has actually loaded (not a broken image showing its alt). */
const expectLoaded = (img: ReturnType<Page["locator"]>) =>
  expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { message: "image not loaded" }).toBe(true)

test("an owner uploads a logo, sees it on the public pages, then removes it", async ({ page }) => {
  test.setTimeout(120_000) // dev server compiles each page on first visit
  await login(page)
  const png = await sharp({ create: { width: 900, height: 300, channels: 4, background: "#1e3a8a" } }).png().toBuffer()

  try {
    await page.goto("/admin/settings/admins")
    const section = page.getByRole("region", { name: "Logo de l'organisation" })
    const field = section.getByLabel("Choisir une image")
    await waitForHydration(field)
    await expect(field).toHaveAccessibleDescription(/PNG ou JPEG, 2 Mo au plus/)

    // An SVG declared as such is refused in the browser; submitting keeps that specific message.
    await field.setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
    await expect(section.getByRole("alert")).toContainText("SVG ne sont pas acceptées")
    await section.getByRole("button", { name: "Enregistrer le logo" }).click()
    await expect(section.getByRole("alert")).toContainText("SVG ne sont pas acceptées")
    await expect(field).toBeFocused()

    // An SVG disguised as a PNG is refused by the server with a message on the field.
    await field.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
    await section.getByRole("button", { name: "Enregistrer le logo" }).click()
    await expect(section.getByRole("alert")).toContainText("SVG ne sont pas acceptées")
    await expect(field).toHaveAttribute("aria-invalid", "true")

    // A real PNG: previewed before sending, then stored.
    await field.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png })
    await expect(section.getByRole("img", { name: "Aperçu de l'image choisie" })).toBeVisible()
    await expect(field).not.toHaveAttribute("aria-invalid", "true")
    expect.soft(await seriousViolations(page), "settings, logo chosen").toEqual([])
    await section.getByRole("button", { name: "Enregistrer le logo" }).click()
    await expect(section.getByRole("status")).toContainText("Logo enregistré.")
    const current = section.getByRole("figure", { name: "Logo actuel" }).getByRole("img")
    await expect(current).toBeVisible()
    await expectLoaded(current)
    const src = await current.getAttribute("src")
    expect(src).toMatch(/^\/api\/public\/organizations\/[^/]+\/logo\?v=[0-9a-f]{16}$/)

    // Served from the app's own origin, re-encoded, cached by version.
    const res = await page.request.get(src!)
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toBe("image/png")
    expect(res.headers()["x-content-type-options"]).toBe("nosniff")
    expect(res.headers()["cache-control"]).toContain("immutable")
    const stored = await sharp(await res.body()).metadata()
    expect([stored.width, stored.height]).toEqual([512, 171])

    // Public organization page: the logo beside the name, decorative.
    await page.goto("/?org=default")
    const orgLogo = page.locator(`header img[src="${src}"]`)
    await expect(orgLogo).toBeVisible()
    await expect(orgLogo).toHaveAttribute("alt", "")
    await expectLoaded(orgLogo)
    expect.soft(await seriousViolations(page), "public organization page with logo").toEqual([])
    // At 320 px the header wraps: no horizontal scroll.
    await page.setViewportSize({ width: 320, height: 640 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Public event page: in the header, next to the organization's name.
    await page.goto("/spectacle-cirque-2026?org=default")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const eventLogo = page.locator(`header img[src="${src}"]`)
    await expect(eventLogo).toBeVisible()
    await expect(eventLogo).toHaveAttribute("alt", "")
    await expectLoaded(eventLogo)
    expect.soft(await seriousViolations(page), "public event page with logo").toEqual([])

    // A printed sheet: beside the organization's name, decorative (badges: unit tests, the seed has no volunteer).
    const events: { id: string; slug: string }[] = await (await page.request.get("/api/admin/events")).json()
    const circus = events.find((e) => e.slug === "spectacle-cirque-2026")!
    await page.goto(`/api/admin/events/${circus.id}/export/sheets/attendance`)
    const sheetLogo = page.locator(`header img.org-logo[src="${src}"]`)
    await expect(sheetLogo).toHaveAttribute("alt", "")
    await expectLoaded(sheetLogo)

    // Removal, after a confirmation; the focus lands on the file field.
    await page.goto("/admin/settings/admins")
    const remove = section.getByRole("button", { name: "Retirer le logo" })
    await waitForHydration(remove)
    await remove.click()
    const dialog = page.getByRole("alertdialog", { name: "Retirer le logo de l'organisation ?" })
    await expect(dialog).toBeVisible()
    expect.soft(await seriousViolations(page), "settings, removal confirmation").toEqual([])
    await dialog.getByRole("button", { name: "Retirer le logo" }).click()
    await expect(dialog).toBeHidden()
    await expect(section.getByRole("status")).toContainText("Logo retiré.")
    await expect(section.getByText("Aucun logo pour l'instant.")).toBeVisible()
    await expect(section.getByLabel("Choisir une image")).toBeFocused()

    expect((await page.request.get(src!)).status()).toBe(404)
    await page.goto("/?org=default")
    await expect(page.locator("header img")).toHaveCount(0)
  } finally {
    // Leaves the shared organization without a logo, whatever happened above.
    await page.request.delete("/api/admin/settings/organization/logo")
  }
})
