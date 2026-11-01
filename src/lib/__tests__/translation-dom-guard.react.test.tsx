/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { continueLabel } from "../continue-label"
import { installTranslationDomGuard, MAX_REPORTS } from "../translation-dom-guard"

// React warns when act() runs outside a test environment it recognises.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const nativeRemoveChild = Node.prototype.removeChild
const nativeInsertBefore = Node.prototype.insertBefore
const FLAG = Symbol.for("benevol.translationDomGuard")

function uninstall() {
  Node.prototype.removeChild = nativeRemoveChild
  Node.prototype.insertBefore = nativeInsertBefore
  delete (Node.prototype as unknown as Record<symbol, unknown>)[FLAG]
}

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container?.remove()
  container = null
  uninstall()
})

/** What Google Translate does: each text node replaced by <font><font>TEXT</font></font>. */
function translate(el: Element) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text)
  for (const text of texts) {
    if (!text.nodeValue?.trim()) continue
    const outer = document.createElement("font")
    const inner = document.createElement("font")
    inner.textContent = text.nodeValue.toUpperCase()
    outer.appendChild(inner)
    text.parentNode!.replaceChild(outer, text)
  }
}

/** The « Continuer » button as it was written before the fix: several text pieces. */
function PiecesButton({ n }: { n: number }) {
  return <button>Continuer ({n} nouveau{n > 1 ? "x" : ""} créneau{n > 1 ? "x" : ""})</button>
}

function OneStringButton({ n }: { n: number }) {
  return <button>{continueLabel(n)}</button>
}

/** Text shown or hidden next to other text: React removes the bare text node. */
function Toggled({ on }: { on: boolean }) {
  return <p>Créneaux{on && " sélectionnés"} ici</p>
}

function mount(node: React.ReactNode) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

describe("installTranslationDomGuard", () => {
  it("without it, React throws NotFoundError once the page is translated (the bug)", () => {
    const el = mount(<PiecesButton n={1} />)
    translate(el)
    // React reports the error to the root (console.error) and rethrows it from act().
    vi.spyOn(console, "error").mockImplementation(() => {})
    let thrown: unknown
    try {
      act(() => root!.render(<PiecesButton n={2} />))
    } catch (e) {
      thrown = e
    }
    // act() gathers what React rethrew into an AggregateError.
    const errors = thrown instanceof AggregateError ? thrown.errors : [thrown]
    expect(errors.map((e: Error | undefined) => e?.name)).toContain("NotFoundError")
  })

  it("with it, a translated page keeps rendering when text pieces are inserted or removed", () => {
    const report = vi.fn()
    expect(installTranslationDomGuard(Node.prototype, report)).toBe(true)
    const el = mount(
      <>
        <PiecesButton n={1} />
        <Toggled on={true} />
      </>,
    )
    translate(el)
    expect(() =>
      act(() =>
        root!.render(
          <>
            <PiecesButton n={2} />
            <Toggled on={false} />
          </>,
        ),
      ),
    ).not.toThrow()
    expect(report).toHaveBeenCalledWith("insertBefore")
    expect(report).toHaveBeenCalledWith("removeChild")
    // The page is still there, with its buttons.
    expect(el.querySelector("button")).not.toBeNull()
  })

  it("a label written as one string is rewritten whole on a translated page", () => {
    installTranslationDomGuard(Node.prototype, () => {})
    const el = mount(<OneStringButton n={1} />)
    const button = el.querySelector("button")!
    expect(button.childNodes).toHaveLength(1)
    translate(el)
    act(() => root!.render(<OneStringButton n={2} />))
    // The translator's <font> is gone: the new count shows, untranslated until it translates again.
    expect(button.textContent).toBe("Continuer (2 nouveaux créneaux)")
    expect(button.childNodes).toHaveLength(1)
    expect(button.firstChild!.nodeType).toBe(Node.TEXT_NODE)
  })

  it("leaves every other call to the browser, errors included", () => {
    installTranslationDomGuard(Node.prototype, () => {})
    const parent = document.createElement("div")
    const a = parent.appendChild(document.createElement("a"))
    const b = document.createElement("b")
    parent.insertBefore(b, a)
    expect([...parent.childNodes]).toEqual([b, a])
    parent.insertBefore(document.createElement("i"), null)
    expect(parent.lastChild?.nodeName).toBe("I")
    parent.removeChild(a)
    expect(a.parentNode).toBeNull()
    // Not the translator's case: the browser's own error still comes out.
    expect(() => parent.removeChild(null as unknown as Node)).toThrow()
  })

  it("skips only a node that left its parent, and reports at most MAX_REPORTS times", () => {
    const report = vi.fn()
    installTranslationDomGuard(Node.prototype, report)
    const parent = document.createElement("div")
    const stranger = document.createElement("span")
    for (let i = 0; i < MAX_REPORTS + 2; i++) {
      expect(parent.removeChild(stranger)).toBe(stranger)
      const node = document.createElement("em")
      expect(parent.insertBefore(node, stranger)).toBe(node)
      expect(node.parentNode).toBeNull()
    }
    expect(report).toHaveBeenCalledTimes(MAX_REPORTS)
  })

  it("installs once, and a throwing reporter never breaks the page", () => {
    const report = vi.fn(() => { throw new Error("reporter down") })
    expect(installTranslationDomGuard(Node.prototype, report)).toBe(true)
    const patched = Node.prototype.removeChild
    expect(installTranslationDomGuard(Node.prototype, report)).toBe(false)
    expect(Node.prototype.removeChild).toBe(patched)
    expect(() => document.createElement("div").removeChild(document.createElement("p"))).not.toThrow()
  })

  it("warns without any page content by default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    installTranslationDomGuard(Node.prototype)
    document.createElement("div").removeChild(document.createTextNode("Marie Dupont"))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).not.toContain("Marie")
    warn.mockRestore()
  })
})
