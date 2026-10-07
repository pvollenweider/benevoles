// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Creates one real local 201 contact when needed; never fabricates a ledger or relaxes 26. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { ownsNaturalMemberSeed, readSeedProofV2 } from "../lib/member-fixture-v2"
import { validateImportBaseline } from "../lib/member-import-ownership"
import { recordedMembers } from "./prepare-demo"

async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  assert(process.env.ORG_ADMIN_EMAIL && process.env.ORG_ADMIN_PASSWORD, "Explicit local organizer credentials required")
  const current = await loadCurrentVideoPrisma("http://localhost:43102")
  try {
    const organization = await current.db.organization.findUniqueOrThrow({ where: { id: "default" }, select: { name: true } })
    assert.equal(organization.name, "Fêtes de Montvert")
    const seeds = await readSeedProofV2()
    assert(seeds, "Exact natural-name seed proof required")
    const before = await current.db.volunteer.findMany({ where: { organizationId: "default" } })
    if (before.length === 26) {
      validateImportBaseline(before, await recordedMembers(), Date.now(), seeds)
      console.log("Exact 26-member import baseline already has an actual 201 contact")
      return
    }
    assert(before.length === 25 && before.filter(person => person.email?.endsWith("@example.org")).length === 24, "Only the exact 24-email plus M2 pre-baseline is eligible")
    assert(before.filter(person => person.email === null).length === 1 && ownsNaturalMemberSeed(before.find(person => person.id === "video-member-management-2") ?? {}, seeds), "Exact ledger-backed M2 required; unknown no-email contacts refuse preparation")
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ locale: "fr-CH", timezoneId: "Europe/Zurich" })
      await page.goto("http://localhost:43102/admin/login")
      await page.getByLabel("Email", { exact: true }).fill(process.env.ORG_ADMIN_EMAIL)
      await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD)
      await page.getByRole("button", { name: "Se connecter", exact: true }).click()
      await page.waitForURL(url => !url.pathname.endsWith("/login"))
      await page.goto("http://localhost:43102/admin/members")
      await page.getByRole("button", { name: "+ Nouveau membre", exact: true }).click()
      const form = page.getByRole("dialog", { name: "Nouveau membre", exact: true })
      await form.getByLabel(/^Prénom/).fill("René")
      await form.getByLabel(/^Nom/).fill("Aubert")
      await form.getByLabel("Téléphone", { exact: true }).fill("079 000 90 02")
      const pending = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/admin/members")
      await form.getByRole("button", { name: "Créer", exact: true }).click()
      const response = await pending
      assert.equal(response.status(), 201, "A real application creation response is mandatory")
      const person = await response.json()
      assert(person.organizationId === "default" && /^[A-Za-z0-9_-]{8,100}$/.test(person.id) && !before.some(member => member.id === person.id) && person.firstName === "René" && person.lastName === "Aubert" && person.email === null && person.phone?.replace(/\s/g, "") === "0790009002", "Actual API response does not match the exact synthetic contact")
      const file = path.resolve("videos/output/members-management/owned-members-v2.json")
      let members: unknown[] = []
      try {
        const previous = JSON.parse(await readFile(file, "utf8"))
        assert(previous.schemaVersion === 2 && previous.scenario === "members-management" && Array.isArray(previous.members) && previous.members.length < 30)
        // Validate its historical hash before adding a new actual receipt.
        await recordedMembers()
        members = previous.members
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
      assert(Number.isFinite(Date.parse(person.createdAt)), "Actual API creation date required")
      members.push({ id: person.id, organizationId: "default", firstName: "René", lastName: "Aubert", phone: person.phone, email: null, responseStatus: 201, createdAt: new Date().toISOString(), actualCreatedAt: person.createdAt })
      const json = JSON.stringify({ schemaVersion: 2, scenario: "members-management", members }, null, 2)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(path.join(path.dirname(file), `owned-members-v2-${createHash("sha256").update(json).digest("hex")}.json`), json, { flag: "wx" })
      await writeFile(file, json)
      const after = await current.db.volunteer.findMany({ where: { organizationId: "default" } })
      assert(before.every(member => after.some(value => value.id === member.id)), "Preparation removed a prior identity")
      validateImportBaseline(after, await recordedMembers(), Date.now(), seeds)
      console.log("Exact 26-member baseline established by one real local application POST201; immutable creation evidence saved")
    } finally { await browser.close() }
  } finally { await current.db.$disconnect(); await current.unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Import baseline preparation failed"); process.exitCode = 1 })
