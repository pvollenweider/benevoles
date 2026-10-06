// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Page, Locator } from "playwright"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { showMembersCsv, showArchiveJson } from "./show-export-files"
import { showActivityCsv } from "./show-activity-csv"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

export async function recordDataExports(options: { page: Page; base: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, scene, tap, settle } = options
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated video database required")
  const prepared = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8"))
  if (prepared.organizationId !== "video-data-exports" || !prepared.secretKeysAndKnownTokensAbsent || !prepared.formulaAndPhoneApostrophesVerified) throw new Error("Actual export preflight required")
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const download = async (link: Locator, name: string) => {
    await link.waitFor()
    const pending = page.waitForEvent("download")
    await tap(page, link)
    const file = path.join(directory, name)
    await (await pending).saveAs(file)
    return file
  }
  const checks: Record<string, unknown> = {}
  let membersFile = "", journalFile = "", archiveFile = "", memberSha = ""
  await go("/admin/members")
  // The recorder changes this phone later. A stale preflight file must not let
  // a second take start against the already-mutated fixture.
  await page.getByText("+41 79 000 9900", { exact: true }).waitFor({ timeout: 5000 })
  await scene("welcome", async at => {
    await page.screencast.showChapter(title, { duration: 2400 })
    await at(0.35); await page.getByRole("link", { name: /^Exporter les membres/ }).scrollIntoViewIfNeeded()
  })
  await scene("members", async at => {
    await at(0.10); await tap(page, page.getByPlaceholder("Rechercher (nom, email, téléphone)…"))
    await page.getByPlaceholder("Rechercher (nom, email, téléphone)…").pressSequentially("Léa", { delay: 180 })
    if (await page.getByRole("table", { name: "Liste des membres" }).locator("tbody tr").count() !== 1) throw new Error("Actual search must show Léa only")
    await at(0.51); membersFile = await download(page.getByRole("link", { name: /^Exporter les membres/ }), "members-capture.csv")
    await at(0.59)
    const csv = await showMembersCsv(page, membersFile)
    memberSha = csv.sha256
    if (csv.rows.length !== 4 || !csv.rows.some(row => row[0] === "Étienne" && row[5] === "non")) throw new Error("Filtered-page export must include actual inactive member")
    await at(0.72); await page.getByRole("row").filter({ hasText: "Étienne" }).scrollIntoViewIfNeeded()
    checks.members = { exportedWithSearch: true, rows: 4, includesInactive: true }
  })
  await scene("columns", async at => {
    await at(0.10); await page.locator(".scroll").evaluate(element => { element.scrollLeft = 0 })
    await at(0.28); await page.locator(".scroll").evaluate(element => { element.scrollLeft = 650 })
    await at(0.46); await page.locator(".scroll").evaluate(element => { element.scrollLeft = element.scrollWidth })
    await page.getByRole("cell", { name: "'=1+1", exact: true }).waitFor()
  })
  await scene("csv", async at => {
    await at(0.15); await page.locator(".scroll").evaluate(element => { element.scrollLeft = 250 })
    await page.getByRole("cell", { name: "'+41 79 000 9900", exact: true }).waitFor()
    await at(0.49); await page.locator(".scroll").evaluate(element => { element.scrollLeft = element.scrollWidth })
    await page.getByRole("cell", { name: "'=1+1", exact: true }).waitFor()
    checks.csvLiteralValuesVisible = true
  })
  await go("/admin/settings/admins")
  await scene("journal", async at => {
    await at(0.10); await tap(page, page.getByRole("link", { name: "Journal d'activité", exact: true })); await settle(page)
    await at(0.16); await tap(page, page.getByLabel("Filtrer par type", { exact: true })); await page.getByLabel("Filtrer par type", { exact: true }).selectOption("Organization"); await settle(page)
    if (await page.locator("main ul[role='list'] li").count() !== 1) throw new Error("Actual organization filter must show one setting")
    await at(0.25); journalFile = await download(page.getByRole("link", { name: /^Exporter tout le journal/ }), "activity-capture.csv")
    await at(0.37); const csv = await showActivityCsv(page, journalFile)
    if (csv.rows !== prepared.journalEntries) throw new Error("Journal export must include the hidden member action too")
    await at(0.52); await page.locator(".scroll").evaluate(element => { element.scrollLeft = element.scrollWidth })
    checks.fullJournalDespiteFilter = true
  })
  await go(`/admin/events/${prepared.eventId}`)
  await scene("archive", async at => {
    await at(0.10); await tap(page, page.getByRole("link", { name: "Rapports", exact: true })); await settle(page)
    await at(0.17); await page.getByRole("heading", { name: "Archive", exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(700)
    await at(0.24); archiveFile = await download(page.getByRole("link", { name: /^Archive de l'événement \(JSON\)/ }), "event-archive-capture.json")
    await at(0.48); const json = await showArchiveJson(page, archiveFile)
    checks.archive = json
    await at(0.70); await tap(page, page.getByLabel("Partie du fichier :", { exact: true })); await page.getByLabel("Partie du fichier :", { exact: true }).selectOption("event")
  })
  await scene("contents", async at => {
    const select = async (key: string) => { await tap(page, page.getByLabel("Partie du fichier :", { exact: true })); await page.getByLabel("Partie du fichier :", { exact: true }).selectOption(key) }
    await at(0.04); await select("event")
    await at(0.12); await select("shifts")
    await at(0.18); await select("registrations")
    await at(0.26); await select("pages")
    await at(0.32); await select("questions")
    await at(0.36); await select("sectorLeaders")
    await at(0.40); await select("milestones")
    await at(0.44); await select("log")
    await at(0.49); await select("counts")
    await at(0.58); await select("shifts")
    if (!(await page.locator("pre").innerText()).includes('"10:00"')) throw new Error("Actual example shift not visible when narrated")
    await at(0.65); await select("questions")
    if (!(await page.locator("pre").innerText()).includes('"M"')) throw new Error("Actual answer not visible in archive viewer")
    checks.collectionsActuallyOpened = true
  })
  await scene("privacy", async at => {
    await at(0.11)
    const edited = await page.request.patch(`${base}/api/admin/members/video-data-exports-member-0`, { data: { phone: "+41 79 000 9001" } })
    if (!edited.ok()) throw new Error("Actual local profile modification failed")
    await go("/admin/members")
    await page.getByText("+41 79 000 9001", { exact: true }).waitFor()
    await at(0.27); const csv = await showMembersCsv(page, membersFile)
    if (csv.sha256 !== memberSha || !csv.rows.some(row => row[3] === "'+41 79 000 9900")) throw new Error("Previously downloaded copy changed with actual profile")
    await at(0.51); await go("/doc/exporter-et-conserver-ses-donnees")
    await page.getByRole("heading", { level: 1, name: "Exporter et conserver ses données", exact: true }).waitFor()
    await at(0.54); await page.getByRole("heading", { name: "Durées de conservation", exact: true }).scrollIntoViewIfNeeded()
    await at(0.73); await showArchiveJson(page, archiveFile)
    checks.copyRemainsFrozenAfterActualModification = true
  })
  await go("/admin/members")
  await scene("result", async at => {
    await at(0.19); await go("/admin/settings/activity")
    await at(0.38); await go(`/admin/events/${prepared.eventId}/print`)
    await page.getByRole("heading", { name: "Archive", exact: true }).scrollIntoViewIfNeeded()
  })
  const files = await Promise.all([membersFile, journalFile, archiveFile].map(async file => ({ file: path.basename(file), sha256: createHash("sha256").update(await readFile(file)).digest("hex") })))
  await writeFile(path.join(directory, "export-capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: "actual local downloads, literal file views and frozen copy check; not full audiovisual or native spreadsheet validation", ...checks, files }, null, 2))
}
