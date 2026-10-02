import { expect, type Locator, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

/**
 * Rendered checks of the focus indicator in forced colours (#579, follow-up of #574), under
 * Chromium's emulation (`emulateMedia({ forcedColors: "active" })`). They prove the technical
 * presence of an outline, not its perceptibility in a real Windows contrast theme.
 */

export type Scheme = "light" | "dark"

/** An element left out of a generic sweep, by a precise selector and its exact text, with the reason. */
export type Exclusion = { selector: string; text?: string; reason: string }

export type SweepOptions = {
  /** At least this many distinct elements must be reached, so that an empty page cannot pass. */
  min: number
  /** Upper bound of Tab presses before the sweep gives up (and fails). */
  max?: number
  exclude?: Exclusion[]
  /** Restrict the sweep to this container (a dialog). The sweep stops when focus leaves it. */
  within?: string
  /** A modal (aria-modal) traps focus: leaving `within` is a failure. A non-modal popover does not. */
  trap?: boolean
}

export type SweepResult = { visited: string[]; failures: string[] }

// ── In-page code (serialised by page.evaluate, so self-contained) ────────────────────────────

type InPageArgs = { exclude: Exclusion[] }

/**
 * Checks of the focused element, run in the page. Returns readable failures, prefixed by nothing:
 * the caller adds the element description.
 */
function checkActiveElementInPage({ exclude }: InPageArgs) {
  const el = document.activeElement as HTMLElement | null
  const describe = (e: Element): string => {
    const h = e as HTMLElement
    const tag = e.tagName.toLowerCase()
    const role = e.getAttribute("role")
    const labelledBy = e.getAttribute("aria-labelledby")
    const candidates: (string | null | undefined)[] = [
      e.getAttribute("aria-label"),
      labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : null,
      (h as HTMLInputElement).labels?.[0]?.textContent,
      e.getAttribute("placeholder"),
      e.getAttribute("name"),
      h.innerText || e.textContent,
    ]
    const label = candidates.find((c) => c != null && c.trim() !== "") ?? ""
    const text = label.replace(/\s+/g, " ").trim().slice(0, 60)
    const type = e.getAttribute("type")
    return `${tag}${role ? `[role=${role}]` : ""}${type ? `[type=${type}]` : ""}${e.id && !/^_|«|:/.test(e.id) ? `#${e.id}` : ""} « ${text} »`
  }
  // Whether `layer` paints above `target`: the z-index of the outermost z-indexed positioned
  // ancestor of each, below their common ancestor. On a tie, a positioned chain (z-index auto
  // or 0, e.g. a sticky header) paints above in-flow content whatever the DOM order (CSS 2.2
  // Appendix E); otherwise the later one in the document wins.
  const stackedAbove = (layer: Element, target: Element): boolean => {
    let common: Element | null = layer.parentElement
    while (common && !common.contains(target)) common = common.parentElement
    const level = (e: Element): [number, boolean] => {
      let z = 0, positioned = false
      for (let a: Element | null = e; a && a !== common; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (s.position !== "static") { positioned = true; if (s.zIndex !== "auto") z = parseInt(s.zIndex, 10) || 0 }
      }
      return [z, positioned]
    }
    const [lz, lp] = level(layer), [tz, tp] = level(target)
    if (lz !== tz) return lz > tz
    if (lp !== tp) return lp
    return !!(target.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING)
  }
  if (!el || el === document.body || el === document.documentElement) return { kind: "none" as const }
  // Next.js dev overlay (dev server only): not part of the product.
  if (el.tagName === "NEXTJS-PORTAL" || el.closest("nextjs-portal")) return { kind: "skip" as const, reason: "dev overlay" }
  for (const x of exclude) {
    if (el.matches(x.selector) && (x.text === undefined || (el.textContent ?? "").trim() === x.text)) {
      return { kind: "skip" as const, reason: x.reason }
    }
  }
  if (!el.dataset.fcId) el.dataset.fcId = String(Math.random()).slice(2)
  el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior })

  // A native date / time field has several stops: its segments (the host matches :focus) and its
  // calendar button, a shadow part whose UA focus ring cannot be measured from the host.
  if (el instanceof HTMLInputElement && /^(date|time|datetime-local|month|week)$/.test(el.type) && !el.matches(":focus")) {
    return { kind: "skip" as const, reason: "calendar button of a native date field" }
  }
  // A native input made transparent over its label (a pill radio): the label carries the indicator.
  const t: HTMLElement = parseFloat(getComputedStyle(el).opacity) === 0 && el.closest("label") ? el.closest("label")! : el

  const failures: string[] = []
  const cs = getComputedStyle(t)
  const alpha = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return c === "transparent" ? 0 : 1
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    return parts.length >= 4 ? parseFloat(parts[3]) : 1
  }

  // 1-3: a painted outline.
  const style = cs.outlineStyle
  const width = parseFloat(cs.outlineWidth) || 0
  const offset = parseFloat(cs.outlineOffset) || 0
  if (style === "none") failures.push("outline-style is none")
  if (!(width > 0)) failures.push(`outline-width is ${cs.outlineWidth}`)
  if (style !== "auto" && style !== "none" && alpha(cs.outlineColor) === 0) failures.push(`outline colour is transparent (${cs.outlineColor})`)

  // 4: nothing opts out of forcing.
  for (let a: Element | null = t; a; a = a.parentElement) {
    if (getComputedStyle(a).forcedColorAdjust === "none") { failures.push(`forced-color-adjust: none on ${describe(a)}`); break }
  }

  // 5: visible and not covered.
  const r = t.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) failures.push(`empty rect ${r.width}x${r.height}`)
  for (let a: Element | null = t; a; a = a.parentElement) {
    const s = getComputedStyle(a)
    if (s.visibility === "hidden" || parseFloat(s.opacity) === 0 || (a as HTMLElement).inert) { failures.push(`hidden by ${describe(a)} (visibility/opacity/inert)`); break }
  }
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  if (r.width > 0 && r.height > 0) {
    // The largest corner radius: a point inset by less than a rounded corner's radius falls outside
    // it and hits the parent (the last button of a group is rounded on the right only).
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius]
    const radius = Math.max(...radii.map((v) => parseFloat(v) || 0), 2)
    const inset = Math.min(radius, r.width / 2, r.height / 2)
    const pts: [number, number, string][] = [
      [r.left + r.width / 2, r.top + r.height / 2, "centre"],
      [r.left + inset, r.top + inset, "top-left"],
      [r.right - inset, r.top + inset, "top-right"],
      [r.left + inset, r.bottom - inset, "bottom-left"],
      [r.right - inset, r.bottom - inset, "bottom-right"],
    ]
    for (const [x, y, where] of pts) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue
      const hit = document.elementFromPoint(x, y)
      if (!hit || !(t === hit || t.contains(hit) || (t instanceof HTMLLabelElement && t.control === hit))) {
        failures.push(`covered at ${where} by ${hit ? describe(hit) : "nothing"}`)
        break
      }
    }
  }

  // Outline band: covered only by a positioned layer that is not an ancestor or descendant.
  const ext = offset + width
  if (style !== "none" && ext > 0 && r.width > 0) {
    const mid = offset + width / 2
    const band: [number, number, string][] = [
      [r.left + r.width / 2, r.top - mid, "outline top"],
      [r.left + r.width / 2, r.bottom + mid, "outline bottom"],
      [r.left - mid, r.top + r.height / 2, "outline left"],
      [r.right + mid, r.top + r.height / 2, "outline right"],
    ]
    for (const [x, y, where] of band) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue
      const hit = document.elementFromPoint(x, y)
      if (!hit || hit === t || t.contains(hit) || hit.contains(t)) continue
      let layer: Element | null = null
      for (let a: Element | null = hit; a && !a.contains(t); a = a.parentElement) {
        const s = getComputedStyle(a)
        if (s.position === "fixed" || s.position === "sticky" || (s.position === "absolute" && s.zIndex !== "auto")) { layer = a; break }
      }
      // The hit is what lies under the point, not what paints there: the outline is not hit-tested.
      // A layer covers the outline only if it is stacked above the focused element, compared at
      // their common ancestor (#583: a focused bar raised with `focus-within:z-20` above the z-10
      // role labels).
      if (layer && !stackedAbove(layer, t)) layer = null
      if (layer) { failures.push(`${where} covered by positioned ${describe(layer)}`); break }
    }
  }

  // 6: the outline box is not clipped by an overflow ancestor, nor by the viewport.
  if (style !== "none" && ext > 0) {
    const box = { left: r.left - ext, top: r.top - ext, right: r.right + ext, bottom: r.bottom + ext }
    const tol = 0.5
    for (let a = t.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a)
      const clipX = /hidden|auto|scroll|clip/.test(s.overflowX) || /paint|strict|content/.test(s.contain)
      const clipY = /hidden|auto|scroll|clip/.test(s.overflowY) || /paint|strict|content/.test(s.contain)
      if (!clipX && !clipY) continue
      const ar = a.getBoundingClientRect()
      const clip = { left: ar.left + a.clientLeft, top: ar.top + a.clientTop, right: ar.left + a.clientLeft + a.clientWidth, bottom: ar.top + a.clientTop + a.clientHeight }
      const out =
        (clipX && (box.left < clip.left - tol || box.right > clip.right + tol)) ||
        (clipY && (box.top < clip.top - tol || box.bottom > clip.bottom + tol))
      if (out) { failures.push(`outline clipped by ${describe(a)} (overflow ${s.overflowX}/${s.overflowY})`); break }
    }
    // An element larger than the viewport (a long scrollable region) cannot fit on that axis.
    const fitsX = box.right - box.left <= vw, fitsY = box.bottom - box.top <= vh
    if ((fitsX && (box.left < -tol || box.right > vw + tol)) || (fitsY && (box.top < -tol || box.bottom > vh + tol))) failures.push("outline outside the viewport")
  }

  return {
    kind: "element" as const,
    id: el.dataset.fcId,
    name: describe(el),
    ariaDisabled: el.getAttribute("aria-disabled") === "true",
    disabled: (el as HTMLButtonElement).disabled === true,
    failures,
  }
}

