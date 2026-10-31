// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Remove only the common registration video's identified synthetic messages.
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { PrismaClient } from "../../src/generated/prisma/client"
import { pgAdapter } from "../../src/lib/prisma-adapter"
import { openPayload } from "../../src/lib/notifications/outbox"
import { expectedMemberV2 } from "../lib/member-fixture-v2"

const scenario = process.argv[2]
assert(["members-invitations", "members-reminders", "registrations-place-member", "registrations-management", "sector-leaders", "staffing-gaps", "organizer-monitor-followup", "targeted-messages", "last-minute-changes", "reminders-changes"].includes(scenario))
const url = new URL(process.env.DATABASE_URL ?? "")
assert(["localhost", "127.0.0.1"].includes(url.hostname) && (url.port === "45433" || scenario === "sector-leaders" && url.port === "45436") && url.pathname === "/benevoles_video")
const db = new PrismaClient({ adapter: pgAdapter(url.href) })
type Message = { ID: string; Subject: string; To: { Address: string }[]; Cc?: { Address: string }[]; Bcc?: { Address: string }[] }
const mailbox = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"
const inventory = async () => {
  const messages: Message[] = []
  for (let start = 0; ; start += 500) {
    const response = await fetch(`${mailbox}/api/v1/messages?limit=500&start=${start}`)
    assert(response.ok, "Mailpit inventory unavailable")
    const page = await response.json() as { messages: Message[]; total: number }
    messages.push(...page.messages)
    if (messages.length >= page.total || !page.messages.length) return messages
  }
}
async function main() {
  try {
    if (["last-minute-changes", "reminders-changes"].includes(scenario)) {
      const lastMinute = scenario === "last-minute-changes"
      const org = await db.organization.findUniqueOrThrow({ where: { id: lastMinute ? "video-last-minute" : "default" } })
      assert.equal(org.name, lastMinute ? "Formation — imprévus" : "Fêtes de Montvert")
      const titles = lastMinute ? ["Fête des imprévus"] : ["Atelier des rappels", "Atelier en brouillon", "Atelier sans rappels"]
      const address = lastMinute ? /^video\.last-minute\.(?:person\.[0-5]|owner)@example\.org$/ : /^video\.reminder\.[a-z0-9.-]+@example\.org$/
      const before = await inventory()
      const owned: Message[] = []
      for (const m of before) {
        const recipients = [...m.To, ...(m.Cc ?? []), ...(m.Bcc ?? [])]
        if (!recipients.length || !recipients.every(r => address.test(r.Address))) continue
        const detail = await (await fetch(`${mailbox}/api/v1/message/${m.ID}`)).json() as { Text: string }
        if (titles.some(t => m.Subject.includes(t) || detail.Text.includes(t))) owned.push(m)
      }
      for (const m of owned) { const response = await fetch(`${mailbox}/api/v1/messages`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [m.ID] }) }); assert(response.ok) }
      const ids = new Set(owned.map(m => m.ID)), after = await inventory()
      assert(before.filter(m => !ids.has(m.ID)).every(m => after.some(a => a.ID === m.ID)))
      assert(!after.some(m => ids.has(m.ID)))
      const dir = `videos/output/${scenario}`; await mkdir(dir, { recursive: true })
      await writeFile(`${dir}/mailbox-reset-${Date.now()}.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scenario, exactEventTitles: titles, deletedMessages: owned, preservedIds: after.map(m => m.ID) }, null, 2))
      console.log(`Exact ${scenario} fixture mail cleared (${owned.length}); unrelated messages preserved (${after.length})`)
      return
    }
    const fixture = await db.organization.findUniqueOrThrow({ where: { id: "default" }, include: { volunteers: true, admins: true, events: { include: { sectorLeaders: true } } } })
    assert.equal(fixture.name, "Fêtes de Montvert")
    const event = fixture.events.find(e => e.slug === "fete-du-village")
    assert(event && event.title === "Fête du village de Montvert")
    const addresses = new Set([...fixture.volunteers.map(v => v.email), ...fixture.admins.map(a => a.email), ...fixture.events.flatMap(e => e.sectorLeaders.map(l => l.email))].filter((email): email is string => !!email && email.endsWith("@example.org")))
    // Recorder-owned historical identities no longer present after reseeding.
    for (const email of ["lea.giroud@example.org", "test.invitation@example.org", "nora.team@example.org", "samira.perrin@example.org"]) addresses.add(email)
    // Both variants of the natural member fixture (members-invitations renames index 3).
    for (let index = 0; index < 36; index++) for (const invitation of [false, true]) { const email = expectedMemberV2(index, invitation).email; if (email) addresses.add(email) }
    const ownsAddress = (email: string) => addresses.has(email) || /^video\.membre\.\d+@example\.org$/.test(email) /* pre-#1037 fixture */ || /^alex\.martin\.video\.\d+@example\.org$/.test(email)
    assert(addresses.has("sarah.jaquet@example.org") && addresses.has("camille.rochat@example.org"))
    const before = await inventory()
    const owned = before.filter(m => {
      const recipients = [...m.To, ...(m.Cc ?? []), ...(m.Bcc ?? [])]
      return m.Subject.includes(event.title) && recipients.length > 0 && recipients.every(r => ownsAddress(r.Address))
    })
    // Campaigns and leader notifications can name the event only in their body.
    for (const m of before.filter(m => !owned.some(row => row.ID === m.ID))) {
      const recipients = [...m.To, ...(m.Cc ?? []), ...(m.Bcc ?? [])]
      if (!recipients.length || !recipients.every(r => ownsAddress(r.Address))) continue
      const detail = await (await fetch(`${mailbox}/api/v1/message/${m.ID}`)).json() as { Text: string }
      if (detail.Text.includes(event.title)) owned.push(m)
    }
    // Never use DELETE-all or DELETE-search: every deletion names an inspected ID.
    for (const message of owned) {
      const response = await fetch(`${mailbox}/api/v1/messages`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [message.ID] }) })
      assert(response.ok, "Exact Mailpit deletion failed")
    }
    const deletedIds = new Set(owned.map(m => m.ID))
    const after = await inventory()
    assert(before.filter(m => !deletedIds.has(m.ID)).every(m => after.some(a => a.ID === m.ID)), "Unrelated message missing")
    assert(!after.some(m => deletedIds.has(m.ID)), "Old fixture message remains")
    assert(!after.some(m => m.Subject.includes(event.title)), "An unowned event message was preserved; do not film it")
    const recipient = scenario === "registrations-place-member" ? "sarah.jaquet@example.org" : "camille.rochat@example.org"
    const pending = await db.notificationOutbox.findMany({ where: { organizationId: "default", status: "pending" } })
    const obsolete = pending.filter(row => {
      const payload = openPayload(row.payload)
      const data = payload.data as { eventTitle?: string }
      return !!payload.recipient.email && ownsAddress(payload.recipient.email) && data.eventTitle === event.title
    })
    for (const row of obsolete) await db.notificationOutbox.deleteMany({ where: { id: row.id, organizationId: "default", status: "pending" } })
    const dir = `videos/output/${scenario}`
    await mkdir(dir, { recursive: true })
    await writeFile(`${dir}/mailbox-reset-proof.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scenario, eventName: event.title, recipient, deletedMessages: owned, preservedMessageIds: after.map(m => m.ID), deletedPendingIds: obsolete.map(r => r.id), remainingPreviousPending: await db.notificationOutbox.count({ where: { id: { in: obsolete.map(r => r.id) }, status: "pending" } }) }, null, 2))
    console.log(`✓ Mailpit: ${owned.length} exact fixture messages deleted; ${after.length} unrelated messages preserved; ${obsolete.length} prior pending fixture notifications removed`)
  } finally { await db.$disconnect() }

}
main().catch(error => { console.error(error instanceof Error ? error.message : "Registration mailbox cleanup failed"); process.exitCode = 1 })
