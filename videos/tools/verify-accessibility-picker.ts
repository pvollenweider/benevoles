// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real local UI preflight, not native screen-reader or synchronized-video evidence. */
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(url.hostname === "localhost" && url.port === "45433" && url.pathname === "/benevoles_video")
  const browser = await chromium.launch()
  const directory = path.resolve("videos/output/accessibility-keyboard-display")
  await mkdir(directory, { recursive: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto("http://localhost:43102/admin/login")
    await page.getByLabel("Email", { exact: true }).fill("video.accessibility.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.goto("http://localhost:43102/admin/events/video-accessibility-event/registrations")
    await page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }).click()
    await page.getByLabel("Prénom *", { exact: true }).fill("Aline")
    await page.getByLabel("Nom *", { exact: true }).fill("Exemple")
    await page.getByLabel("Email", { exact: true }).fill("video.accessibility.0@example.org")
    // Main now hides the decorative asterisk from the accessible name;
    // aria-required carries the actual required state instead.
    const picker = page.getByRole("combobox", { name: "Créneau", exact: true })
    assert.equal(await picker.getAttribute("aria-required"), "true")
    await page.getByRole("button", { name: "Ajouter", exact: true }).click()
    await page.screenshot({ path: path.join(directory, "picker-submit-observed.png") })
    await page.getByText("Sélectionnez un créneau.", { exact: true }).waitFor()
    assert.equal(await picker.getAttribute("aria-invalid"), "true")
    assert(await picker.evaluate(element => document.activeElement === element), "Failed submit must restore focus without test focusing it")
    await page.screenshot({ path: path.join(directory, "picker-required.png") })
    await page.keyboard.press("ArrowDown")
    await page.getByRole("listbox").waitFor()
    const warnings = await page.getByRole("listbox").innerText()
    await page.screenshot({ path: path.join(directory, "picker-warnings-observed.png") })
    assert(warnings.toLocaleLowerCase("fr").includes("déjà inscrit") && warnings.toLocaleLowerCase("fr").includes("conflit"), "Actual registration and overlap warnings required")
    const before = await picker.getAttribute("aria-activedescendant")
    await page.keyboard.press("ArrowDown")
    const after = await picker.getAttribute("aria-activedescendant")
    assert(before && after && before !== after, "Arrow must change the active option")
    await page.keyboard.press("Enter")
    await page.getByRole("listbox").waitFor({ state: "hidden" })
    assert(await picker.evaluate(element => document.activeElement === element))
    const value = await picker.innerText()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Escape")
    assert.equal(await picker.innerText(), value)
    await page.keyboard.press("ArrowDown")
    await page.screenshot({ path: path.join(directory, "picker-warnings.png") })
    await page.setViewportSize({ width: 320, height: 800 })
    await page.getByRole("listbox").scrollIntoViewIfNeeded()
    const box = await page.getByRole("listbox").boundingBox()
    assert(box && box.x >= 0 && box.x + box.width <= 320, "Actual list must fit simulated narrow viewport")
    const narrowPage = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth }))
    await page.screenshot({ path: path.join(directory, "picker-320-simulated.png"), fullPage: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    await picker.scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      const note = document.createElement("div")
      note.id = "video-forced-colors-note"
      note.textContent = "Émulation Chromium — pas un test Windows"
      note.style.cssText = "position:fixed;top:0;left:0;right:0;padding:8px;background:Canvas;color:CanvasText;text-align:center;font:16px Arial;z-index:2147483647;pointer-events:none"
      document.body.append(note)
    })
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ forcedColors: "active", colorScheme })
      assert(await page.evaluate(() => matchMedia("(forced-colors: active)").matches))
      await page.screenshot({ path: path.join(directory, `picker-forced-${colorScheme}-emulated.png`) })
    }
    await page.emulateMedia({ forcedColors: "none", colorScheme: "light" })
    await page.evaluate(() => document.getElementById("video-forced-colors-note")?.remove())
    await writeFile(path.join(directory, "picker-preflight.json"), JSON.stringify({ checkedAt: new Date().toISOString(), requiredErrorVisible: true, focusRestoredByApplication: true, existingRegistrationWarning: true, actualOverlapWarning: true, arrowChangesActiveOption: true, enterKeepsFocus: true, escapePreservesValue: true, listFitsSimulated320: true, narrowPage, wholePageFitsViewport: narrowPage.documentWidth <= narrowPage.viewportWidth, forcedColorEmulationCaptured: ["light", "dark"], actualKeys: ["ArrowDown", "ArrowDown", "Enter", "ArrowDown", "Escape", "ArrowDown"], noRegistrationSubmitted: true, nativeScreenReaderTest: false, realWindowsTest: false, synchronizedVideoValidated: false }, null, 2))
    console.log("✓ Actual required error, restored focus, both warnings and keyboard selection verified; no registration created")
  } finally { await browser.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Picker preflight failed"); process.exitCode = 1 })
