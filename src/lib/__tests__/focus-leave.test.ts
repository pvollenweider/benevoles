import { describe, expect, it } from "vitest"
import { focusLeftContainer, type FocusNode } from "../focus-leave"

// A minimal tree: main > (timeline > bar) + popover > (heading, deleteButton); an outside button.
function node(parent: FakeNode | null, tabIndex = -1): FakeNode {
  const n: FakeNode = { parent, tabIndex, contains: (other) => {
    for (let cur: FakeNode | null = other as FakeNode | null; cur; cur = cur.parent) if (cur === n) return true
    return false
  } }
  return n
}
type FakeNode = FocusNode & { parent: FakeNode | null }

const body = node(null)
const main = node(body)
const timeline = node(main)
const bar = node(timeline, 0)
const popover = node(main)
const heading = node(popover)
const deleteButton = node(popover)

describe("focusLeftContainer", () => {
  it("is false when focus moves inside the popover", () => {
    expect(focusLeftContainer(popover, deleteButton)).toBe(false)
    expect(focusLeftContainer(popover, heading)).toBe(false)
  })

  // Regression (#987): on iPhone (WebKit), a tapped button does not take focus; focus falls back
  // to the admin's <main tabIndex={-1}>, which contains the popover. That is not leaving it, or
  // the popover closes before the tap's click and « Supprimer le créneau » does nothing.
  it("is false when focus falls back to an ancestor of the popover", () => {
    expect(focusLeftContainer(popover, main)).toBe(false)
    expect(focusLeftContainer(popover, body)).toBe(false)
  })

  it("is true when focus goes on purpose to an ancestor in the tab order (Shift+Tab)", () => {
    const wrapper = node(null, 0)
    const inner = node(wrapper)
    expect(focusLeftContainer(inner, wrapper)).toBe(true)
  })

  it("is false for the popover itself", () => {
    expect(focusLeftContainer(popover, popover)).toBe(false)
  })

  it("is false when nothing takes focus (window switch)", () => {
    expect(focusLeftContainer(popover, null)).toBe(false)
  })

  it("is true when focus moves to another control of the page", () => {
    expect(focusLeftContainer(popover, bar)).toBe(true)
    expect(focusLeftContainer(popover, node(main, 0))).toBe(true)
    expect(focusLeftContainer(popover, node(null, 0))).toBe(true)
  })

  it("is false without a container (already unmounted)", () => {
    expect(focusLeftContainer(null, bar)).toBe(false)
  })
})