/** Visual signature of an element that survives forcing (see the review's list). */
function forcedSignatureInPage(el: Element) {
  const opaque = (e: Element | null): string => {
    for (let a = e; a; a = a.parentElement) {
      const c = getComputedStyle(a).backgroundColor
      const m = c.match(/rgba?\(([^)]+)\)/)
      const parts = m ? m[1].split(/[\s,/]+/).filter(Boolean) : []
      const al = parts.length >= 4 ? parseFloat(parts[3]) : 1
      if (al > 0) return `rgb(${parts.slice(0, 3).join(", ")})`
    }
    return "canvas"
  }
  const one = (e: Element) => {
    const s = getComputedStyle(e)
    return [
      `outline:${s.outlineStyle}/${s.outlineWidth}`,
      `border:${s.borderTopStyle}/${s.borderTopWidth}/${s.borderBottomStyle}/${s.borderBottomWidth}`,
      `opacity:${s.opacity}`,
      `bg:${opaque(e)}`,
      `color:${s.color}`,
      `decoration:${s.textDecorationLine}`,
    ].join(" ")
  }
  const icons = Array.from(el.querySelectorAll("svg, img")).filter((i) => {
    const b = i.getBoundingClientRect()
    return b.width > 0 && b.height > 0 && getComputedStyle(i).visibility !== "hidden"
  }).length
  // Which descendants are rendered (an icon swapped for another one is a visible difference).
  const descendants = Array.from(el.querySelectorAll("*")).map((d) => `${d.getClientRects().length > 0 ? "shown" : "hidden"} ${one(d)}`)
  return { self: one(el), icons, descendants }
}

