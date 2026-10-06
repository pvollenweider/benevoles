// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real Jour J UI journey. Requires a pre-existing dedicated fixture; never seeds or fakes time. */
import assert from "node:assert/strict"
import type { Locator, Page } from "playwright"

export type DayOfRecordingFixture = {
  eventId: string; registrationId: string; volunteerName: string; volunteerEmail: string; phone: string
  runningShiftId: string; upcomingShiftId: string; earlierShiftId: string; nightShiftId: string
  roleSearch: string; accentSearch: string; expectedAccentName: string
}
export function validateDayOfFixture(fixture: DayOfRecordingFixture) {
  assert(/^video-dayof-event-[a-z0-9-]+$/.test(fixture.eventId), "Dedicated owned day-of event required")
  assert(/^video-dayof-registration-[a-z0-9-]+$/.test(fixture.registrationId))
  const shifts = [fixture.runningShiftId, fixture.upcomingShiftId, fixture.earlierShiftId, fixture.nightShiftId]
  assert(shifts.every(id => /^video-dayof-shift-[a-z0-9-]+$/.test(id)) && new Set(shifts).size === 4, "Four distinct owned real temporal cases required")
  assert(/^[^@\s]+@example\.org$/.test(fixture.volunteerEmail) && /Exemple$/.test(fixture.volunteerName), "Fictional volunteer required")
  assert(/^079000\d{4}$/.test(fixture.phone.replace(/\s/g, "")), "Fictional phone required")
  assert(fixture.roleSearch && fixture.accentSearch && fixture.expectedAccentName.includes("é"), "Real role and accent-insensitive searches required")
}
type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
export type DayOfRecordingOptions = {
  page: Page; base: string; productCommit: string; fixture: DayOfRecordingFixture
  scene: Scene; settle: (page: Page) => Promise<void>; tap: (page: Page, locator: Locator) => Promise<void>
  typeNaturally: (page: Page, locator: Locator, text: string) => Promise<void>
  /** Must query the isolated fixture, not return a static assertion; no tokens in its result. */
  verifyFixture: () => Promise<{ eventId: string; registrationId: string; email: string; status: string; checkedInAt: string | null; syntheticOnly: boolean; timeCasesPreparedForActualServerNow: boolean }>
  evidence: (chapter: string, observed: Record<string, unknown>) => Promise<void>
}

