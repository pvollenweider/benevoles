// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { chromium } from "playwright"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { verifyExportClassroom } from "../lib/verify-export-review-fixture"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "csv-parse/sync"
import { enrichExportClassroom } from "../lib/enrich-export-classroom"

async function main() {
  const base = process.env.VIDEO_BASE_URL
  if (base !== "http://localhost:43102") throw new Error("Verified export server 43102 required")
  const organizationId = "video-data-exports"
  const directory = "videos/output/data-exports-archives"
  const { db, product, tokens: { registrationToken, linkToken }, unregister } = await loadCurrentVideoPrisma(base)
  await verifyExportClassroom(db)
  const browser = await chromium.launch()
  try {
    await mkdir(directory, { recursive: true })
    const page = await browser.newPage({ acceptDownloads: true })
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.exports.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await enrichExportClassroom(db, page, directory)
    await verifyExportClassroom(db)
    const resetPhone = await page.request.patch(`${base}/api/admin/members/video-data-exports-member-0`, { data: { phone: "+41 79 000 9900" } })
    if (!resetPhone.ok()) throw new Error("Exact owned phone reset failed")
    const event = await db.event.findFirstOrThrow({ where: { organizationId, id: "video-data-exports-event" }, include: { shifts: true, registrations: true, pages: true, questions: { include: { answers: true } }, sectorLeaders: true, milestones: true } })
    if (!await db.orgLog.count({ where: { organizationId } })) {
      const modified = await page.request.patch(`${base}/api/admin/members/video-data-exports-member-0`, { data: { notes: "=1+1", phone: "+41 79 000 9900" } })
      if (!modified.ok()) throw new Error("Actual member action failed")
      const setting = await page.request.patch(`${base}/api/admin/settings/notifications`, { data: { settings: { reminders: { j1: false } } } })
      if (!setting.ok()) throw new Error("Actual organization setting action failed")
    }
    const baseline = await page.request.post(`${base}/api/admin/events/${event.id}/log/baseline`)
    if (!baseline.ok()) throw new Error("Actual baseline failed")
    const download = async (route: string, selector: string, name: string) => {
      await page.goto(`${base}${route}`)
      const link = page.getByRole("link", { name: new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })
      await link.waitFor()
      const [file] = await Promise.all([page.waitForEvent("download"), link.click()])
      await file.saveAs(path.join(directory, name))
    }
    await download("/admin/members", "Exporter les membres (CSV)", "members.csv")
    const bytes = await readFile(path.join(directory, "members.csv"))
    const [headers, ...rows] = parse(bytes, { bom: true, delimiter: ";", relax_column_count: false }) as string[][]
    const people = await db.volunteer.findMany({ where: { organizationId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })
    if (headers.length !== 14 || headers[12] !== "Derniers envois (résultat)" || headers[13] !== "Convention acceptée (dernière fois)" || rows.length !== 4 || !bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error("Actual current-main member export shape or UTF-8 BOM differs")
    for (const [index, person] of people.entries()) {
      const row = rows[index]
      const activeCount = await db.registration.count({ where: { volunteerId: person.id, status: "active" } })
      if (row[0] !== person.firstName || row[1] !== person.lastName || row[2] !== person.email || row[3] !== `'${person.phone}` || row[4] !== person.tags.join(", ") || row[5] !== (person.active ? "oui" : "non") || row[10] !== String(activeCount)) throw new Error(`Member export row ${index + 1} differs from actual profile`)
      if (row[9] !== (person.notes?.startsWith("=") || person.notes?.startsWith("@") ? `'${person.notes}` : person.notes ?? "")) throw new Error("Formula-like note is not protected as literal text")
    }
    if (!rows.some(row => row[0] === "Léa" && row[9] === "'=1+1") || !rows.some(row => row[0] === "Étienne" && row[5] === "non")) throw new Error("Accents, literal formula or inactive member missing")
    if (!rows.some(row => row[0] === "Zoé" && row[12].trim() && row[13].trim())) throw new Error("Real delivery outcome and real charter acceptance missing from member CSV")
    await download("/admin/settings/activity", "Exporter tout le journal (CSV)", "activity.csv")
    const journalRows = parse(await readFile(path.join(directory, "activity.csv")), { bom: true, delimiter: ";" }) as string[][]
    if (journalRows[0].length !== 7 || journalRows.length - 1 !== await db.orgLog.count({ where: { organizationId } })) throw new Error("Actual journal export count differs")
    await download(`/admin/events/${event.id}/print`, "Archive de l'événement (JSON)", "event-archive.json")
    const archiveText = await readFile(path.join(directory, "event-archive.json"), "utf8")
    const archive = JSON.parse(archiveText)
    if (archive.format !== "benevol-event-archive" || archive.version !== 1 || archive.event.id !== event.id || archive.organization.slug !== "formation-exports") throw new Error("Wrong archive scope or format")
    for (const [key, expected] of Object.entries({ shifts: event.shifts.length, registrations: event.registrations.length, pages: event.pages.length, questions: event.questions.length, sectorLeaders: event.sectorLeaders.length, milestones: event.milestones.length })) {
      if (archive[key].length !== expected || expected === 0) throw new Error(`Archive collection ${key} does not match populated fixture`)
      if (key !== "questions" && archive.counts[key] !== expected) throw new Error(`Archive counter ${key} differs`)
    }
    if (!archive.questions.some((question: { answers: { values: string[] }[] }) => question.answers.some(answer => answer.values.includes("M"))) || !archive.log.length || archive.log.length !== archive.counts.log) throw new Error("Actual question answer or journal missing")
    const secretKeys = new Set(["editToken", "editTokenHash", "editTokenEnc", "editTokenLegacy", "token", "tokenHash", "tokenEnc", "tokenLegacy", "passwordHash"])
    const scan = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(scan); return }
      if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) {
        if (secretKeys.has(key)) throw new Error("Secret key present in actual archive")
        scan(nested)
      }
    }
    scan(archive)
    const tokens = [...event.registrations.map(registrationToken.reveal), ...event.sectorLeaders.map(linkToken.reveal)]
    if (tokens.some(token => archiveText.includes(token))) throw new Error("Personal access value present in actual archive")
    await writeFile(path.join(directory, "preparation.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: "actual UI downloads and local byte/data checks; not spreadsheet native execution or audiovisual validation", organizationId, eventId: event.id, members: rows.length, memberColumns: headers.length, journalEntries: journalRows.length - 1, inactiveIncluded: true, accentsPreserved: true, formulaAndPhoneApostrophesVerified: true, archiveCollectionsPopulated: true, actualQuestionAnswerVerified: true, secretKeysAndKnownTokensAbsent: true }, null, 2))
    console.log("✓ Actual member/journal/JSON downloads: accented and inactive members, protected formula-like notes and phone, populated archive, no secret keys or personal tokens")
    await writeFile(path.join(directory, "product-preparation.json"), JSON.stringify(product, null, 2))
  } finally { await browser.close(); await db.$disconnect(); await unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Data export preparation failed"); process.exitCode = 1 })
