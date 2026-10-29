// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Remove only the named video's synthetic messages before each local take. */
import { writeFile } from "node:fs/promises"
import path from "node:path"
export async function prepareSettingsMailbox(slug: string, directory: string) {
  const patterns: Record<string, RegExp> = {
    "last-minute-changes": /^video\.last-minute\.(?:person\.[0-5]|owner)@example\.org$/,
    "org-email-settings": /^video\.email\.[a-z-]+@example\.org$/,
    "org-team-permissions": /^video\.team\.[a-z-]+@example\.org$/,
    "email-delivery-failures": /^video\.delivery\.[a-z-]+@example\.org$/,
    "platform-internal-administration": /^video\.operator\.(?:platform|[abc]\.owner|disposable\.owner|lifecycle\.owner)@example\.org$/,
    // The beta videos' organisation (scripts/seed-video-beta.ts): members, leader, owner, operator.
    "privacy-personal-links": /^video\.privacy\.(?:[ab]\.(?:member\.[0-4]|new|owner|leader)|unknown)@example\.org$/,
    "beta-access": /^video\.beta\.[a-z]+@example\.org$/,
    "sectors": /^video\.beta\.[a-z]+@example\.org$/,
    "shift-swaps": /^video\.beta\.[a-z]+@example\.org$/,
    "sector-leaders": /^video\.beta\.[a-z]+@example\.org$/,
  }
  const pattern = patterns[slug]
  if (!pattern) return
  const base = `${process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"}/api/v1/messages`
  type Mail = { ID: string; To?: { Address: string }[]; Cc?: { Address: string }[]; Bcc?: { Address: string }[] }
  const inventory = async () => {
    const messages: Mail[] = []
    for (;;) {
      const response = await fetch(`${base}?limit=500&start=${messages.length}`)
      if (!response.ok) throw new Error("Local fixture mailbox inventory failed")
      const page = await response.json() as { messages: Mail[]; total: number }
      messages.push(...page.messages)
      if (messages.length >= page.total || !page.messages.length) return messages
    }
  }
  const before = await inventory()
  const owned = before.filter(mail => {
    const recipients = [...mail.To ?? [], ...mail.Cc ?? [], ...mail.Bcc ?? []]
    return recipients.length && recipients.every(person => pattern.test(person.Address))
  })
  for (const mail of owned) {
    const response = await fetch(base, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [mail.ID] }) })
    if (!response.ok) throw new Error("Owned fixture mailbox cleanup failed")
  }
  const after = new Set((await inventory()).map(mail => mail.ID))
  const deleted = new Set(owned.map(mail => mail.ID))
  if (before.some(mail => !deleted.has(mail.ID) && !after.has(mail.ID))) throw new Error("Unrelated mailbox message disappeared")
  await writeFile(path.join(directory, `mailbox-reset-${Date.now()}.json`), JSON.stringify({ slug, pattern: pattern.source, deletedIds: [...deleted], unrelatedMessagesPreserved: true }, null, 2))
}
