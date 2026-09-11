/**
 * Thin client for Mailpit's HTTP API (https://mailpit.axllent.org/docs/api-v1/).
 * The e2e stack points SMTP at Mailpit (docker-compose.e2e.yml) so every
 * notification email lands here instead of a real inbox.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8026"

type MailpitMessageSummary = {
  ID: string
  To: { Address: string; Name: string }[]
  From: { Address: string; Name: string }
  Subject: string
}

type MailpitSearchResult = {
  messages: MailpitMessageSummary[]
  messages_count: number
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" })
}

export async function searchMessages(query: string): Promise<MailpitMessageSummary[]> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`)
  const data = (await res.json()) as MailpitSearchResult
  return data.messages
}

/** Polls Mailpit until at least one message matches `query`, or times out. */
export async function waitForMessage(query: string, timeoutMs = 10_000): Promise<MailpitMessageSummary> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const messages = await searchMessages(query)
    if (messages.length > 0) return messages[0]
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`No message matched "${query}" within ${timeoutMs}ms`)
}

export async function getMessageText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`Mailpit message fetch failed: ${res.status}`)
  const data = (await res.json()) as { Text: string }
  return data.Text
}
