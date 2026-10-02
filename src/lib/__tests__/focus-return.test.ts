/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { canTakeFocus, focusFirstAvailable, focusFirstAvailableNextFrame } from "../focus-return"

// Focus restoration after a form or panel closes (#554): first usable candidate, else fallbacks.

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, parent: HTMLElement = document.body) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  node.textContent = tag
  parent.append(node)
  return node
}

describe("focusFirstAvailable", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    vi.useRealTimers()
  })

  it("focuses the first usable candidate and returns it", () => {
    const a = el("button")
    const b = el("button")
    expect(focusFirstAvailable([a, b])).toBe(a)
    expect(document.activeElement).toBe(a)
  })

  it("skips, in order, every candidate that cannot take focus", () => {
    const disconnected = document.createElement("button")
    const hiddenBox = el("div", { hidden: "" })
    const inHidden = el("button", {}, hiddenBox)
    const inertBox = el("div", { inert: "" })
    const inInert = el("button", {}, inertBox)
    const ariaHiddenBox = el("div", { "aria-hidden": "true" })
    const inAriaHidden = el("button", {}, ariaHiddenBox)
    const noneBox = el("div", { style: "display:none" })
    const inDisplayNone = el("button", {}, noneBox)
    const invisible = el("button", { style: "visibility:hidden" })
    const disabled = el("button", { disabled: "" })
    const plainDiv = el("div")
    const target = el("button")

    const got = focusFirstAvailable([
      null, undefined, () => null,
      disconnected, inHidden, inInert, inAriaHidden, inDisplayNone, invisible, disabled, plainDiv,
      target,
    ])
    expect(got).toBe(target)
    expect(document.activeElement).toBe(target)
    // canTakeFocus itself refuses the disconnected and disabled ones; the plain div passes it but
    // does not take focus, which focusFirstAvailable checks after focusing.
    expect(canTakeFocus(disconnected)).toBe(false)
    expect(canTakeFocus(disabled)).toBe(false)
    expect(canTakeFocus(plainDiv)).toBe(true)
  })

  it("skips the content of a closed <details>, but not its summary", () => {
    const details = el("details")
    const summary = el("summary", {}, details)
    const inside = el("button", {}, details)
    expect(canTakeFocus(inside)).toBe(false)
    expect(canTakeFocus(summary)).toBe(true)
  })

  it("accepts an aria-disabled button and a tabIndex=-1 div", () => {
    const ariaDisabled = el("button", { "aria-disabled": "true" })
    expect(focusFirstAvailable([ariaDisabled])).toBe(ariaDisabled)
    const target = el("div", { tabindex: "-1" })
    expect(focusFirstAvailable([target])).toBe(target)
    expect(document.activeElement).toBe(target)
  })

  it("returns a candidate that already has focus without focusing it again", () => {
    const a = el("button")
    a.focus()
    const spy = vi.spyOn(a, "focus")
    expect(focusFirstAvailable([a, el("button")])).toBe(a)
    expect(spy).not.toHaveBeenCalled()
  })

  it("returns null and leaves focus alone when nothing is usable", () => {
    const current = el("button")
    current.focus()
    expect(focusFirstAvailable([null, el("button", { disabled: "" }), () => undefined])).toBeNull()
    expect(document.activeElement).toBe(current)
  })

  it("NextFrame: nothing before the frame, then resolves the getter at frame time", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] })
    const first = el("button", { id: "first" })
    let current: HTMLElement = first
    focusFirstAvailableNextFrame([() => current])
    expect(document.activeElement).toBe(document.body)

    // The element is replaced between the call and the frame (a row remounted under a new key).
    first.remove()
    const second = el("button", { id: "second" })
    current = second
    vi.advanceTimersToNextFrame()
    expect(document.activeElement).toBe(second)
  })
})
