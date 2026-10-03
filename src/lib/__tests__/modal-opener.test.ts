/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest"
import { isFocusDropped } from "../focus-return"
import { closestOpener, resetPointerOpenerForTests, resolveOpener, trackPointerOpener } from "../modal-opener"

// The opener of a dialog under WebKit, which does not focus a tapped button (#585).

function mount(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  document.body.append(root)
  return root
}

afterEach(() => {
  document.body.innerHTML = ""
  resetPointerOpenerForTests()
})

describe("isFocusDropped", () => {
  it("is true for nothing, <body>, <main> and [role=main]; false for a control", () => {
    const root = mount(`<main tabindex="-1"></main><div role="main" tabindex="-1"></div><button>OK</button>`)
    expect(isFocusDropped(null)).toBe(true)
    expect(isFocusDropped(undefined)).toBe(true)
    expect(isFocusDropped(document.body)).toBe(true)
    expect(isFocusDropped(root.querySelector("main"))).toBe(true)
    expect(isFocusDropped(root.querySelector("[role=main]"))).toBe(true)
    expect(isFocusDropped(root.querySelector("button"))).toBe(false)
  })
})

describe("closestOpener", () => {
  it("finds the control around the pressed node, never <main> or plain content", () => {
    const root = mount(`
      <main tabindex="-1">
        <button id="b"><svg><path id="icon"></path></svg></button>
        <div id="plain">Texte</div>
        <div id="focusable" tabindex="0">Région</div>
        <div role="menuitem" id="item">Mon compte</div>
      </main>
    `)
    expect(closestOpener(root.querySelector("#icon"))).toBe(root.querySelector("#b"))
    expect(closestOpener(root.querySelector("main"))).toBeNull()
    expect(closestOpener(root.querySelector("#plain"))).toBeNull()
    expect(closestOpener(root.querySelector("#focusable"))).toBe(root.querySelector("#focusable"))
    expect(closestOpener(root.querySelector("#item"))).toBe(root.querySelector("#item"))
    expect(closestOpener(null)).toBeNull()
  })
})

describe("resolveOpener", () => {
  beforeAll(() => trackPointerOpener())

  it("is the focused element when focus is not dropped", () => {
    const root = mount(`<button id="a">A</button><button id="b">B</button>`)
    root.querySelector<HTMLElement>("#a")!.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    const b = root.querySelector<HTMLElement>("#b")!
    expect(resolveOpener(b)).toBe(b)
  })

  it("is the control last pressed with a pointer when focus is on <body> or <main>, and only once", () => {
    const root = mount(`<main tabindex="-1"><button id="a">A</button></main>`)
    const a = root.querySelector<HTMLElement>("#a")!
    a.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(resolveOpener(root.querySelector("main"))).toBe(a)
    expect(resolveOpener(document.body)).toBeNull()
  })

  it("forgets the pointer press after a key press", () => {
    const root = mount(`<button id="a">A</button>`)
    root.querySelector<HTMLElement>("#a")!.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(resolveOpener(document.body)).toBeNull()
  })

  it("records nothing for a press on plain content", () => {
    const root = mount(`<button id="a">A</button><p id="text">Texte</p>`)
    root.querySelector<HTMLElement>("#a")!.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    root.querySelector<HTMLElement>("#text")!.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(resolveOpener(document.body)).toBeNull()
  })

  // iOS VoiceOver double tap, Switch or Voice Control: a click without a pointer press.
  it("records the control of a click that had no pointer press, focus on <main>", () => {
    const root = mount(`<main tabindex="-1"><button id="a">A</button></main>`)
    const a = root.querySelector<HTMLElement>("#a")!
    a.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(resolveOpener(root.querySelector("main"))).toBe(a)
  })

  it("a click on plain content keeps the control already recorded", () => {
    const root = mount(`<button id="a">A</button><p id="text">Texte</p>`)
    const a = root.querySelector<HTMLElement>("#a")!
    a.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    root.querySelector<HTMLElement>("#text")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(resolveOpener(document.body)).toBe(a)
  })

  it("installs its listeners once", () => {
    trackPointerOpener()
    trackPointerOpener(document)
    const root = mount(`<button id="a">A</button>`)
    const a = root.querySelector<HTMLElement>("#a")!
    a.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(resolveOpener(null)).toBe(a)
  })
})
