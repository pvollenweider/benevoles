// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Private journey: no API mutation shortcut, no fabricated PDF or spreadsheet. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import type { Locator, Page } from "playwright"
import type { ProductBuild } from "./product-build"

export type HoursScenario = {
  organizationId: string; organizationName: string; organizationSlug: string; product: ProductBuild
  members: { id: string; firstName: string; lastName: string; email: string; plannedMinutes: number; attestedMinutes: number }[]
  rows: { id: string; volunteerId: string; eventId: string; localDate: string; status: string; shiftStatus: string; minutes: number; checkedInAt: string | null }[]
  confirmedSummary: { distinct: number; firstTime: number; returning: number; confirmed: number; withPresence: number; plannedMinutes: number; attestedMinutes: number }
}
export const HOURS_MEMBER = "video-hours-aline"
export const HOURS_EVENT = "video-hours-event-september"
export function assertHoursScenario(scenario: HoursScenario, product: ProductBuild, now = new Date()) {
  assert(scenario.organizationId === "video-hours" && scenario.organizationName === "Formation — heures et attestations" && scenario.organizationSlug === "formation-heures")
  assert(scenario.product.commit === product.commit && scenario.product.buildId === product.buildId && scenario.product.productSourceSha256 === product.productSourceSha256, "Current compiled hours fixture required")
  assert(now.toISOString().slice(0, 10) > "2026-09-12" && now.toISOString().slice(0, 10) < "2026-11-28", "Re-date and revalidate this training scenario before another period")
  assert.equal(scenario.members.length, 3)
  for (const [name, planned, attested] of [["aline", 480, 360], ["benoit", 120, 0], ["clara", 0, 0]] as const) {
    const member = scenario.members.find(m => m.id === `video-hours-${name}`)
    assert(member && member.firstName === ({ aline: "Aline", benoit: "Benoît", clara: "Clara" }[name]) && member.lastName === "Exemple" && member.email === `video.hours.${name}@example.org`)
    assert.equal(member.plannedMinutes, planned); assert.equal(member.attestedMinutes, attested)
  }
  assert.equal(scenario.rows.length, 8)
  assert(new Set(scenario.rows.map(r => r.id)).size === 8)
  const expected = [
    ["prior", "aline", "may", "2026-05-02", "active", "open", 240, true],
    ["morning", "aline", "september", "2026-09-12", "active", "open", 120, true],
    ["afternoon", "aline", "september", "2026-09-12", "active", "open", 120, false],
    ["benoit", "benoit", "september", "2026-09-12", "active", "open", 120, false],
    ["cancelled-shift", "aline", "september", "2026-09-12", "active", "cancelled", 120, true],
    ["cancelled-registration", "aline", "september", "2026-09-12", "cancelled", "open", 120, false],
    ["waiting", "aline", "september", "2026-09-12", "waiting", "open", 120, false],
    ["future", "aline", "future", "2026-11-28", "active", "open", 240, false],
  ] as const
  for (const [id, member, event, date, status, shiftStatus, minutes, checked] of expected) {
    const row = scenario.rows.find(r => r.id === `video-hours-registration-${id}`)
    assert(row && row.volunteerId === `video-hours-${member}` && row.eventId === `video-hours-event-${event}` && row.localDate === date && row.status === status && row.shiftStatus === shiftStatus && row.minutes === minutes && Boolean(row.checkedInAt) === checked, `Owned actual registration differs: ${id}`)
  }
  assert.deepEqual(scenario.confirmedSummary, { distinct: 2, firstTime: 1, returning: 1, confirmed: 3, withPresence: 1, plannedMinutes: 360, attestedMinutes: 120 })
}

/** Synthetic fixture values have no quotes/separators; reject a changed CSV
 * rather than silently parsing a different or potentially sensitive document. */
