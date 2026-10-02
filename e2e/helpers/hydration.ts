import { expect, type Locator } from "@playwright/test"

/**
 * Waits until React has hydrated `target` (#592). `page.goto` resolves on the load event, which can
 * come before hydration on a busy dev server: a click there does nothing, and text typed into a
 * controlled input is reset to its initial state when hydration renders it.
 *
 * React attaches its internal fiber to every DOM node it hydrates, under a `__reactFiber$…` key.
 */
export async function waitForHydration(target: Locator, timeout = 20_000): Promise<void> {
  await expect
    .poll(() => target.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"))), {
      message: "React never hydrated the element",
      timeout,
    })
    .toBe(true)
}
