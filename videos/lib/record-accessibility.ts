// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { Locator, Page } from "playwright"
import { loadAccessibilityNativeEvidence, type NativeEvidenceContext, type NativeInsertionPlan } from "./accessibility-native-evidence"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
/** Native media are external timeline inserts, not a still page pretending to demonstrate them. */
export type AccessibilityNativeInsert = {
  evidenceFile: string
  context: NativeEvidenceContext
  insert: (verified: NativeInsertionPlan) => Promise<void>
}
export type AccessibilityRecordingOptions = {
  page: Page
  base: string
  productCommit: string
  scene: Scene
  settle: (page: Page) => Promise<void>
  tap: (page: Page, locator: Locator) => Promise<void>
  /** Called after real observations only; the caller persists these beside provenance. */
  evidence: (chapter: string, observations: Record<string, unknown>) => Promise<void>
  native: { zoom: AccessibilityNativeInsert; reader: AccessibilityNativeInsert }
}

const publicPath = "/atelier-clavier?org=formation-clavier"
const adminPath = "/admin/events/video-accessibility-event"
const fixtureEmail = "video.accessibility.0@example.org"

/** Reach the control using actual Tab presses, never DOM focus(). */
async function tabTo(page: Page, target: Locator) {
  await target.waitFor({ state: "visible" })
  for (let step = 0; step < 100; step++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press("Tab")
    await page.waitForTimeout(110)
  }
  throw new Error(`Keyboard cannot reach ${await target.getAttribute("aria-label") ?? await target.innerText()}`)
}
async function activate(page: Page, target: Locator) {
  await tabTo(page, target)
  await page.keyboard.press("Enter")
}
async function type(page: Page, target: Locator, value: string) {
  await tabTo(page, target)
  await page.keyboard.press("ControlOrMeta+A")
  await target.pressSequentially(value, { delay: 110 })
}
async function focused(target: Locator) {
  assert(await target.evaluate(element => element === document.activeElement), "Application must retain or restore actual focus")
}