// ── Node side ────────────────────────────────────────────────────────────────────────────────

export async function emulateForcedColors(page: Page, scheme: Scheme) {
  await page.emulateMedia({ forcedColors: "active", colorScheme: scheme })
}

/**
 * Tabs through the page (or the dialog given by `within`) until focus comes back to the first
 * element reached, checking each focused element. aria-disabled controls get the full checks plus
 * « Enter and Space do nothing » and « looks different ».
 */
export async function sweep(page: Page, label: string, opts: SweepOptions): Promise<SweepResult> {
  const max = opts.max ?? 250
  const exclude = opts.exclude ?? []
  const failures: string[] = []
  const visited: string[] = []
  let firstId: string | null = null
  let presses = 0
  // In a dialog, the control focused on opening (moved there by code after a keyboard action, so
  // :focus-visible matches) is measured too, before the first Tab. A tabIndex={-1} heading focused
  // on opening is the allowed code-focus exception and is not measured.
  const startInside = opts.within
    ? await page.evaluate((sel) => !!document.activeElement?.closest(sel) && document.activeElement?.getAttribute("tabindex") !== "-1", opts.within)
    : false
  for (; presses < max; presses++) {
    if (!(startInside && presses === 0)) await page.keyboard.press("Tab")
    const res = await page.evaluate(checkActiveElementInPage, { exclude })
    if (res.kind === "none" || res.kind === "skip") continue
    if (firstId === null) firstId = res.id!
    else if (res.id === firstId) break
    if (opts.within) {
      const inside = await page.evaluate((sel) => !!document.activeElement?.closest(sel), opts.within)
      if (!inside) {
        if (opts.trap) failures.push(`${label}: focus left the modal ${opts.within} to ${res.name} (no focus trap)`)
        break
      }
    }
    visited.push(res.name)
    for (const f of res.failures) failures.push(`${label}: ${res.name}: ${f}`)
    if (res.disabled) failures.push(`${label}: ${res.name}: disabled but reached by Tab`)
    if (res.ariaDisabled) failures.push(...(await checkAriaDisabledFocused(page, `${label}: ${res.name}`)))
  }
  if (presses >= max && !opts.within) failures.push(`${label}: focus did not come back to its first element after ${max} Tab presses`)
  if (visited.length < opts.min) failures.push(`${label}: only ${visited.length} elements reached by Tab, expected at least ${opts.min}`)
  failures.push(...(await checkDisabledControls(page, label, opts.within)))
  return { visited, failures }
}

