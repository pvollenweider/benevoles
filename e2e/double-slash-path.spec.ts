import { test, expect } from "@playwright/test"

/**
 * `//doc` (repeated slashes) crashed the client router with a SecurityError from
 * history.replaceState (#474). The root layout's first script replaces it with the clean address.
 */
test("a doubled slash lands on the clean address without a page error", async ({ page, baseURL }) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${baseURL}//doc?x=1`)
  await expect(page).toHaveURL(/\/doc\?x=1$/)
  expect(new URL(page.url()).pathname).toBe("/doc")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})