/** The caller logs in to the fixture owner beforehand. Does not seed, reset or read secrets. */
export async function recordAccessibility(options: AccessibilityRecordingOptions) {
  const { page, base, productCommit, scene, settle, evidence, native } = options
  assert.equal(base, "http://localhost:43102", "Dedicated local capture server required")
  // Fail before any fixture mutation. A caller-provided validated:true is NOT evidence.
  assert(native.zoom.context.currentProduct.commit === productCommit && native.reader.context.currentProduct.commit === productCommit)
  const zoomPlan = await loadAccessibilityNativeEvidence(native.zoom.evidenceFile, native.zoom.context)
  const readerPlan = await loadAccessibilityNativeEvidence(native.reader.evidenceFile, native.reader.context)
  assert.equal(zoomPlan.kind, "zoom")
  assert.equal(readerPlan.kind, "reader")
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const manual = async (first: string, email?: string) => {
    await go(`${adminPath}/registrations`)
    await activate(page, page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }))
    await type(page, page.getByLabel(/^Prénom(?: \*)?$/), first)
    await type(page, page.getByLabel(/^Nom(?: \*)?$/), "Exemple")
    if (email) await type(page, page.getByLabel("Email", { exact: true }), email)
    return page.getByRole("combobox", { name: "Créneau", exact: true })
  }
  const warnings = async () => {
    const text = (await page.getByRole("listbox").innerText()).toLocaleLowerCase("fr")
    assert(text.includes("déjà inscrit") && text.includes("conflit"), "Real fixture warnings required")
  }
  await scene("welcome", async at => {
    await go(publicPath)
    await at(0.15)
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: /contenu/i }).first()
    await tabTo(page, skip)
    await at(0.35); await page.keyboard.press("Enter")
    await at(0.6); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab")
    await evidence("welcome", { realKeys: true, skipLinkActivated: true })
  })
  await scene("public", async at => {
    await go(publicPath)
    const slot = page.getByRole("button", { name: /^Sélectionner — Accueil/ }).first()
    await at(0.12); await activate(page, slot)
    await at(0.28); await activate(page, page.getByRole("button", { name: /^Continuer/ }))
    await page.getByLabel("Prénom *", { exact: true }).waitFor()
    await at(0.47)
    await activate(page, page.getByRole("button", { name: "Confirmer mon inscription", exact: true }))
    // Browser constraint validation is genuine; no invalid POST and no actual contact.
    assert(await page.locator(":invalid").count() > 0, "Missing mandatory field must genuinely block submission")
    await at(0.69); await type(page, page.getByLabel("Prénom *", { exact: true }), "Camille")
    await evidence("public", { selectedSlot: true, actualFormShown: true, actualMandatoryValidation: true, noSubmission: true })
  })
  await scene("picker", async at => {
    const picker = await manual("Aline", fixtureEmail)
    await at(0.3); await tabTo(page, picker); await page.keyboard.press("ArrowDown")
    await warnings()
    const first = await picker.getAttribute("aria-activedescendant")
    await at(0.45); await page.keyboard.press("ArrowDown")
    assert.notEqual(await picker.getAttribute("aria-activedescendant"), first)
    await at(0.53); await page.keyboard.press("v")
    await at(0.62); await page.keyboard.press("Enter"); await focused(picker)
    const selected = await picker.innerText()
    await at(0.74); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape")
    assert.equal(await picker.innerText(), selected)
    await go(`${adminPath}/registrations`)
    const filter = page.getByRole("combobox", { name: "Filtrer par créneau", exact: true })
    await at(0.85); await tabTo(page, filter); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter")
    await evidence("picker", { realWarnings: true, arrowsChangeActive: true, escapePreservesSelection: true, actualFilterSelected: true })
  })
  await scene("error", async at => {
    // Unique synthetic person per take; never add Aline a second time.
    const name = `Clavier ${Date.now()}`
    const picker = await manual(name)
    await at(0.24); await activate(page, page.getByRole("button", { name: "Ajouter", exact: true }))
    await page.getByText("Sélectionnez un créneau.", { exact: true }).waitFor()
    await focused(picker); assert.equal(await picker.getAttribute("aria-invalid"), "true")
    await at(0.48); await page.keyboard.press("ArrowDown")
    // Accueil matin is genuinely available (capacity 3), unlike an invented option.
    const option = page.getByRole("option", { name: /Accueil.*10/ }).first()
    await option.waitFor()
    for (let n = 0; n < 12 && await picker.getAttribute("aria-activedescendant") !== await option.getAttribute("id"); n++) await page.keyboard.press("ArrowDown")
    assert.equal(await picker.getAttribute("aria-activedescendant"), await option.getAttribute("id"))
    await page.keyboard.press("Enter")
    await at(0.68)
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("registrations"))
    await activate(page, page.getByRole("button", { name: "Ajouter", exact: true }))
    const response = await submitted; assert(response.ok(), "Synthetic manual add must really succeed")
    await page.getByText(`${name} Exemple`, { exact: true }).first().waitFor()
    await evidence("error", { genuineError: true, applicationRestoredFocus: true, actualAddedPerson: name, responseStatus: response.status() })
  })
  await scene("planning", async at => {
    await go(`${adminPath}/shifts`)
    const list = page.getByRole("button", { name: "Liste", exact: true })
    await at(0.13); await activate(page, list); assert.equal(await list.getAttribute("aria-pressed"), "true")
    const opener = page.getByRole("button", { name: /^Modifier le créneau/ }).first()
    await at(0.27); await activate(page, opener)
    const editor = page.getByRole("group").filter({ has: page.getByLabel("Libellé", { exact: true }) })
    await editor.waitFor(); await at(0.4); await activate(page, editor.getByRole("button", { name: "Annuler", exact: true })); await focused(opener)
    await at(0.51); await activate(page, page.getByRole("button", { name: "Gérer les postes", exact: true }))
    const order = page.getByRole("list", { name: "Ordre des postes", exact: true })
    const before = await order.getByRole("listitem").allTextContents()
    const down = order.getByRole("button", { name: /^Descendre le poste/ }).first()
    await at(0.64); await activate(page, down); await focused(down)
    const after = await order.getByRole("listitem").allTextContents(); assert.notDeepEqual(after, before)
    await at(0.74); await activate(page, page.getByRole("button", { name: "Enregistrer l'ordre", exact: true }))
    await settle(page); await at(0.85); await page.reload(); await settle(page)
    await activate(page, page.getByRole("button", { name: "Gérer les postes", exact: true }))
    assert.deepEqual(await order.getByRole("listitem").allTextContents(), after)
    await evidence("planning", { listPressed: true, cancelRestoresFocus: true, realReorderPersisted: true })
  })
  await scene("zoom", async () => { await native.zoom.insert(zoomPlan) })
  await scene("mobile", async at => {
    const picker = await manual("Aline", fixtureEmail)
    const original = page.viewportSize(); assert(original)
    try {
      await page.setViewportSize({ width: 320, height: 800 })
      await at(0.2); await tabTo(page, picker); await page.keyboard.press("ArrowDown"); await warnings()
      const list = page.getByRole("listbox"); const bounds = await list.boundingBox()
      assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320, "Dropdown must fit actual simulated viewport")
      await at(0.5); await page.keyboard.press("End")
      await at(0.75); await page.keyboard.press("Escape")
      const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
      await evidence("mobile", { simulatedNotPhysicalDevice: true, actualWarnings: true, listFits: true, ...widths })
    } finally { await page.setViewportSize(original) }
  })
  await scene("contrast", async at => {
    const picker = await manual("Aline", fixtureEmail)
    await tabTo(page, picker); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await page.keyboard.press("ArrowDown")
    try {
      for (const [fraction, colorScheme] of [[0.18, "light"], [0.47, "dark"]] as const) {
        await at(fraction); await page.emulateMedia({ forcedColors: "active", colorScheme })
        assert(await page.evaluate(() => matchMedia("(forced-colors: active)").matches))
        await focused(picker)
      }
      await at(0.69); await go("/admin/settings/admins")
      const insurance = page.getByRole("switch", { name: "Assurance RC fournie par l'organisation", exact: true })
      await insurance.waitFor(); const old = await insurance.getAttribute("aria-checked")
      await activate(page, insurance); assert.notEqual(await insurance.getAttribute("aria-checked"), old)
      await at(0.85); await activate(page, insurance); assert.equal(await insurance.getAttribute("aria-checked"), old)
      await evidence("contrast", { chromiumEmulationOnly: true, palettes: ["light", "dark"], actualSwitchToggle: true })
    } finally { await page.emulateMedia({ forcedColors: "none", colorScheme: "light" }) }
  })
  await scene("reader", async () => { await native.reader.insert(readerPlan) })
  await scene("limits", async at => {
    await go(publicPath)
    await at(0.2); await activate(page, page.getByRole("link", { name: "Accessibilité", exact: true }))
    await page.getByRole("heading", { name: /Accessibilité/i }).first().waitFor()
    await at(0.5); await page.getByText(/Partiellement conforme/i).first().scrollIntoViewIfNeeded()
    await at(0.75); const contact = page.locator('a[href^="mailto:"]').first(); await contact.scrollIntoViewIfNeeded()
    await evidence("limits", { actualStatement: true, contactShownNotSent: true })
  })
}