/**
 * The focused aria-disabled control: attribute present, looks different (opacity or colour, not the
 * cursor), and Enter / Space do nothing: no write request, no navigation, no dialog opened or
 * closed. Moving the focus to a field to correct (validation feedback) is allowed.
 */
export async function checkAriaDisabledFocused(page: Page, label: string): Promise<string[]> {
  const failures: string[] = []
  const before = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const s = getComputedStyle(el)
    // An enabled control of the same kind nearby, to compare with.
    let sibling: HTMLElement | null = null
    for (let scope = el.parentElement; scope && !sibling; scope = scope.parentElement) {
      sibling = Array.from(scope.querySelectorAll<HTMLElement>(el.tagName)).find((x) => x !== el && x.getAttribute("aria-disabled") !== "true" && !(x as HTMLButtonElement).disabled && x.getBoundingClientRect().width > 0) ?? null
    }
    const effOpacity = (e: Element | null) => { let o = 1; for (let a = e; a; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return o }
    return {
      attr: el.getAttribute("aria-disabled"),
      opacity: effOpacity(el),
      color: s.color,
      siblingColor: sibling ? getComputedStyle(sibling).color : null,
      siblingOpacity: sibling ? effOpacity(sibling) : null,
      url: location.href,
      dialogs: document.querySelectorAll("[role=dialog],[role=alertdialog]").length,
      id: el.dataset.fcId,
    }
  })
  if (before.attr !== "true") failures.push(`${label}: aria-disabled attribute missing`)
  const distinct = before.opacity < 1 || (before.siblingColor !== null && before.siblingColor !== before.color)
  if (!distinct) failures.push(`${label}: aria-disabled looks like an enabled control (opacity ${before.opacity}, colour ${before.color})`)

  const writes: string[] = []
  const onRequest = (req: import("@playwright/test").Request) => { if (req.method() !== "GET" && req.method() !== "HEAD") writes.push(`${req.method()} ${req.url()}`) }
  page.on("request", onRequest)
  for (const key of ["Enter", "Space"]) {
    await page.keyboard.press(key)
    await page.waitForTimeout(250)
  }
  page.off("request", onRequest)
  const after = await page.evaluate(() => ({
    url: location.href,
    dialogs: document.querySelectorAll("[role=dialog],[role=alertdialog]").length,
    id: (document.activeElement as HTMLElement | null)?.dataset.fcId,
  }))
  if (writes.length) failures.push(`${label}: aria-disabled but Enter/Space sent ${writes.join(", ")}`)
  if (after.url !== before.url) failures.push(`${label}: aria-disabled but Enter/Space navigated to ${after.url}`)
  if (after.dialogs !== before.dialogs) failures.push(`${label}: aria-disabled but Enter/Space opened or closed a dialog`)
  // Moving the focus to a field to correct (validation feedback) is not an action: put it back so
  // the sweep goes on from the same place.
  if (after.id !== before.id) await page.evaluate((id) => document.querySelector<HTMLElement>(`[data-fc-id="${id}"]`)?.focus(), before.id)
  return failures
}

