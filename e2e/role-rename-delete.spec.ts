import { test, expect } from "@playwright/test"

/**
 * Renaming or deleting a role (#218) — a role only exists implicitly as the roleName shared by a
 * group of shifts on one event, so both operations act on every shift carrying that name.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test.describe("role rename / delete", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)
  })

  test("renaming a role updates every one of its shifts", async ({ page }) => {
    const stamp = Date.now()
    const eventRes = await page.request.post("/api/admin/events", {
      data: { title: `E2E Role Rename ${stamp}`, startDate: "2030-09-01", endDate: "2030-09-01", publicStatus: "draft" },
    })
    const event: { id: string } = await eventRes.json()

    for (const startTime of ["10:00", "14:00"]) {
      const res = await page.request.post("/api/admin/shifts", {
        data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-09-01", startTime, endTime: "16:00", capacity: 2 },
      })
      expect(res.ok()).toBeTruthy()
    }

    const renameRes = await page.request.patch(`/api/admin/events/${event.id}/roles/${encodeURIComponent("Bar")}`, {
      data: { name: "Buvette" },
    })
    expect(renameRes.ok()).toBeTruthy()
    expect((await renameRes.json()).renamed).toBe(2)

    const detail = await (await page.request.get(`/api/admin/events/${event.id}`)).json()
    expect(detail.shifts.every((s: { roleName: string }) => s.roleName === "Buvette")).toBe(true)
    expect(detail.shifts.some((s: { roleName: string }) => s.roleName === "Bar")).toBe(false)
  })

  test("renaming onto an existing role name is refused (no silent merge)", async ({ page }) => {
    const stamp = Date.now()
    const eventRes = await page.request.post("/api/admin/events", {
      data: { title: `E2E Role Clash ${stamp}`, startDate: "2030-09-02", endDate: "2030-09-02", publicStatus: "draft" },
    })
    const event: { id: string } = await eventRes.json()

    for (const roleName of ["Bar", "Accueil"]) {
      const res = await page.request.post("/api/admin/shifts", {
        data: { eventId: event.id, roleName, label: roleName, date: "2030-09-02", startTime: "10:00", endTime: "12:00", capacity: 2 },
      })
      expect(res.ok()).toBeTruthy()
    }

    const renameRes = await page.request.patch(`/api/admin/events/${event.id}/roles/${encodeURIComponent("Bar")}`, {
      data: { name: "Accueil" },
    })
    expect(renameRes.status()).toBe(409)

    const detail = await (await page.request.get(`/api/admin/events/${event.id}`)).json()
    expect(detail.shifts.some((s: { roleName: string }) => s.roleName === "Bar")).toBe(true)
  })

  test("deleting a role cancels every one of its shifts", async ({ page }) => {
    // Doesn't register a volunteer first to also cover the registration-cascade/notification
    // path (cancelShift() itself is shared with the already-covered single-shift DELETE, and
    // POST /api/public/registrations currently hangs in this e2e env — see #228). Once that's
    // fixed, extend this to register a volunteer and assert cancelledRegistrations/notified too.
    const stamp = Date.now()
    const eventRes = await page.request.post("/api/admin/events", {
      data: { title: `E2E Role Delete ${stamp}`, startDate: "2030-09-03", endDate: "2030-09-03", publicStatus: "published" },
    })
    const event: { id: string; slug: string } = await eventRes.json()

    await page.request.post("/api/admin/shifts", {
      data: { eventId: event.id, roleName: "Sécurité", label: "Sécurité", date: "2030-09-03", startTime: "10:00", endTime: "12:00", capacity: 2 },
    })
    await page.request.post("/api/admin/shifts", {
      data: { eventId: event.id, roleName: "Sécurité", label: "Entrée", date: "2030-09-03", startTime: "14:00", endTime: "16:00", capacity: 2 },
    })

    const delRes = await page.request.delete(`/api/admin/events/${event.id}/roles/${encodeURIComponent("Sécurité")}`)
    expect(delRes.ok()).toBeTruthy()
    const delBody = await delRes.json()
    expect(delBody.cancelledShifts).toBe(2)

    const detail = await (await page.request.get(`/api/admin/events/${event.id}`)).json()
    expect(detail.shifts.every((s: { status: string }) => s.status === "cancelled")).toBe(true)
  })

  test("renaming and deleting a role through the admin UI", async ({ page }) => {
    const stamp = Date.now()
    const eventRes = await page.request.post("/api/admin/events", {
      data: { title: `E2E Role UI ${stamp}`, startDate: "2030-09-04", endDate: "2030-09-04", publicStatus: "draft" },
    })
    const event: { id: string } = await eventRes.json()
    await page.request.post("/api/admin/shifts", {
      data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-09-04", startTime: "10:00", endTime: "12:00", capacity: 2 },
    })
    await page.request.post("/api/admin/shifts", {
      data: { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-09-04", startTime: "13:00", endTime: "15:00", capacity: 2 },
    })

    await page.goto(`/admin/events/${event.id}/shifts`)
    await page.getByRole("button", { name: "Gérer les postes" }).click()

    await page.getByRole("button", { name: "Renommer le poste Bar" }).click()
    await page.getByRole("textbox", { name: /Nouveau nom du poste/ }).fill("Buvette")
    await page.getByRole("button", { name: "Valider" }).click()

    await expect(page.getByRole("button", { name: "Renommer le poste Buvette" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Renommer le poste Bar" })).not.toBeVisible()

    page.once("dialog", (d) => d.accept())
    await page.getByRole("button", { name: "Supprimer le poste Accueil" }).click()
    await expect(page.getByRole("button", { name: "Renommer le poste Accueil" })).not.toBeVisible()

    const detail = await (await page.request.get(`/api/admin/events/${event.id}`)).json()
    expect(detail.shifts.find((s: { roleName: string }) => s.roleName === "Buvette")).toBeTruthy()
    expect(detail.shifts.find((s: { roleName: string }) => s.roleName === "Accueil").status).toBe("cancelled")
  })
})
