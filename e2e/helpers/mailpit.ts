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

/**
 * Polls Mailpit until at least one message matches `query`, or times out. Returns as soon as one
 * arrives; the 20 s cap only matters on a slow CI dev server, where 10 s was too short (#592).
 */
export async function waitForMessage(query: string, timeoutMs = 20_000): Promise<MailpitMessageSummary> {
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

export async function getMessageHtml(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`Mailpit message fetch failed: ${res.status}`)
  const data = (await res.json()) as { HTML: string }
  return data.HTML
}

const APP_URL = (process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? "3100"}`).replace(/\/+$/, "")

/**
 * The event personal-page token (/my/<token>) a volunteer email leads to. General emails carry the
 * organisation link (/mes-inscriptions/<token>, #1429 lot B), whose page links each event through
 * a server hop that redirects to /my/<event token>: follow it, for `eventId` when given (else the
 * first event listed). Emails still carrying /my/<token> return it directly.
 */
export async function eventTokenFromEmail(text: string, eventId?: string): Promise<string> {
  const direct = text.match(/\/my\/([\w-]+)/)?.[1]
  if (direct) return direct
  const org = text.match(/\/mes-inscriptions\/([\w-]+)/)?.[1]
  if (!org) return ""
  const page = await fetch(`${APP_URL}/mes-inscriptions/${org}`).then((r) => r.text())
  const ids = [...page.matchAll(new RegExp(`/mes-inscriptions/${org}/evenement/([\\w-]+)`, "g"))].map((m) => m[1])
  const target = eventId && ids.includes(eventId) ? eventId : ids[0]
  if (!target) return ""
  const hop = await fetch(`${APP_URL}/mes-inscriptions/${org}/evenement/${target}`, { redirect: "manual" })
  return (hop.headers.get("location") ?? "").match(/\/my\/([\w-]+)/)?.[1] ?? ""
}
