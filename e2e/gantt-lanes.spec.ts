import { test, expect } from "@playwright/test"

/**
 * Regression test for the Gantt/timeline lane-splitting fix: two shifts on
 * the same post, overlapping in time, must render as two separate visible
 * bars (distinct vertical position) instead of stacking on top of each
 * other and hiding one (see src/lib/gantt-utils.ts#assignLanes and its use
 * in AdminDayTimeline.tsx / DayTimeline.tsx).
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("overlapping same-post shifts render on separate lanes in the admin Gantt", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  await page.getByRole("link", { name: /Spectacle de Cirque 2026/ }).click()
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
  const eventId = page.url().split("/admin/events/")[1].split(/[/?]/)[0]

  // Two "Billetterie" shifts overlapping 09:00-10:30, distinct labels so the
  // bug (identical stacking, one hidden) would be visually indistinguishable
  // from a pass if we only checked for one visible bar.
  for (const label of ["E2E overlap A", "E2E overlap B"]) {
    const res = await page.request.post("/api/admin/shifts", {
      data: {
        eventId,
        roleName: "Billetterie",
        label,
        date: "2026-06-14",
        startTime: "09:00",
        endTime: "10:30",
        capacity: 2,
      },
    })
    expect(res.ok()).toBeTruthy()
  }

  await page.goto(`/admin/events/${eventId}/shifts`)

  // Locate the two new bars by their distinct labels rendered inside them.
  const boxA = await page.getByText("E2E overlap A", { exact: false }).locator("..").first().boundingBox()
  const boxB = await page.getByText("E2E overlap B", { exact: false }).locator("..").first().boundingBox()

  expect(boxA).not.toBeNull()
  expect(boxB).not.toBeNull()
  // Same time range → same horizontal position; different lane → different
  // vertical position. This is exactly the pre-fix failure mode: before the
  // lane-split, both bars would share the same top and one would fully
  // occlude the other.
  expect(boxA!.x).toBeCloseTo(boxB!.x, 0)
  expect(Math.abs(boxA!.y - boxB!.y)).toBeGreaterThan(10)
})
