/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"
import { renderToString } from "react-dom/server"

let pathname = "/fonctionnalites"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))

import ContentNav from "../ContentNav"
import { audienceNav } from "@/lib/doc-pages"

const AUDIENCES = audienceNav(true)

/** The « Pour qui ? » button and the list it controls. */
function disclosure() {
  const button = screen.getByRole("button", { name: "Pour qui ?" })
  const list = document.getElementById(button.getAttribute("aria-controls")!)!
  return { button, list }
}

// « Pour qui ? » (#872): a disclosure of the audience pages, not a menu.
describe("ContentNav, « Pour qui ? »", () => {
  afterEach(() => {
    cleanup()
    pathname = "/fonctionnalites"
  })

  it("is a plain link to the index page in the server's HTML, so it works without JavaScript", () => {
    const html = renderToString(<ContentNav audiences={AUDIENCES} />)
    expect(html).toContain('href="/pour-qui"')
    expect(html).toContain("Pour qui ?")
    expect(html).not.toContain("<button")
  })

  it("is a button that controls a hidden list, between the features page and the guides", () => {
    render(<ContentNav audiences={AUDIENCES} />)
    const nav = screen.getByRole("navigation", { name: "Présentation, guides et blog" })
    const { button, list } = disclosure()
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(list).not.toBeVisible()
    expect(list.tagName).toBe("UL")
    // Never the menu pattern: plain links in a list.
    expect(nav.querySelector("[role=menu], [role=menuitem]")).toBeNull()
    const order = [...nav.querySelectorAll(":scope > a, :scope > div > button")].map((el) => el.textContent?.trim())
    expect(order).toEqual(["Fonctionnalités", "Pour qui ?", "Guide administrateur", "Guide bénévole", "Blog"])
  })

  it("opens on a click, listing every audience page then « Toutes les situations »", () => {
    render(<ContentNav audiences={AUDIENCES} />)
    const { button, list } = disclosure()
    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    expect(list).toBeVisible()
    const links = within(list).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])
    expect(links).toEqual(AUDIENCES.map((l) => [l.title, l.path]))
    expect(links.at(-1)).toEqual(["Toutes les situations", "/pour-qui"])
  })

  it("closes on Escape and gives the focus back to the button", () => {
    render(<ContentNav audiences={AUDIENCES} />)
    const { button, list } = disclosure()
    fireEvent.click(button)
    const first = within(list).getAllByRole("link")[0]
    first.focus()
    fireEvent.keyDown(first, { key: "Escape" })
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(list).not.toBeVisible()
    expect(button).toHaveFocus()
  })

  it("closes on a click outside, and when the focus leaves it", () => {
    render(<><ContentNav audiences={AUDIENCES} /><button type="button">Ailleurs</button></>)
    const { button } = disclosure()
    fireEvent.click(button)
    fireEvent.pointerDown(document.body)
    expect(button).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(button)
    fireEvent.blur(button, { relatedTarget: screen.getByRole("button", { name: "Ailleurs" }) })
    expect(button).toHaveAttribute("aria-expanded", "false")
  })

  // Safari gives no focus to a clicked link: the blur's relatedTarget is null, the click must still land.
  it("stays open when the focus goes nowhere (a click on a link in Safari)", () => {
    render(<ContentNav audiences={AUDIENCES} />)
    const { button } = disclosure()
    fireEvent.click(button)
    fireEvent.blur(button, { relatedTarget: null })
    expect(button).toHaveAttribute("aria-expanded", "true")
  })

  it("closes on Escape with the focus on the button itself", () => {
    render(<ContentNav audiences={AUDIENCES} />)
    const { button } = disclosure()
    fireEvent.click(button)
    button.focus()
    fireEvent.keyDown(button, { key: "Escape" })
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(button).toHaveFocus()
  })

  it("stays open while the focus moves inside it", () => {
    render(<ContentNav audiences={AUDIENCES} />)
    const { button, list } = disclosure()
    fireEvent.click(button)
    fireEvent.blur(button, { relatedTarget: within(list).getAllByRole("link")[0] })
    expect(button).toHaveAttribute("aria-expanded", "true")
  })

  it("marks the current audience page in the list", () => {
    pathname = "/benevoles-festival"
    render(<ContentNav audiences={AUDIENCES} />)
    const button = screen.getByRole("button", { name: /^Pour qui \?/ })
    const list = document.getElementById(button.getAttribute("aria-controls")!)!
    fireEvent.click(button)
    expect(within(list).getByRole("link", { name: "Festivals" })).toHaveAttribute("aria-current", "page")
    expect(within(list).getByRole("link", { name: "Toutes les situations" })).not.toHaveAttribute("aria-current")
    // The button's « current » look said in words too.
    expect(button).toHaveTextContent("rubrique actuelle")
  })

  // #760: another instance has no audience pages, so no entry at all.
  it("shows no « Pour qui ? » entry without audience pages", () => {
    render(<ContentNav audiences={[]} />)
    expect(screen.queryByRole("button", { name: "Pour qui ?" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Pour qui ?" })).toBeNull()
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Fonctionnalités", "Guide administrateur", "Guide bénévole", "Blog"])
  })
})

// The header navigation marks where the visitor is: the page itself, or its section (#944).
describe("ContentNav, current page", () => {
  afterEach(() => {
    cleanup()
    pathname = "/fonctionnalites"
  })

  it("marks /blog as the current page", () => {
    pathname = "/blog"
    render(<ContentNav />)
    const blog = screen.getByRole("link", { name: "Blog" })
    expect(blog).toHaveAttribute("href", "/blog")
    expect(blog).toHaveAttribute("aria-current", "page")
    expect(blog).toHaveAttribute("data-current")
  })

  it("marks Blog as the current section on a post, and nothing else", () => {
    pathname = "/blog/benevol-app-passe-en-2-3"
    render(<ContentNav />)
    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute("aria-current", "true")
    for (const name of ["Fonctionnalités", "Guide administrateur", "Guide bénévole"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current")
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("data-current")
    }
  })

  it("doesn't mark a guide on a documentation unit, which isn't below it", () => {
    pathname = "/doc/s-inscrire"
    render(<ContentNav />)
    expect(screen.getByRole("link", { name: "Guide bénévole" })).not.toHaveAttribute("aria-current")
  })
})
