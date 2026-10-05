// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Page, Locator } from "playwright"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { showActivityCsv } from "./show-activity-csv"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

export async function recordOrgActivity(options: { page: Page; base: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, scene, tap, settle } = options
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated video database required")
  const prepared = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8"))
  const preflight = JSON.parse(await readFile(path.join(directory, "export-preflight.json"), "utf8"))
  if (prepared.organizationId !== "video-org-activity" || prepared.distinctActors !== 2 || !preflight.memberActivityHasActualRegistration || preflight.rows !== 61) throw new Error("Real two-session preparation and CSV preflight required")
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const journal = "/admin/settings/activity"
  const filter = async (value: string) => {
    const select = page.getByLabel("Filtrer par type", { exact: true })
    await tap(page, select); await select.selectOption(value); await settle(page)
    if (await select.inputValue() !== value) throw new Error("Real organization filter did not change")
  }
  const entries = () => page.locator("main ul[role='list'] > li")
  const checks: Record<string, unknown> = {}
  await go("/admin/settings/admins")
  await scene("welcome", async at => {
    await page.screencast.showChapter(title, { duration: 2400 })
    await at(0.25); await tap(page, page.getByRole("link", { name: "Journal d'activité", exact: true }))
    await page.getByRole("heading", { name: "Journal d'activité", exact: true }).waitFor()
  })
  await scene("read", async at => {
    const texts = await entries().allTextContents()
    if (texts.length !== 50 || !texts.some(text => text.includes("Colette Exemple")) || !texts.some(text => text.includes("Samira Exemple"))) throw new Error("Both actual authors must be visible in the first page")
    await at(0.15); await entries().filter({ hasText: "Colette Exemple" }).first().scrollIntoViewIfNeeded()
    await at(0.40); await entries().filter({ hasText: "Samira Exemple" }).first().scrollIntoViewIfNeeded()
    checks.realAuthors = ["Colette Exemple", "Samira Exemple"]
  })
  await scene("members", async at => {
    await at(0.06); await filter("Member")
    await at(0.14); await entries().filter({ hasText: "a créé un membre" }).first().scrollIntoViewIfNeeded()
    await at(0.24); await entries().filter({ hasText: "a modifié un membre" }).scrollIntoViewIfNeeded()
    await at(0.33); await entries().filter({ hasText: "a désactivé un membre" }).scrollIntoViewIfNeeded()
    await at(0.47); await go(`/admin/members/${prepared.firstMemberId}`)
    await page.getByRole("heading", { name: "Activité de Aline Exemple 01", exact: true }).waitFor()
    if (!(await page.locator("ol li").allTextContents()).some(text => text.includes("Accueil"))) throw new Error("Real member registration missing from chronology")
    await at(0.65); await page.locator("ol li").first().scrollIntoViewIfNeeded()
    await at(0.76); await go(journal)
    checks.memberActivityNotEmpty = true
  })
  await scene("team", async at => {
    await at(0.08); await filter("AdminUser")
    await at(0.23); await entries().filter({ hasText: "a invité un admin" }).scrollIntoViewIfNeeded()
    await at(0.36); await entries().filter({ hasText: "a changé le rôle" }).scrollIntoViewIfNeeded()
    await at(0.65); await filter("Organization")
    await entries().filter({ hasText: "réglages de notification" }).waitFor()
    checks.actualInvitationRoleAndSetting = true
  })
  await scene("filters", async at => {
    await at(0.16); await filter("Member")
    await at(0.35); await filter("AdminUser")
    if (await entries().count() !== 2) throw new Error("Admin filter must contain actual invitation and role change only")
    await at(0.56); await filter("")
    if (await entries().count() !== 50 || await page.getByRole("tab", { name: "Rejouer", exact: true }).count()) throw new Error("Organization journal must show its actual controls, not event replay")
    checks.actualTypeFilters = true
  })
  await scene("pages", async at => {
    const before = await entries().count()
    await at(0.13); await page.getByRole("button", { name: "Charger plus", exact: true }).scrollIntoViewIfNeeded()
    await at(0.29); await tap(page, page.getByRole("button", { name: "Charger plus", exact: true })); await settle(page)
    const after = await entries().count()
    if (before !== 50 || after !== 61) throw new Error("Actual load-more must extend 50 entries to 61")
    await at(0.43); await entries().last().scrollIntoViewIfNeeded()
    await at(0.59); await filter("NotificationOutbox")
    await page.getByText("Aucune activité pour l'instant.", { exact: true }).waitFor()
    await at(0.75); await filter("")
    checks.pagination = { before, after, emptyEmailFilterVerified: true }
  })
  await go(journal); await filter("AdminUser")
  await scene("export", async at => {
    await at(0.09)
    const downloading = page.waitForEvent("download")
    await tap(page, page.getByRole("link", { name: /Exporter tout le journal/ }))
    const download = await downloading
    const file = path.join(directory, "organization-activity-capture.csv")
    await download.saveAs(file)
    await at(0.28)
    const csv = await showActivityCsv(page, file)
    if (csv.sha256 !== preflight.fileSha256 || csv.rows !== 61) throw new Error("Capture download differs from independently reconciled CSV")
    await at(0.48); await page.locator(".scroll").evaluate(element => { element.scrollLeft = element.scrollWidth })
    await at(0.66); await page.locator(".scroll").evaluate(element => { element.scrollTop = element.scrollHeight })
    await at(0.80); await page.locator(".scroll").evaluate(element => { element.scrollLeft = 0 })
    checks.csv = { ...csv, downloadedWhileFiltered: true, unmodified: true }
  })
  await scene("limits", async at => {
    await at(0.30); await go(journal)
    await entries().filter({ hasText: "Samira Exemple" }).first().scrollIntoViewIfNeeded()
    checks.noRestoreOrProofOfReadingClaim = true
  })
  await scene("result", async at => {
    await at(0.60); await go(`/admin/members/${prepared.firstMemberId}`)
    await page.getByRole("heading", { name: "Activité de Aline Exemple 01", exact: true }).waitFor()
  })
  await writeFile(path.join(directory, "organization-activity-capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: "actual local interactions and read-only CSV; not full audiovisual validation", ...checks }, null, 2))
}
