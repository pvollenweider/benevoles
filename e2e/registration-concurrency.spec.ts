import { test, expect, type APIRequestContext } from "@playwright/test"

/**
 * Concurrency invariants of public registration (#264), against the real Postgres: parallel
 * requests racing for the same spots must be serialized per shift (row lock) and duplicates
 * stopped by the partial unique index — not just by a read-then-write check in the route.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function publishedShift(request: APIRequestContext, stamp: number, opts: { capacity: number; waitlistEnabled: boolean }) {
  const eventRes = await request.post("/api/admin/events", {
    data: { title: `E2E Concurrency ${stamp}`, startDate: "2030-11-01", endDate: "2030-11-01", publicStatus: "published" },
  })
  const event: { id: string } = await eventRes.json()
  const shiftRes = await request.post("/api/admin/shifts", {
    data: {
      eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-11-01", startTime: "10:00", endTime: "12:00",
      capacity: opts.capacity, waitlistEnabled: opts.waitlistEnabled,
    },
  })
  const shift: { id: string } = await shiftRes.json()
  return { eventId: event.id, shiftId: shift.id }
}

function register(request: APIRequestContext, eventId: string, shiftId: string, email: string, i: number) {
  return request.post("/api/public/registrations", {
    // Distinct client IPs so the per-IP rate limit on this route doesn't interfere.
    headers: { "x-forwarded-for": `10.64.${i}.${Math.floor(Math.random() * 250)}` },
    data: { eventId, shiftIds: [shiftId], firstName: "E2E", lastName: `Race${i}`, email, consent: true },
  })
}

async function activeCount(request: APIRequestContext, eventId: string) {
  const detail = await (await request.get(`/api/admin/events/${eventId}`)).json()
  return detail.shifts[0].registrations.length as number
}

test("parallel sign-ups for the last spot: exactly one gets it", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId, shiftId } = await publishedShift(page.request, stamp, { capacity: 1, waitlistEnabled: false })

  const responses = await Promise.all(
    Array.from({ length: 6 }, (_, i) => register(page.request, eventId, shiftId, `e2e-race-${stamp}-${i}@example.com`, i))
  )
  const statuses = responses.map((r) => r.status()).sort()
  expect(statuses.filter((s) => s === 201)).toHaveLength(1)
  expect(statuses.filter((s) => s === 409)).toHaveLength(5)
  expect(await activeCount(page.request, eventId)).toBe(1)
})

test("parallel sign-ups on a full-soon shift with waitlist: one active, the rest waitlisted", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId, shiftId } = await publishedShift(page.request, stamp, { capacity: 1, waitlistEnabled: true })

  const responses = await Promise.all(
    Array.from({ length: 5 }, (_, i) => register(page.request, eventId, shiftId, `e2e-wl-${stamp}-${i}@example.com`, 20 + i))
  )
  const bodies: { onWaitlist?: boolean }[] = await Promise.all(responses.map((r) => r.json()))
  expect(responses.every((r) => r.status() === 201)).toBe(true)
  expect(bodies.filter((b) => b.onWaitlist === false)).toHaveLength(1)
  expect(bodies.filter((b) => b.onWaitlist === true)).toHaveLength(4)
  expect(await activeCount(page.request, eventId)).toBe(1)
})

test("the same sign-up submitted several times at once creates a single registration", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId, shiftId } = await publishedShift(page.request, stamp, { capacity: 10, waitlistEnabled: false })

  const email = `e2e-double-${stamp}@example.com`
  const responses = await Promise.all(Array.from({ length: 4 }, (_, i) => register(page.request, eventId, shiftId, email, 40 + i)))
  const statuses = responses.map((r) => r.status())
  expect(statuses.filter((s) => s === 201)).toHaveLength(1)
  expect(statuses.filter((s) => s === 409)).toHaveLength(3)
  expect(await activeCount(page.request, eventId)).toBe(1)
})
