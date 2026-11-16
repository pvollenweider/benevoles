import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { seriousViolations } from "./helpers/axe"
import { FRISE_KEYS_SHOWN } from "../src/lib/frise-keyboard"
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
 * #534: a shift the visitor already holds is named « … : inscription confirmée », not offered
 * (aria-disabled), and tagged « Ton créneau ».
 *
 * #1075: one tab stop per day; the arrows reach every bar, a held one included, and Tab leaves.
 *
 * #1023: once the role's limit per person is reached, its other bars say so under the bar, in the
 * words of their name, and in the list view.
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
  const first = page.getByRole("button", { name: /^08h–10h \d+\/\d+, Bar : sélectionner/ })
  await waitForHydration(first)

  await first.focus()
  // The arrows go from bar to bar (#1075): one row, in time order, lanes merged.
  const expected = [/^08h–10h \d+\/\d+, Bar : sélectionner/, /^09h–11h \d+\/\d+, Bar : sélectionner/, /^10h–12h \d+\/\d+, Bar : sélectionner/]
  for (const [i, name] of expected.entries()) {
    if (i > 0) await page.keyboard.press("ArrowRight")
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
  await expect(held).toHaveAccessibleName("10h–12h, Bar : inscription confirmée")
  await expect(held).toHaveAttribute("aria-disabled", "true")
  await expect(held).not.toHaveAttribute("aria-pressed")
  await expect(page.getByText("Ton créneau", { exact: true })).toBeVisible()
  // The other shift is still offered.
  const accueil = page.getByRole("button", { name: /^14h–16h \d+\/\d+, Accueil : sélectionner/ })
  await expect(accueil).toBeEnabled()
  await expect(accueil).not.toHaveAttribute("aria-disabled")

  // #1075, with real keys: Tab reaches the day's single tab stop, the first bar that can be chosen.
  const region = page.getByRole("region", { name: /^Planning du / })
  await expect(region.locator("[data-shift-id][tabindex='0']")).toHaveCount(1)
  await page.getByRole("button", { name: "Frise", exact: true }).focus()
  for (let i = 0; i < 15 && !(await accueil.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
  await expect(accueil).toBeFocused()
  // The keys are shown under the chart while a bar has the keyboard focus, and only then.
  const keys = page.locator("[data-frise-keys]")
  await expect(keys).toBeVisible()
  await expect(keys).toHaveText(FRISE_KEYS_SHOWN)
  // Up to the held bar: reachable, says why it is not offered, and Enter does nothing.
  await page.keyboard.press("ArrowUp")
  await expect(held).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(held).toBeFocused()
  await expect(page.getByRole("button", { name: /^Continuer/ })).toHaveCount(0)
  // Tab leaves the schedule; Shift+Tab comes back to the bar focused last.
  await page.keyboard.press("Tab")
  expect(await region.evaluate((r) => r.contains(document.activeElement))).toBe(false)
  await expect(keys).toBeHidden()
  await page.keyboard.press("Shift+Tab")
  await expect(held).toBeFocused()
  expect(await seriousViolations(page)).toEqual([])
})

test("a mouse click shows no key hint and changes nothing on a full bar (#1075)", async ({ page, browser }) => {
  const full = await createPublicEvent(browser, `E2E Planning complet ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 1 },
    { label: "Accueil", startTime: "14:00", endTime: "16:00" },
  ])
  // Someone else fills Bar, from their own browser.
  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await other.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await publicSignUp(other, full, [full.shifts[0].id])
  await otherContext.close()
  await page.goto(publicUrl(full))
  const bar = page.getByRole("button", { name: /^Complet, Bar 10h–12h/ })
  await waitForHydration(page.getByRole("button", { name: /, Accueil : sélectionner/ }))
  await expect(bar).toHaveAttribute("aria-disabled", "true")
  await expect(bar).toHaveAttribute("tabindex", "-1")
  // Playwright's click waits on aria-disabled: a real mouse press at the bar's centre instead.
  const box = (await bar.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator("[data-frise-keys]")).toBeHidden()
  await expect(page.getByRole("button", { name: /^Continuer/ })).toHaveCount(0)
  // The keyboard now starts from it.
  await page.keyboard.press("ArrowDown")
  await expect(page.getByRole("button", { name: /, Accueil : sélectionner/ })).toBeFocused()
  await expect(page.locator("[data-frise-keys]")).toBeVisible()
  // Back up with the keyboard: the full bar's focus outline is painted (its faint frame was inline
  // and hid it), whole.
  await page.keyboard.press("ArrowUp")
  await expect(bar).toBeFocused()
  // Polled: the bar's colours, outline included, ease in over 150 ms (transition-colors).
  await expect.poll(() => bar.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` })).toBe("solid 2px rgb(29, 78, 216)")
  expect(await coveredSides(page)).toEqual([])
})

test("a bar of a role whose limit per person is reached says so under the bar and in the list (#1023)", async ({ page, browser }) => {
  const limited = await createPublicEvent(browser, `E2E Planning limite ${Date.now()}`, [
    { label: "Buvette", startTime: "10:00", endTime: "14:00", maxPerVolunteer: 2 },
    { label: "Buvette", startTime: "14:00", endTime: "18:00", maxPerVolunteer: 2 },
    { label: "Buvette", startTime: "18:00", endTime: "22:00", maxPerVolunteer: 2 },
  ])
  const token = await publicSignUp(page, limited, [limited.shifts[0].id, limited.shifts[1].id])
  await page.goto(publicUrl(limited))
  await page.evaluate(([slug, t]) => localStorage.setItem(`benevoles_token_${slug}`, t), [limited.slug, token])
  await page.goto(publicUrl(limited))

  const third = page.getByRole("button", { name: /^18h–22h \d+\/\d+, Buvette : sélectionner/ })
  await waitForHydration(third)
  await expect(third).toHaveAccessibleName("18h–22h 0/5, Buvette : sélectionner (5 places libres sur 5) (limite de 2 créneaux par personne atteinte)")
  // A 4-hour bar is narrow: the short form under it, the whole sentence in its name.
  await expect(page.getByText("Limite atteinte", { exact: true })).toBeVisible()
  // Still clickable on purpose: the click says why it isn't added.
  await third.click()
  await expect(page.getByText("Au plus 2 créneaux « Buvette » par personne : ce créneau n'est pas ajouté.").first()).toBeVisible()

  await page.getByRole("button", { name: "Liste", exact: true }).click()
  await expect(page.getByRole("button", { name: /^18h–22h · Buvette/ })).toContainText("Limite de 2 créneaux par personne atteinte · 5 places libres sur 5")
})
