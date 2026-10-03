/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import { tabbables, trapTarget } from "../focus-trap"

// Focus trap of ModalShell (#585): what Tab reaches in a dialog, and where it wraps.

function mount(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  document.body.append(root)
  return root
}

const names = (els: HTMLElement[]) => els.map((el) => el.getAttribute("data-n"))

describe("tabbables", () => {
  afterEach(() => { document.body.innerHTML = "" })

  it("skips what Tab cannot reach: hidden form, disabled, tabindex -1, display none, inert, aria-hidden, hidden input", () => {
    const root = mount(`
      <button data-n="a">A</button>
      <form hidden><button data-n="hidden-form">Analyser</button></form>
      <button disabled data-n="disabled">D</button>
      <p tabindex="-1" data-n="minus-one">Résumé</p>
      <div style="display:none"><a href="#" data-n="display-none">x</a></div>
      <div inert><input data-n="inert"></div>
      <div aria-hidden="true"><button data-n="aria-hidden">x</button></div>
      <input type="hidden" data-n="hidden-input">
      <span style="visibility:hidden"><button data-n="invisible">x</button></span>
      <a data-n="no-href">pas un lien</a>
      <button aria-disabled="true" data-n="aria-disabled">En cours</button>
      <div tabindex="0" data-n="region">Tableau</div>
      <details><summary data-n="summary">Plus</summary><button data-n="closed">x</button></details>
    `)
    expect(names(tabbables(root))).toEqual(["a", "aria-disabled", "region", "summary"])
  })

  it("keeps one stop per radio group: the checked radio, else the first", () => {
    const root = mount(`
      <form>
        <input type="radio" name="dup" data-n="skip">
        <input type="radio" name="dup" data-n="update" checked>
        <input type="radio" name="other" data-n="o1">
        <input type="radio" name="other" data-n="o2">
      </form>
      <form><input type="radio" name="dup" data-n="second-form"></form>
      <button data-n="after">Après</button>
    `)
    expect(names(tabbables(root))).toEqual(["update", "o1", "second-form", "after"])
  })
})

describe("trapTarget", () => {
  afterEach(() => { document.body.innerHTML = "" })

  function setUp() {
    const outside = document.createElement("button")
    document.body.append(outside)
    const root = mount(`
      <button data-n="first">Fermer</button>
      <button data-n="middle">Retour</button>
      <button data-n="last">Importer</button>
      <p tabindex="-1" data-n="result">Résultat</p>
      <form hidden><button>Analyser</button></form>
    `)
    const items = tabbables(root)
    const get = (n: string) => root.querySelector<HTMLElement>(`[data-n="${n}"]`)!
    return { root, items, get, outside }
  }

  it("wraps forward from the last item to the first, and backward from the first to the last", () => {
    const { root, items, get } = setUp()
    expect(trapTarget(root, items, get("last"), false)).toBe(get("first"))
    expect(trapTarget(root, items, get("first"), true)).toBe(get("last"))
  })

  it("lets the browser move inside the list", () => {
    const { root, items, get } = setUp()
    expect(trapTarget(root, items, get("middle"), false)).toBeNull()
    expect(trapTarget(root, items, get("middle"), true)).toBeNull()
    expect(trapTarget(root, items, get("first"), false)).toBeNull()
    expect(trapTarget(root, items, get("last"), true)).toBeNull()
  })

  it("wraps forward from a tabindex -1 paragraph after the last item", () => {
    const { root, items, get } = setUp()
    expect(trapTarget(root, items, get("result"), false)).toBe(get("first"))
    expect(trapTarget(root, items, get("result"), true)).toBeNull()
  })

  it("brings focus back in from outside: first forward, last backward", () => {
    const { root, items, get, outside } = setUp()
    expect(trapTarget(root, items, outside, false)).toBe(get("first"))
    expect(trapTarget(root, items, outside, true)).toBe(get("last"))
    expect(trapTarget(root, items, document.body, false)).toBe(get("first"))
    expect(trapTarget(root, items, null, true)).toBe(get("last"))
  })

  it("returns null with nothing to reach", () => {
    const root = mount(`<p>Texte</p>`)
    expect(trapTarget(root, [], document.body, false)).toBeNull()
  })
})