export function assertHoursCsv(csv: string, includeAll: boolean) {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).map(line => line.split(";"))
  assert.deepEqual(lines[0], ["Prénom", "Nom", "Événements", "Créneaux", "Heures planifiées", "Heures attestées"])
  assert.deepEqual(lines.slice(1), [
    ["Aline", "Exemple", "1", "2", "4", "2"],
    ["Benoît", "Exemple", "1", "1", "2", "0"],
    ...(includeAll ? [["Clara", "Exemple", "0", "0", "0", "0"]] : []),
    ["Total", "", "", "3", "6", "2"],
  ])
  assert(!csv.includes("@") && !csv.includes("079"), "Hours export must not include contact details")
}

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
type PrintedPdf = { path: string; sha256: string; text: string; pages: number; printedFrom: string; product: ProductBuild; method: "native-print-dialog" | "browser-print-engine" }
export type HoursRecordingOptions = {
  page: Page; base: string; product: ProductBuild; scene: Scene
  tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void>
  /** Independent synthetic fixture verified with current-product Prisma only.
   * Numeric totals must come from main's counting helpers, not this module. */
  readScenario: () => Promise<HoursScenario>
  setFrenchDate: (page: Page, field: Locator, isoDate: string) => Promise<void>
  showDownloadedCsv: (page: Page, file: string, includeAll: boolean) => Promise<void>
  /** Arm actual browser print capture BEFORE clicking the real product button.
   * Callback must show the generated PDF and extract its text (no HTML stand-in).
   * browser-print-engine is explicitly a local training print, not a server
   * download feature or a native dialog validation. Never replace window.print. */
  preparePrintedPdf: (page: Page) => Promise<() => Promise<PrintedPdf>>
  evidence: (chapter: string, facts: Record<string, unknown>) => Promise<void>
}

