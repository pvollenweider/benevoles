// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Delete only inspected messages belonging to the two privacy-video fixtures.
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"

type Message = { ID: string; Subject: string; To: { Address: string }[]; Cc?: { Address: string }[]; Bcc?: { Address: string }[] }
const mailbox = "http://localhost:48026"
async function inventory() {
  const messages: Message[] = []
  for (let start = 0; ; start += 500) {
    const response = await fetch(`${mailbox}/api/v1/messages?limit=500&start=${start}`)
    assert(response.ok, "Local Mailpit inventory unavailable")
    const page = await response.json() as { messages: Message[]; total: number }
    messages.push(...page.messages)
    if (messages.length >= page.total || !page.messages.length) return messages
  }
}
async function main() {
  const before = await inventory()
  const owned = before.filter(message => {
    const recipients = [...message.To, ...(message.Cc ?? []), ...(message.Bcc ?? [])]
    return /Fête des liens — organisation [AB]/.test(message.Subject) && recipients.length > 0 &&
      recipients.every(recipient => /^video\.privacy\.[ab]\.(?:new|member\.[0-4]|owner|leader)@example\.org$/.test(recipient.Address))
  })
  for (const message of owned) {
    const response = await fetch(`${mailbox}/api/v1/messages`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [message.ID] }) })
    assert(response.ok, "Exact privacy fixture deletion failed")
  }
  const deleted = new Set(owned.map(message => message.ID))
  const after = await inventory()
  assert(before.filter(message => !deleted.has(message.ID)).every(message => after.some(value => value.ID === message.ID)), "Unrelated message missing")
  assert(!after.some(message => deleted.has(message.ID)), "Old privacy fixture message remains")
  assert(!after.some(message => /Fête des liens — organisation [AB]/.test(message.Subject)), "Unowned fixture message preserved; do not film")
  const directory = "videos/output/privacy-personal-links"
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/mailbox-reset-proof.json`, JSON.stringify({ checkedAt: new Date().toISOString(), deletedMessages: owned, preservedMessageIds: after.map(message => message.ID) }, null, 2))
  console.log(`Privacy Mailpit: ${owned.length} exact fixture messages deleted; ${after.length} unrelated messages preserved`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Privacy mailbox preparation failed"); process.exitCode = 1 })
