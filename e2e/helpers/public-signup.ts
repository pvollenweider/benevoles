import { expect, type Browser, type Page } from "@playwright/test"
import { getMessageText, waitForMessage } from "./mailpit"

/**
 * A published event and a volunteer's public sign-up, for specs that need a personal page (/my).
 * The management link only goes out by email (#285): its token is read from Mailpit, as
 * forced-colors-focus.spec.ts does.
 *
 * The public sign-up, and GET and DELETE on a personal token, are rate limited per client address
 * (DELETE: 5 per hour). Each call uses its own random `x-forwarded-for`, and a spec that opens
 * /my sets one per test with `page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })`.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

/** `maxPerVolunteer`: the limit of shifts per person of the role (#466), set on the role once its shifts exist. */
export type ShiftSpec = { label: string; startTime: string; endTime: string; capacity?: number; maxPerVolunteer?: number }
export type QuestionSpec = { label: string; type: "text" | "yesno" | "single" | "multiple"; options?: string[] }
export type PublicEvent = { eventId: string; slug: string; date: string; shifts: { id: string; label: string }[]; questions: { id: string; label: string }[] }

/** A random private client address, so that each test gets its own rate-limit bucket. */
export function randomIp(): string {
  const b = () => 1 + Math.floor(Math.random() * 250)
  return `10.${b()}.${b()}.${b()}`
}

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

/** A published event on one day with these shifts (one role per shift, named after its label), and these optional questions. */
export async function createPublicEvent(browser: Browser, title: string, shifts: ShiftSpec[], date = "2030-10-01", questions: QuestionSpec[] = []): Promise<PublicEvent> {
  const page = await browser.newPage()
  await login(page)
  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  // Created as a draft, published once it has its shifts: the API refuses to publish an empty event.
  const event = await post("/api/admin/events", { title, startDate: date, endDate: date, publicStatus: "draft" })
  const created: { id: string; label: string }[] = []
  for (const s of shifts) {
    const shift = await post("/api/admin/shifts", {
      eventId: event.id, roleName: s.label, label: s.label, date, startTime: s.startTime, endTime: s.endTime, capacity: s.capacity ?? 5,
    })
    created.push({ id: shift.id, label: s.label })
  }
  for (const [role, max] of new Map(shifts.filter((s) => s.maxPerVolunteer != null).map((s) => [s.label, s.maxPerVolunteer!]))) {
    const res = await page.request.patch(`/api/admin/events/${event.id}/roles/${encodeURIComponent(role)}`, { data: { maxPerVolunteer: max } })
    expect(res.ok(), `role limit: ${res.status()} ${await res.text()}`).toBeTruthy()
  }
  const asked: { id: string; label: string }[] = []
  for (const q of questions) {
    const question = await post(`/api/admin/events/${event.id}/questions`, { label: q.label, type: q.type, options: q.options ?? [] })
    asked.push({ id: question.id, label: q.label })
  }
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()
  await page.close()
  return { eventId: event.id, slug: event.slug, date, shifts: created, questions: asked }
}

/** Signs a new volunteer up for `shiftIds` through the public form's API, with these answers by question id; returns their /my token. */
export async function publicSignUp(page: Page, event: PublicEvent, shiftIds: string[], answers?: Record<string, unknown>): Promise<string> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const email = `e2e-my-${stamp}@example.com`
  const res = await page.request.post("/api/public/registrations", {
    headers: { "x-forwarded-for": randomIp() },
    data: { eventId: event.eventId, shiftIds, firstName: "E2E", lastName: `Perso${stamp}`, email, consent: true, charterAccepted: true, answers },
  })
  expect(res.ok(), `sign-up: ${res.status()} ${await res.text()}`).toBeTruthy()
  const mail = await waitForMessage(`to:"${email}"`)
  const token = (await getMessageText(mail.ID)).match(/\/my\/([\w-]+)/)?.[1] ?? ""
  expect(token, "the confirmation email carries the management link").toBeTruthy()
  return token
}