/** Truly disabled controls: not focusable, and visibly different from an enabled one of the same kind. */
async function checkDisabledControls(page: Page, label: string, within?: string): Promise<string[]> {
  return page.evaluate(({ label, within }) => {
    const root: ParentNode = (within ? document.querySelector(within) : null) ?? document
    const out: string[] = []
    const disabled = Array.from(root.querySelectorAll<HTMLElement>("button:disabled, input:disabled, select:disabled, textarea:disabled"))
      .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest("nextjs-portal"))
    for (const el of disabled) {
      const name = `${el.tagName.toLowerCase()} « ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 50)} »`
      if (el.tabIndex >= 0 && document.activeElement === el) out.push(`${label}: disabled ${name} has the focus`)
      const sel = el.tagName === "INPUT" ? `input[type="${(el as HTMLInputElement).type}"]` : el.tagName
      let sibling: HTMLElement | null = null
      for (let scope = el.parentElement; scope && !sibling; scope = scope.parentElement) {
        sibling = Array.from(scope.querySelectorAll<HTMLElement>(sel)).find((x) => !(x as HTMLButtonElement).disabled && x.getAttribute("aria-disabled") !== "true" && x.getBoundingClientRect().width > 0) ?? null
      }
      if (!sibling) continue
      const a = getComputedStyle(el), b = getComputedStyle(sibling)
      const same = a.color === b.color && a.opacity === b.opacity && a.borderTopColor === b.borderTopColor && a.backgroundColor === b.backgroundColor
      if (same) out.push(`${label}: disabled ${name} looks like an enabled ${sibling.tagName.toLowerCase()} in forced colours`)
    }
    return out
  }, { label, within })
}

/**
 * Selected states (aria-pressed / aria-checked / aria-selected) in the scope: a selected element
 * and an unselected sibling must differ by something that survives forcing.
 */
export async function checkSelectedStates(page: Page, label: string, opts: { within?: string; ignore?: string } = {}): Promise<string[]> {
  const pairs = await page.evaluate(({ within, ignore }) => {
    document.querySelectorAll("[data-fc-pair]").forEach((e) => e.removeAttribute("data-fc-pair"))
    const root: ParentNode = (within ? document.querySelector(within) : null) ?? document
    const found: { sel: string; unsel: string; name: string }[] = []
    for (const attr of ["aria-pressed", "aria-checked", "aria-selected"]) {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${attr}="true"]`))) {
        if (ignore && el.matches(ignore)) continue
        if (el.getBoundingClientRect().width === 0) continue
        let other: HTMLElement | null = null
        let scope = el.parentElement
        for (let i = 0; i < 3 && scope && !other; i++, scope = scope.parentElement) {
          other = Array.from(scope.querySelectorAll<HTMLElement>(`[${attr}="false"]`)).find((x) => x.tagName === el.tagName && x.getBoundingClientRect().width > 0) ?? null
        }
        if (!other) continue
        el.dataset.fcPair = String(found.length); other.dataset.fcPair = String(found.length)
        found.push({ sel: `[data-fc-pair="${found.length}"][${attr}="true"]`, unsel: `[data-fc-pair="${found.length}"][${attr}="false"]`, name: `${attr} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40)}` })
      }
    }
    return found
  }, opts)
  const failures: string[] = []
  // Measure without focus on either element: the focus outline is not a selection indicator.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (const p of pairs) {
    const a = await page.locator(p.sel).first().evaluate(forcedSignatureInPage)
    const b = await page.locator(p.unsel).first().evaluate(forcedSignatureInPage)
    const same = a.self === b.self && a.icons === b.icons && JSON.stringify(a.descendants) === JSON.stringify(b.descendants)
    if (same) failures.push(`${label}: ${p.name}: selected and unselected look the same in forced colours (${a.self})`)
  }
  return failures
}

/** The same element before and after a state change must differ by something that survives forcing. */
export async function stateSignature(locator: Locator) {
  return locator.evaluate(forcedSignatureInPage)
}

/** Outline checks of one element that has the focus now (focus moved by code or by keyboard). */
export async function checkFocused(page: Page, label: string): Promise<string[]> {
  const res = await page.evaluate(checkActiveElementInPage, { exclude: [] })
  if (res.kind !== "element") return [`${label}: no focused element (${res.kind})`]
  return res.failures.map((f) => `${label}: ${res.name}: ${f}`)
}

/** Element screenshot with a margin wide enough for the outline, when FORCED_COLORS_SHOTS_DIR is set. */
export async function shot(page: Page, locator: Locator, name: string) {
  const dir = process.env.FORCED_COLORS_SHOTS_DIR
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) return
  const vp = page.viewportSize()!
  const m = 12
  const x = Math.max(0, box.x - m), y = Math.max(0, box.y - m)
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    clip: { x, y, width: Math.min(vp.width - x, box.width + 2 * m), height: Math.min(vp.height - y, box.height + 2 * m) },
  })
}

export function expectNoFailures(failures: string[]) {
  expect(failures, failures.join("\n")).toEqual([])
}
