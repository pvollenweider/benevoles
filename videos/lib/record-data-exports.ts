// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Page, Locator } from "playwright"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { showMembersCsv, showArchiveJson } from "./show-export-files"
import { showActivityCsv } from "./show-activity-csv"
import { loadCurrentVideoPrisma } from "./current-product-prisma"
import { verifyExportClassroom } from "./verify-export-review-fixture"
import type { Cue } from "./sentence-timing"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>

export async function recordDataExports(options: { page: Page; base: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, directory, title, scene, tap, settle } = options
  if (base !== "http://localhost:43102") throw new Error("Exact verified export server required")
  const runtime = await loadCurrentVideoPrisma(base)
  try { await verifyExportClassroom(runtime.db) } finally { await runtime.db.$disconnect(); await runtime.unregister() }
  const preparationProduct = JSON.parse(await readFile(path.join(directory, "product-preparation.json"), "utf8"))
  if (preparationProduct.commit !== runtime.product.commit || preparationProduct.buildId !== runtime.product.buildId || preparationProduct.productSourceSha256 !== runtime.product.productSourceSha256) throw new Error("Export preflight must come from this current build")
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
    await at("Nous allons récupérer les membres"); await page.getByRole("link", { name: /^Exporter les membres/ }).scrollIntoViewIfNeeded()
  })
  await scene("members", async at => {
    await at("Il contient les membres de"); await tap(page, page.getByPlaceholder("Rechercher (nom, email, téléphone)…"))
    await page.getByPlaceholder("Rechercher (nom, email, téléphone)…").pressSequentially("Léa", { delay: 180 })
    if (await page.getByRole("table", { name: "Liste des membres" }).locator("tbody tr").count() !== 1) throw new Error("Actual search must show Léa only")
    await at("Gardons un filtre visible, téléchargeons"); membersFile = await download(page.getByRole("link", { name: /^Exporter les membres/ }), "members-capture.csv")
    await at("On retrouve aussi une personne")
    const csv = await showMembersCsv(page, membersFile)
    memberSha = csv.sha256
    if (csv.rows.length !== 4 || !csv.rows.some(row => row[0] === "Étienne" && row[5] === "non")) throw new Error("Filtered-page export must include actual inactive member")
    await at("Le téléchargement ne réactive personne"); await page.getByRole("row").filter({ hasText: "Étienne" }).scrollIntoViewIfNeeded()
    checks.members = { exportedWithSearch: true, rows: 4, includesInactive: true }
  })
  const showColumn = async (name: string) => {
    await page.getByRole("columnheader", { name, exact: true }).evaluate(element => element.scrollIntoView({ block: "nearest", inline: "start" }))
  }
  await scene("columns", async at => {
    await at("Lisons le prénom, le nom"); await page.locator(".scroll").evaluate(element => { element.scrollLeft = 0 })
    await at("En faisant défiler les colonnes"); await showColumn("Date de naissance")
    await at("Les derniers envois indiquent les"); await showColumn("Derniers envois (résultat)")
    await at("La dernière acceptation de la"); await showColumn("Convention acceptée (dernière fois)")
    await at("Les notes sont donc dans"); await showColumn("Notes")
  })
  await scene("csv", async at => {
    await at("Les accents sont conservés et"); await page.locator(".scroll").evaluate(element => { element.scrollLeft = 0 })
    await at("Regardez ce numéro qui commence"); await page.getByRole("cell", { name: "'+41 79 000 9900", exact: true }).scrollIntoViewIfNeeded()
    await at("Une valeur qui commence par"); await page.getByRole("cell", { name: "'=1+1", exact: true }).scrollIntoViewIfNeeded()
    checks.csvLiteralValuesVisible = true
  })
  await go("/admin/settings/admins")
  await scene("journal", async at => {
    await at("Pour garder une copie des"); await tap(page, page.getByRole("link", { name: "Journal d'activité", exact: true })); await settle(page)
    await at("Choisissons un type, puis Exporter"); await tap(page, page.getByLabel("Filtrer par type", { exact: true })); await page.getByLabel("Filtrer par type", { exact: true }).selectOption("Organization"); await settle(page)
    if (await page.locator("main ul[role='list'] li").count() !== 1) throw new Error("Actual organization filter must show one setting")
    await at("Choisissons un type, puis Exporter"); journalFile = await download(page.getByRole("link", { name: /^Exporter tout le journal/ }), "activity-capture.csv")
    await at("Il indique la date, l'acteur"); const csv = await showActivityCsv(page, journalFile)
    if (csv.rows !== prepared.journalEntries) throw new Error("Journal export must include the hidden member action too")
    await at(0.52) /* mid-sentence */; await page.locator(".scroll").evaluate(element => { element.scrollLeft = element.scrollWidth })
    checks.fullJournalDespiteFilter = true
  })
  await go(`/admin/events/${prepared.eventId}`)
  await scene("archive", async at => {
    await at("Pour conserver un événement complet"); await tap(page, page.getByRole("link", { name: "Documents", exact: true })); await settle(page)
    await at("Pour conserver un événement complet"); await page.getByRole("heading", { name: "Archive", exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(700)
    await at("Le lien Archive de l’événement"); archiveFile = await download(page.getByRole("link", { name: /^Archive de l'événement \(JSON\)/ }), "event-archive-capture.json")
    await at("Le JSON n’est pas une"); const json = await showArchiveJson(page, archiveFile)
    checks.archive = json
    await at("Il est limité à cet"); await tap(page, page.getByLabel("Partie du fichier :", { exact: true })); await page.getByLabel("Partie du fichier :", { exact: true }).selectOption("event")
  })
  await scene("contents", async at => {
    const select = async (key: string) => { await tap(page, page.getByLabel("Partie du fichier :", { exact: true })); await page.getByLabel("Partie du fichier :", { exact: true }).selectOption(key) }
    await at("On retrouve les réglages, les"); await select("event")
    await at("On retrouve les réglages, les"); await select("shifts")
    await at("On retrouve les réglages, les"); await select("registrations")
    await at("Les pages, les questions et"); await select("pages")
    await at("Les pages, les questions et"); await select("questions")
    await at("Les pages, les questions et"); await select("sectorLeaders")
    await at("Les pages, les questions et"); await select("milestones")
    await at("Les pages, les questions et"); await select("log")
    await at("Des nombres récapitulent plusieurs de"); await select("counts")
    await at("Vérifions un créneau et une"); await select("shifts")
    if (!(await page.locator("pre").innerText()).includes('"10:00"')) throw new Error("Actual example shift not visible when narrated")
    await at("Vérifions un créneau et une"); await select("questions")
    await page.locator("pre").evaluate(element => { element.scrollTop = element.scrollHeight })
    if (!(await page.locator("pre").innerText()).includes('"M"')) throw new Error("Actual answer not visible in archive viewer")
    checks.collectionsActuallyOpened = true
  })
  await scene("privacy", async at => {
    await at("Si une fiche change dans")
    const edited = await page.request.patch(`${base}/api/admin/members/video-data-exports-member-0`, { data: { phone: "+41 79 000 9001" } })
    if (!edited.ok()) throw new Error("Actual local profile modification failed")
    await go("/admin/members")
    await page.getByText("+41 79 000 9001", { exact: true }).waitFor()
    await at("Si une fiche change dans"); const csv = await showMembersCsv(page, membersFile)
    if (csv.sha256 !== memberSha || !csv.rows.some(row => row[3] === "'+41 79 000 9900")) throw new Error("Previously downloaded copy changed with actual profile")
    await at("Consultez les durées de conservation"); await go("/doc/exporter-et-conserver-ses-donnees")
    await page.getByRole("heading", { name: "Exporter et conserver ses données", exact: true }).scrollIntoViewIfNeeded()
    await at("Consultez les durées de conservation"); await page.getByText("Durées de conservation", { exact: true }).scrollIntoViewIfNeeded()
    await at("Il n'y a pas de"); await showArchiveJson(page, archiveFile)
    checks.copyRemainsFrozenAfterActualModification = true
  })
  await go("/admin/members")
  await scene("result", async at => {
    await at("Pour relire les actions de"); await go("/admin/settings/activity")
    await at("Pour conserver un événement et"); await go(`/admin/events/${prepared.eventId}/print`)
    await page.getByRole("heading", { name: "Archive", exact: true }).scrollIntoViewIfNeeded()
    await at("Les plannings et les listes"); await page.getByRole("heading", { name: "Documents à imprimer", exact: true }).scrollIntoViewIfNeeded()
    await page.getByRole("heading", { name: "À afficher ou à remettre aux bénévoles", exact: true }).waitFor({ state: "visible" })
  })
  const files = await Promise.all([membersFile, journalFile, archiveFile].map(async file => ({ file: path.basename(file), sha256: createHash("sha256").update(await readFile(file)).digest("hex") })))
  await writeFile(path.join(directory, "export-capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: "actual local downloads, literal file views and frozen copy check; not full audiovisual or native spreadsheet validation", ...checks, files }, null, 2))
}