export async function recordVolunteerHours(options: HoursRecordingOptions) {
  const { page, base, product, scene, tap, settle, readScenario, setFrenchDate, showDownloadedCsv, preparePrintedPdf, evidence } = options
  const url = new URL(base)
  assert(url.origin === base && base === "http://localhost:43114", "Hours journey requires its explicitly dedicated localhost:43114 server; integration must authorize this port separately")
  const read = async () => { const scenario = await readScenario(); assertHoursScenario(scenario, product); return scenario }
  await read()
  const go = async (pathname: string) => { await page.goto(`${base}${pathname}`); await settle(page) }
  const certificatePath = `/admin/members/${HOURS_MEMBER}/certificate`
  const row = () => page.getByRole("row").filter({ has: page.getByRole("link", { name: "Activité de Aline Exemple", exact: true }) })
  await go("/admin/members")
  await scene("hours-list", async () => {
    await page.getByRole("columnheader", { name: "Heures planifiées", exact: true }).scrollIntoViewIfNeeded()
    await page.getByRole("columnheader", { name: "Heures attestées", exact: true }).waitFor()
    await row().scrollIntoViewIfNeeded()
    const cells = row().getByRole("cell")
    // Columns are read by their current header rather than a stale fixed index.
    const headers = (await page.getByRole("table", { name: "Liste des membres", exact: true }).getByRole("columnheader").allTextContents()).map(text => text.replace(/[↕↑↓]/g, "").trim())
    assert(headers.includes("Heures planifiées") && headers.includes("Heures attestées"), "Current hours columns are required")
    assert.equal((await cells.nth(headers.findIndex(h => h.trim() === "Heures planifiées")).innerText()).trim(), "8h")
    assert.equal((await cells.nth(headers.findIndex(h => h.trim() === "Heures attestées")).innerText()).trim(), "6h")
    await evidence("hours-list", { plannedHours: 8, attestedHours: 6, futureAndCancelledExcluded: true, attestedIsSubsetNotAdditional: true })
  })
  await scene("activity", async () => {
    await tap(page, row().getByRole("link", { name: "Activité de Aline Exemple", exact: true }))
    await page.getByRole("heading", { name: "Activité de Aline Exemple", exact: true }).waitFor()
    await page.getByRole("list", { name: "Chronologie", exact: true }).scrollIntoViewIfNeeded()
    await evidence("activity", { realFactualChronologyShown: true, hoursColumnsAreOnMembersListNotThisPage: true })
  })
  await scene("period-export", async at => {
    await go("/admin/members")
    await tap(page, page.locator("summary").filter({ hasText: "Heures par bénévole, pour une période (CSV)" }))
    const form = page.locator('form[action="/api/admin/members/export-hours"]')
    await setFrenchDate(page, form.getByLabel("Du", { exact: true }), "2026-09-01")
    await setFrenchDate(page, form.getByLabel("Au", { exact: true }), "2026-09-30")
    const include = form.getByRole("checkbox", { name: "Inclure les membres sans créneau confirmé sur la période", exact: true })
    assert.equal(await include.isChecked(), false)
    const download = async (all: boolean) => {
      const waiting = page.waitForEvent("download")
      await tap(page, form.getByRole("button", { name: /^Télécharger \(CSV\)/ }))
      const received = await waiting; const file = await received.path(); assert(file)
      assertHoursCsv(await readFile(file, "utf8"), all)
      return file
    }
    const first = await download(false)
    await at(0.45); await tap(page, include)
    const second = await download(true)
    await at(0.65); await showDownloadedCsv(page, second, true)
    await evidence("period-export", { actualDownloads: 2, firstFileChecked: Boolean(first), includeZeroMemberVerified: true, plannedHours: 6, attestedHours: 2, period: "September2026" })
  })
  await scene("certificate-settings", async at => {
    await go(`/admin/members/${HOURS_MEMBER}`)
    await tap(page, page.getByRole("link", { name: "Attestation de bénévolat", exact: true }))
    await setFrenchDate(page, page.getByLabel("Du", { exact: true }), "2026-05-01")
    await setFrenchDate(page, page.getByLabel("Au", { exact: true }), "2026-09-30")
    const note = page.getByLabel("Texte libre (facultatif)", { exact: true })
    await at(0.4); await tap(page, note); await note.pressSequentially("Accueil du public et rangement du matériel.", { delay: 75 })
    await page.getByRole("article", { name: "Attestation de bénévolat", exact: true }).scrollIntoViewIfNeeded()
    await evidence("certificate-settings", { actualLivePreview: true, period: "MayToSeptember2026", actualNoteEntered: true })
  })
  await scene("certificate-presence", async at => {
    const include = page.getByRole("checkbox", { name: "Inclure les heures planifiées sans présence saisie", exact: true })
    assert.equal(await include.isChecked(), false)
    const table = page.getByRole("table")
    assert.equal(await table.getByRole("columnheader", { name: "Heures planifiées (sans présence)", exact: true }).count(), 0)
    await table.getByRole("columnheader", { name: "Heures attestées", exact: true }).scrollIntoViewIfNeeded()
    await at(0.45); await tap(page, include)
    await table.getByRole("columnheader", { name: "Heures planifiées (sans présence)", exact: true }).waitFor()
    const total = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Total", exact: true }) })
    assert.match((await total.innerText()).replace(/\s+/g, " "), /6\s*h.*2\s*h/)
    await evidence("certificate-presence", { attestedHours: 6, additionalPlannedWithoutPresenceHours: 2, notEightPlusSix: true, noClockedWorkedHoursClaim: true })
  })
  await scene("certificate-pdf", async () => {
    const finishPrint = await preparePrintedPdf(page)
    const posted = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/admin/members/${HOURS_MEMBER}/certificate`)
    await tap(page, page.getByRole("button", { name: "Générer et imprimer l'attestation", exact: true }))
    const response = await posted; assert(response.ok())
    const pdf = await finishPrint()
    const bytes = await readFile(pdf.path)
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-")
    assert.equal(createHash("sha256").update(bytes).digest("hex"), pdf.sha256)
    assert.equal(pdf.printedFrom, `${base}${certificatePath}`)
    assert(pdf.product.commit === product.commit && pdf.product.buildId === product.buildId && pdf.product.productSourceSha256 === product.productSourceSha256)
    assert(pdf.pages >= 1 && pdf.text.includes("Attestation de bénévolat") && pdf.text.includes("Aline Exemple") && pdf.text.includes("Signature") && pdf.text.includes("Nom du signataire"))
    // PDF text extraction follows physical column order: the narrow header
    // wraps “Heures” and “attestées” onto different lines/interleaved columns.
    // The real UI header has already been checked above; do not mistake that
    // layout extraction for missing document content.
    const pdfText = pdf.text.replace(/\s+/g, " ")
    assert(pdfText.includes("Heures") && pdfText.includes("attestées") && pdfText.includes("sans présence") && pdfText.includes("Accueil du public et rangement du matériel."))
    await evidence("certificate-pdf", { actualPdfSha256: pdf.sha256, actualPdfPages: pdf.pages, method: pdf.method, realProductPrintActionLogged: true, serverPdfDownloadFeature: false, stillRequiresHumanReviewAndSignature: true })
  })
  await scene("event-summary", async () => {
    await go(`/admin/events/${HOURS_EVENT}/print`)
    const section = page.locator('section[aria-labelledby="reports-summary"]')
    await section.getByRole("heading", { name: "Résumé de l'événement", exact: true }).scrollIntoViewIfNeeded()
    const text = (await section.innerText()).replace(/\s+/g, " ")
    assert(text.includes("2 bénévoles distincts") && text.includes("1 pour la première fois") && text.includes("1 de retour"))
    assert(text.includes("Présences saisies pour 1 sur 3 créneaux confirmés") && text.includes("6 h planifiées, dont 2 h attestées"))
    await section.getByRole("table", { name: "Remplissage par poste", exact: true }).scrollIntoViewIfNeeded()
    await evidence("event-summary", { distinctPeopleNotRegistrations: true, partialCheckInNotAbsenceClaim: true, plannedHours: 6, attestedHours: 2, currentRealReportsSummary: true })
  })
  await read()
}