export async function recordDayOf(options: DayOfRecordingOptions) {
  const { page, base, fixture: f, scene, settle, tap, typeNaturally, evidence } = options
  validateDayOfFixture(f)
  assert.equal(base, "http://localhost:43108", "Dedicated verified local Jour J product server required")
  assert(/^[a-f0-9]{40}$/.test(options.productCommit), "Caller must verify current clean product provenance")
  const original = await options.verifyFixture()
  assert(original.eventId === f.eventId && original.registrationId === f.registrationId && original.email === f.volunteerEmail && original.status === "active" && original.checkedInAt === null && original.syntheticOnly && original.timeCasesPreparedForActualServerNow, "Actual owned active fixture and real server-time cases required before mutation")
  const oldViewport = page.viewportSize()
  const url = `${base}/admin/events/${f.eventId}/day-of`
  const card = (id: string) => page.locator(`#dayof-shift-${id}`).locator("xpath=../..")
  const section = (title: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).first()
  const search = () => page.getByRole("searchbox", { name: "Rechercher un bénévole ou un poste", exact: true })
  const replaceSearch = async (value: string) => {
    const field = search()
    await tap(page, field)
    await field.press("ControlOrMeta+A")
    await field.press("Backspace")
    if (value) await typeNaturally(page, field, value)
  }
  const go = async () => { await page.goto(url); await settle(page); await page.getByRole("heading", { name: "Jour J", exact: true }).waitFor() }
  const toggle = async (present: boolean) => {
    const button = card(f.runningShiftId).getByRole("button", { name: `${present ? "Marquer présent" : "Annuler la présence"}, ${f.volunteerName}`, exact: true })
    const pending = page.waitForResponse(response => response.url() === `${base}/api/admin/events/${f.eventId}/registrations/bulk` && response.request().method() === "POST")
    await tap(page, button)
    const response = await pending
    assert(response.ok(), "Actual check-in request failed")
    const body = response.request().postDataJSON()
    assert.equal(body.action, present ? "check_in" : "undo_check_in")
    assert.deepEqual(body.registrationIds, [f.registrationId], "Only the owned registration may change")
    assert((await response.json()).changedIds?.includes(f.registrationId), "Server must actually change this registration")
    await card(f.runningShiftId).getByRole("button", { name: `${present ? "Annuler la présence" : "Marquer présent"}, ${f.volunteerName}`, exact: true }).waitFor()
  }
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await go() // Load the real screen before this chapter's narration begins.
    await scene("dayof-window", async at => {
      await section("En cours").locator(`#dayof-shift-${f.runningShiftId}`).waitFor()
      await section("En cours").locator(`#dayof-shift-${f.nightShiftId}`).waitFor()
      await at(0.3); await card(f.runningShiftId).scrollIntoViewIfNeeded()
      assert(/présent.*attendu/i.test(await card(f.runningShiftId).innerText()), "Actual presence/expected counter required")
      await at(0.55); await section("Dans les 3 prochaines heures").locator(`#dayof-shift-${f.upcomingShiftId}`).scrollIntoViewIfNeeded()
      await at(0.8); await tap(page, section("Plus tôt aujourd'hui").locator("summary"))
      await card(f.earlierShiftId).waitFor({ state: "visible" })
      await evidence("dayof-window", { actualServerTime: true, fourTemporalCasesVisible: true, mobileViewportSimulationOnly: true })
    })
    await go()
    await scene("dayof-search", async at => {
      await typeNaturally(page, search(), f.accentSearch)
      await page.getByText(f.expectedAccentName, { exact: true }).first().waitFor()
      await at(0.35); await replaceSearch(f.roleSearch)
      await page.locator('[id^="dayof-shift-"]').filter({ hasText: f.roleSearch }).first().waitFor({ state: "visible" })
      await at(0.56); await replaceSearch("")
      await card(f.runningShiftId).waitFor({ state: "visible" })
      await evidence("dayof-search", { actualAccentAndRoleSearches: true, cleared: true })
    })
    await scene("dayof-phone", async () => {
      const link = card(f.runningShiftId).getByRole("link", { name: `Appeler ${f.volunteerName} au ${f.phone}`, exact: true })
      await link.scrollIntoViewIfNeeded()
      assert.equal(await link.getAttribute("href"), `tel:${f.phone.replace(/[^\d+]/g, "")}`)
      // Show the genuine affordance, never click tel: or claim that a call occurred.
      await evidence("dayof-phone", { actualTelephoneLink: true, callPlaced: false })
    })
    await scene("dayof-checkin", async at => {
      await card(f.runningShiftId).scrollIntoViewIfNeeded()
      await at(0.12); await toggle(true)
      await at(0.45); await go()
      await card(f.runningShiftId).scrollIntoViewIfNeeded()
      const after = await options.verifyFixture()
      assert(after.checkedInAt !== null && after.status === "active", "Check-in must persist in actual fixture")
      await card(f.runningShiftId).getByRole("button", { name: `Annuler la présence, ${f.volunteerName}`, exact: true }).waitFor()
      await evidence("dayof-checkin", { serverPersisted: true, oneRegistrationOnly: true, departureOrWorkedDurationMeasured: false })
    })
    await scene("dayof-refresh", async at => {
      await page.getByRole("button", { name: "Actualiser", exact: true }).scrollIntoViewIfNeeded()
      await at(0.48)
      await tap(page, page.getByRole("button", { name: "Actualiser", exact: true }))
      await page.getByRole("status").filter({ hasText: /Liste mise à jour à/ }).waitFor()
      await at(0.6); await page.getByText(/^Mis à jour à/).waitFor()
      await evidence("dayof-refresh", { actualRefresh: true, otherDeviceMutationDemonstrated: false })
    })
    await scene("dayof-undo", async at => {
      await card(f.runningShiftId).scrollIntoViewIfNeeded(); await toggle(false)
      await at(0.24)
      await page.reload({ waitUntil: "domcontentloaded" }); await settle(page)
      await card(f.runningShiftId).scrollIntoViewIfNeeded()
      const after = await options.verifyFixture()
      assert(after.checkedInAt === null && after.status === "active", "Undo must persist without cancelling registration")
      await card(f.runningShiftId).getByRole("button", { name: `Marquer présent, ${f.volunteerName}`, exact: true }).waitFor()
      await evidence("dayof-undo", { actualUndoPersisted: true, registrationStillActive: true })
    })
  } finally { if (oldViewport) await page.setViewportSize(oldViewport) }
}
