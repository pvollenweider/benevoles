// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import nodemailer from "nodemailer"
import { controlledSmtp } from "../lib/controlled-smtp"

async function main() {
  const fixture = await controlledSmtp()
  const transport = nodemailer.createTransport({ host: "127.0.0.1", port: 41028, secure: false, connectionTimeout: 5000, socketTimeout: 10000 })
  const recipient = "video.delivery.smtp-probe@example.org"
  try {
    fixture.rejected.add(recipient)
    for (let attempt = 0; attempt < 6; attempt++) {
      let rejected = false
      try { await transport.sendMail({ from: "Formation <video.delivery.sender@example.org>", to: recipient, subject: "Formation — test du SMTP contrôlé", text: "Message fictif, uniquement vers la boîte locale de formation." }) }
      catch (error) { const smtp = error as { responseCode?: number; command?: string }; assert.equal(smtp.responseCode, 550); assert.equal(smtp.command, "RCPT TO"); rejected = true }
      assert(rejected)
    }
    fixture.rejected.delete(recipient)
    await transport.sendMail({ from: "Formation <video.delivery.sender@example.org>", to: recipient, subject: "Formation — SMTP rétabli", text: "Message fictif effectivement transmis à Mailpit local." })
    assert.equal(fixture.attempts.filter(attempt => !attempt.accepted).length, 6)
    assert.equal(fixture.attempts.filter(attempt => attempt.accepted).length, 1)
    const inbox = await (await fetch("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] }
    const delivered = inbox.messages.find(mail => mail.Subject === "Formation — SMTP rétabli" && mail.To.some(to => to.Address === recipient))
    assert(delivered, "Actual restored SMTP message must reach local Mailpit")
    await mkdir("videos/output/email-delivery-failures", { recursive: true })
    await writeFile("videos/output/email-delivery-failures/smtp-preparation.json", JSON.stringify({ checkedAt: new Date().toISOString(), scope: "SMTP fixture only; no outbox rows or app UI proven yet", attempts: fixture.attempts, actualDeliveredMailId: delivered.ID, localSmtpPort: 41028, forwardingOnlyToLocalMailpit: 41026 }, null, 2))
    console.log("✓ Six real local SMTP 550 rejections, then restored delivery received in Mailpit; no fabricated outbox attempts")
  } finally { transport.close(); await fixture.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Controlled SMTP test failed"); process.exitCode = 1 })
