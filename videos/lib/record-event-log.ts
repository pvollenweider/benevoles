// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

export async function recordEventLog(options: { page: Page; base: string; eventId: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, title, scene, tap, settle } = options
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated video database required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  try {
    const prepared = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8")) as { eventId: string; shiftId: string; baselineWitnessId: string; rootLogId: string; pageId: string; causalLinkVerified: boolean; volunteerActorVerified: boolean; pageContentNotCopied: boolean }
    if (prepared.eventId !== eventId || !prepared.causalLinkVerified || !prepared.volunteerActorVerified || !prepared.pageContentNotCopied) throw new Error("Current actual-route preparation required")
    const witness = await db.event.findUniqueOrThrow({ where: { id: prepared.baselineWitnessId }, include: { shifts: true, registrations: true } })
    if (await db.eventLog.count({ where: { eventId: witness.id } })) throw new Error("Untouched baseline witness required; rerun dedicated seed and preparation")
    const shiftBefore = await db.shift.findUniqueOrThrow({ where: { id: prepared.shiftId } })
    const checks: Record<string, unknown> = {}
    const url = `${base}/admin/events/${eventId}`
    const go = async (target: string) => { await page.goto(target); await settle(page) }
    const filter = async (label: string, value: string) => {
      // The implicit label also contains the native select's option text. Locate its
      // real select from the visible caption rather than requiring an exact a11y name.
      const control = page.locator("label").filter({ has: page.getByText(label, { exact: true }) }).locator("select")
      await tap(page, control)
      await control.selectOption(value)
      await settle(page)
      if (await control.inputValue() !== value) throw new Error(`Actual journal filter value not selected: ${label}`)
    }
    const reset = async () => { await go(`${url}/log`) }
    await go(url)
    await scene("welcome", async at => {
      await page.screencast.showChapter(title, { duration: 2400 })
      await at(0.25); await tap(page, page.getByRole("link", { name: "Journal", exact: true }))
      await page.locator("#panel-explore > div > div").first().waitFor()
    })
    await scene("read", async at => {
      const rows = page.locator("#panel-explore > div > div")
      if (await rows.count() !== 50) throw new Error("Expected real first page of fifty journal entries")
      await at(0.15); await rows.first().scrollIntoViewIfNeeded()
      await at(0.42); await rows.nth(1).scrollIntoViewIfNeeded()
      await at(0.66); await rows.nth(2).scrollIntoViewIfNeeded()
      checks.initialEntries = await rows.count()
    })
    await scene("filters", async at => {
      await at(0.12); await filter("Type d'élément", "Registration")
      await at(0.32); await filter("Qui", "volunteer")
      if (await page.locator("#panel-explore > div > div").count() !== 1) throw new Error("Volunteer filter should show the actual withdrawal only")
      await at(0.51); await filter("Action", "registration")
      await at(0.75); await reset()
      checks.actualFiltersVerified = true
    })
    await scene("period", async at => {
      const now = new Date()
      const day = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10)
      await at(0.10); await page.getByLabel("Depuis", { exact: true }).fill(day(-1)); await settle(page)
      await at(0.25); await page.getByLabel("Jusqu'à", { exact: true }).fill(day(1)); await settle(page)
      await at(0.40); await page.getByLabel("Depuis", { exact: true }).fill(day(2)); await settle(page)
      await page.getByText("Aucune entrée pour ces filtres.", { exact: true }).waitFor()
      await at(0.56); await reset()
      const countBefore = await page.locator("#panel-explore > div > div").count()
      await at(0.73); await tap(page, page.getByRole("button", { name: "Charger plus", exact: true })); await settle(page)
      const countAfter = await page.locator("#panel-explore > div > div").count()
      if (countBefore !== 50 || countAfter <= countBefore) throw new Error("Actual load-more did not extend the journal")
      await page.locator("#panel-explore > div > div").last().scrollIntoViewIfNeeded()
      checks.pagination = { countBefore, countAfter, emptyPeriodVerified: true }
    })
    await scene("replay", async at => {
      await page.getByRole("tab", { name: "Rejouer", exact: true }).scrollIntoViewIfNeeded()
      await at(0.10); await tap(page, page.getByRole("tab", { name: "Rejouer", exact: true }))
      await at(0.20); await tap(page, page.locator("#panel-replay").getByRole("button", { name: /^Accueil · Accueil — chaîne de remplacement/ }))
      await page.getByRole("slider", { name: "Étape dans l'historique", exact: true }).waitFor()
      await at(0.32); await tap(page, page.getByRole("button", { name: "Étape suivante", exact: true }))
      await at(0.43); await tap(page, page.getByRole("button", { name: "Étape suivante", exact: true }))
      await at(0.54); await tap(page, page.getByRole("button", { name: "Étape précédente", exact: true }))
      await at(0.64); await tap(page, page.getByRole("slider", { name: "Étape dans l'historique", exact: true })); await page.getByRole("slider").press("End")
      await at(0.78); await tap(page, page.getByRole("button", { name: "Changer d'élément", exact: true }))
      await at(0.86); await tap(page, page.locator("#panel-replay").getByRole("button", { name: /^Inscription —/ }).first())
      const shiftAfter = await db.shift.findUniqueOrThrow({ where: { id: prepared.shiftId } })
      if (JSON.stringify(shiftBefore) !== JSON.stringify(shiftAfter)) throw new Error("Reading replay mutated the shift")
      checks.replayReadOnlyVerified = true
    })
    await scene("story", async at => {
      await at(0.12); await tap(page, page.getByRole("tab", { name: "Récit", exact: true }))
      const choices = await page.request.get(`${base}/api/admin/events/${eventId}/log/candidates?kind=story`)
      const candidate = (await choices.json()).candidates.find((choice: { logId: string }) => choice.logId === prepared.rootLogId) as { label: string } | undefined
      if (!choices.ok() || !candidate) throw new Error("Actual causal root is not offered by the story picker")
      await at(0.30); await tap(page, page.locator("#panel-story").getByRole("button", { name: candidate.label, exact: true }))
      await page.locator("#panel-story").getByRole("button", { name: "Changer d'entrée", exact: true }).waitFor()
      const response = await page.request.get(`${base}/api/admin/events/${eventId}/log?chainOf=${encodeURIComponent(prepared.rootLogId)}`)
      const chain = await response.json()
      if (!response.ok() || chain.entries.length < 2 || !chain.entries.some((entry: { causedByLogId: string | null }) => entry.causedByLogId === prepared.rootLogId)) throw new Error("Actual causal chain missing")
      await at(0.70); await tap(page, page.getByRole("button", { name: "Changer d'entrée", exact: true }))
      checks.causalChainEntries = chain.entries.length
    })
    // The new event must be visible when its intertitle and first sentence start.
    await go(`${base}/admin/events/${witness.id}/log`)
    await scene("baseline", async at => {
      await page.getByText("Aucune entrée pour ces filtres.", { exact: true }).waitFor()
      await at(0.35); await tap(page, page.getByRole("button", { name: "Générer l'état initial", exact: true }))
      await page.getByText("Généré, pas une action réelle", { exact: true }).first().waitFor()
      const logs = await db.eventLog.findMany({ where: { eventId: witness.id } })
      if (logs.length !== 3 || logs.some(log => !log.action.endsWith(".baseline"))) throw new Error("Baseline did not describe exactly the three existing entities")
      const times = new Map([[witness.id, witness.createdAt.getTime()], ...witness.shifts.map(s => [s.id, s.createdAt.getTime()] as [string, number]), ...witness.registrations.map(r => [r.id, r.createdAt.getTime()] as [string, number])])
      if (logs.some(log => times.get(log.entityId) !== log.createdAt.getTime())) throw new Error("Baseline timestamps do not match real creation dates")
      await at(0.70)
      const response = await page.request.post(`${base}/api/admin/events/${witness.id}/log/baseline`)
      if (!response.ok() || (await response.json()).created !== 0 || await db.eventLog.count({ where: { eventId: witness.id } }) !== logs.length) throw new Error("Baseline idempotence failed")
      checks.baseline = { entries: logs.length, actualCreationDatesVerified: true, secondRequestCreated: 0 }
    })
    await reset()
    await scene("privacy", async at => {
      await at(0.15); await filter("Type d'élément", "EventPage")
      const entries = await db.eventLog.findMany({ where: { eventId, entityId: prepared.pageId } })
      if (entries.length !== 2 || JSON.stringify(entries).includes("TEXTE_FICTIF_NON_RECOPIE")) throw new Error("Page content copied into journal")
      await at(0.65); await go(`${url}/registrations`)
      await page.getByRole("row").filter({ hasText: "Nicolas" }).waitFor()
      checks.pageContentNotCopied = true
    })
    await scene("result", async at => {
      await at(0.30); await go(`${url}/shifts`)
      await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
      await page.getByRole("row").filter({ hasText: "Accueil — chaîne de remplacement" }).waitFor()
    })
    await writeFile(path.join(directory, "event-log-capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
  } finally { await db.$disconnect() }
}
