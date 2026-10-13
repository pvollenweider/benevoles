// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Clear only authenticated video-fixture mail, including earlier catalogue takes. */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { loadManifest, videoDir } from "../lib/manifest"

type Address = { Name?: string; Address: string }
type Mail = { ID: string; From: Address; To: Address[]; Cc?: Address[]; Bcc?: Address[]; Username?: string; Subject: string }
async function main() {
  const id = process.argv[2]
  assert(["TARGETED_MESSAGES", "EMAIL_DELIVERY_FAILURES", "LAST_MINUTE_CHANGES"].includes(id))
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const mailbox = "http://localhost:48026"
  const inventory = async () => {
    const rows: Mail[] = []
    for (let start = 0; ; start += 500) {
      const response = await fetch(`${mailbox}/api/v1/messages?limit=500&start=${start}`)
      assert(response.ok)
      const page = await response.json() as { messages: Mail[]; total: number }
      rows.push(...page.messages)
      if (!page.messages.length || rows.length >= page.total) return rows
    }
  }
  const before = await inventory()
  const owned: Mail[] = []
  for (const row of before) {
    const response = await fetch(`${mailbox}/api/v1/message/${encodeURIComponent(row.ID)}`)
    assert(response.ok)
    const detail = await response.json() as Mail
    const recipients = [...detail.To, ...(detail.Cc ?? []), ...(detail.Bcc ?? [])]
    const fixtureAlert = detail.Subject === "benevol.app : plafond d'envoi atteint" && recipients.length === 1 && recipients[0].Address === "admin@localhost"
    const synthetic = fixtureAlert || recipients.length > 0 && recipients.every(address => address.Address.endsWith("@example.org") || address.Address === "org-admin@localhost")
    const identified = fixtureAlert || detail.Username === "video" || recipients.every(address => /^video\.[a-z0-9.-]+@example\.org$/i.test(address.Address))
    if (detail.From.Name === "Bénévoles vidéo" && detail.From.Address === "notifications@benevol.app" && synthetic && identified) owned.push({ ...row, Username: detail.Username })
  }
  for (const row of owned) {
    const response = await fetch(`${mailbox}/api/v1/messages`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [row.ID] }) })
    assert(response.ok)
  }
  const after = await inventory()
  const ids = new Set(owned.map(row => row.ID))
  assert(!after.some(row => ids.has(row.ID)))
  assert(before.filter(row => !ids.has(row.ID)).every(row => after.some(current => current.ID === row.ID)))
  const directory = videoDir((await loadManifest(id)).slug)
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/catalogue-mailbox-reset-${Date.now()}.json`, JSON.stringify({ at: new Date().toISOString(), deleted: owned, preservedIds: after.map(row => row.ID), guard: "Exact fixture sender, synthetic recipients and video SMTP username or reserved video identities; individual inspected IDs only" }, null, 2))
  console.log(`Removed ${owned.length} identified catalogue fixture messages; preserved ${after.length} unowned messages`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
