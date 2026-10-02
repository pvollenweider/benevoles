import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * The public schedule (DayTimeline), Chromium, normal colours.
 *
 * #583: a focused bar's outline is not covered, neither by the role-label column (z-10) on a bar
 * that starts at the first hour, nor by the next bar on a contiguous one, nor across lanes. The
 * focused bar's wrapper is raised with `focus-within:z-20`. The outline itself is not hit-tested:
 * 1 px and 3 px outside each side, the element under the point must be the bar, one of its
 * ancestors, or a positioned element stacked below it.
 *
 * #534: a shift the visitor already holds is named « … : inscription confirmée », disabled, and
 * tagged « Ton créneau ».
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  // One role, so one row: 08-10 starts at the first hour, 10-12 touches it, 09-11 overlaps both
  // and goes to a second lane.
  event = await createPublicEvent(browser, `E2E Planning public ${Date.now()}`, [
    { label: "Bar", startTime: "08:00", endTime: "10:00" },
    { label: "Bar", startTime: "09:00", endTime: "11:00" },
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  // Its own client address: the public sign-up and the personal token are rate limited per address.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

const publicUrl = (e: PublicEvent) => `/${e.slug}?org=default`

/** Sides of the focused element's outline that something stacked above it covers. */
function coveredSides(page: Page) {
  return page.evaluate(() => {
    const t = document.activeElement as HTMLElement
    const r = t.getBoundingClientRect()
    // Same rule as stackedAbove in e2e/helpers/forced-colors.ts.
    const level = (e: Element, common: Element | null): [number, boolean] => {
      let z = 0, positioned = false
      for (let a: Element | null = e; a && a !== common; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (s.position !== "static") { positioned = true; if (s.zIndex !== "auto") z = parseInt(s.zIndex, 10) || 0 }
      }
      return [z, positioned]
    }
    const stackedAbove = (layer: Element) => {
      let common: Element | null = layer.parentElement
      while (common && !common.contains(t)) common = common.parentElement
      const [lz, lp] = level(layer, common), [tz, tp] = level(t, common)
      if (lz !== tz) return lz > tz
      if (lp !== tp) return lp
      return !!(t.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING)
    }
    const covered: string[] = []
    for (const d of [1, 3]) {
      const points: [number, number, string][] = [
        [r.left + r.width / 2, r.top - d, "top"],
        [r.left + r.width / 2, r.bottom + d, "bottom"],
        [r.left - d, r.top + r.height / 2, "left"],
        [r.right + d, r.top + r.height / 2, "right"],
      ]
      for (const [x, y, side] of points) {
        const hit = document.elementFromPoint(x, y)
        if (!hit || hit === t || t.contains(hit) || hit.contains(t)) continue
        let layer: Element | null = null
        for (let a: Element | null = hit; a && !a.contains(t); a = a.parentElement) {
          if (getComputedStyle(a).position !== "static") { layer = a; break }
        }
        if (layer && stackedAbove(layer)) {
          covered.push(`${side} (${d} px) by ${layer.tagName.toLowerCase()} « ${(layer.getAttribute("aria-label") ?? (layer as HTMLElement).innerText ?? "").replace(/\s+/g, " ").slice(0, 40)} »`)
        }
      }
    }
    return covered
  })
}

test("a focused bar's outline is not covered by the role labels, the next bar or another lane (#583)", async ({ page }) => {
  await page.goto(publicUrl(event))
  const first = page.getByRole("button", { name: /^Sélectionner — Bar 08h–10h/ })
  await waitForHydration(first)

  await first.focus()
  const expected = [/^Sélectionner — Bar 08h–10h/, /^Sélectionner — Bar 09h–11h/, /^Sélectionner — Bar 10h–12h/]
  for (const [i, name] of expected.entries()) {
    if (i > 0) await page.keyboard.press("Tab")
    const focused = page.locator(":focus")
    await expect(focused).toHaveAttribute("aria-label", name)
    const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline, `${name}: an outline is painted`).not.toBe("none")
    expect(await coveredSides(page), `${name}: outline sides covered`).toEqual([])
  }
})

test("a held shift is named and tagged as the visitor's own, and not offered (#534)", async ({ page, browser }) => {
  const own = await createPublicEvent(browser, `E2E Planning tenu ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
    { label: "Accueil", startTime: "14:00", endTime: "16:00" },
  ])
  const token = await publicSignUp(page, own, [own.shifts[0].id])
  await page.goto(publicUrl(own))
  await page.evaluate(([slug, t]) => localStorage.setItem(`benevoles_token_${slug}`, t), [own.slug, token])
  await page.goto(publicUrl(own))

  const held = page.getByRole("button", { name: /: inscription confirmée$/ })
  await expect(held).toHaveAccessibleName("Bar 10h–12h : inscription confirmée")
  await expect(held).toBeDisabled()
  await expect(held).not.toHaveAttribute("aria-pressed")
  await expect(page.getByText("Ton créneau", { exact: true })).toBeVisible()
  // The other shift is still offered.
  await expect(page.getByRole("button", { name: /^Sélectionner — Accueil 14h–16h/ })).toBeEnabled()
})
