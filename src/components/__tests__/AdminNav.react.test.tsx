/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }))
let pathname = "/admin/members"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))

import AdminNav from "../admin/AdminNav"

// Admin top bar on small screens (#361): the links sit behind a "Menu" disclosure. jsdom doesn't
// apply the md: breakpoint (the Playwright spec checks the layout); this checks the behavior.

describe("AdminNav — mobile menu", () => {
  afterEach(cleanup)

  const toggle = () => screen.getByRole("button", { name: "Menu" })
  const panel = () => document.getElementById(toggle().getAttribute("aria-controls")!)!

  it("is a closed disclosure until opened, then lists every destination", () => {
    render(<AdminNav userName="Alice" role="admin" orgName="Festival" />)
    expect(toggle()).toHaveAttribute("aria-expanded", "false")
    expect(panel()).not.toBeVisible()

    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute("aria-expanded", "true")
    expect(panel()).toBeVisible()
    const links = within(panel()).getAllByRole("link").map((a) => a.textContent)
    expect(links).toEqual(["Tableau de bord", "Événements", "Membres", "Paramètres", "Aide (ouvre dans un nouvel onglet)"])
  })

  it("marks the current page", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    fireEvent.click(toggle())
    expect(within(panel()).getByRole("link", { name: "Membres" })).toHaveAttribute("aria-current", "page")
    expect(within(panel()).getByRole("link", { name: "Événements" })).not.toHaveAttribute("aria-current")
  })

  it("adds the super-admin destinations for a super admin", () => {
    render(<AdminNav userName="Root" role="super_admin" />)
    fireEvent.click(toggle())
    expect(within(panel()).getByRole("link", { name: /Organisations/ })).toHaveAttribute("href", "/super-admin/organizations")
    expect(within(panel()).getByRole("link", { name: /Communications admin/ })).toBeInTheDocument()
  })

  it("closes on Escape, back on the button, and after following a link", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    fireEvent.click(toggle())
    // A real click focuses the button; jsdom's fireEvent doesn't. Focus a panel link, as a
    // keyboard user would after tabbing in.
    within(panel()).getByRole("link", { name: "Membres" }).focus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(toggle()).toHaveAttribute("aria-expanded", "false")
    expect(toggle()).toHaveFocus()

    fireEvent.click(toggle())
    fireEvent.click(within(panel()).getByRole("link", { name: "Événements" }))
    expect(toggle()).toHaveAttribute("aria-expanded", "false")
  })

  it("ignores a synthetic keydown without a key (password managers, autofill)", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    // A KeyboardEvent built without `key` has key === "", but some extensions set it undefined.
    const evt = new KeyboardEvent("keydown", { bubbles: true, ctrlKey: true })
    Object.defineProperty(evt, "key", { value: undefined })
    expect(() => document.dispatchEvent(evt)).not.toThrow()
  })

  it("keeps the user menu reachable next to it", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    expect(screen.getByRole("button", { name: /Alice/ })).toBeInTheDocument()
  })

  it("an Escape with focus elsewhere closes the panel without taking focus", () => {
    render(<><AdminNav userName="Alice" role="admin" /><button>ailleurs</button></>)
    fireEvent.click(toggle())
    const elsewhere = screen.getByRole("button", { name: "ailleurs" })
    elsewhere.focus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(toggle()).toHaveAttribute("aria-expanded", "false")
    expect(elsewhere).toHaveFocus()
  })

  it("following the current page's link puts focus back on the toggle", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    fireEvent.click(toggle())
    fireEvent.click(within(panel()).getByRole("link", { name: "Membres" }))
    expect(toggle()).toHaveFocus()
  })
})

// Global search (#377): a search form in the bar (in the panel below md), Ctrl+K / ⌘K to reach it.
describe("AdminNav — search", () => {
  afterEach(() => {
    cleanup()
    pathname = "/admin/members"
  })

  const fields = () => screen.getAllByRole("searchbox", { name: "Rechercher un bénévole, un événement ou un poste", hidden: true })

  it("submits q to the search page", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    expect(fields()).toHaveLength(2)
    for (const input of fields()) {
      expect(input).toHaveAttribute("name", "q")
      expect(input.closest("form")).toHaveAttribute("action", "/admin/search")
      expect(input.closest("form")).toHaveAttribute("role", "search")
    }
    expect(screen.getAllByRole("button", { name: "Rechercher", hidden: true })).toHaveLength(2)
  })

  it("Ctrl+K and ⌘K focus the bar's field when it's shown", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    const desktop = document.getElementById("admin-search")!
    // jsdom has no layout: offsetParent is null for every element unless faked.
    Object.defineProperty(desktop, "offsetParent", { get: () => document.body })
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(desktop).toHaveFocus()
    desktop.blur()
    fireEvent.keyDown(document.body, { key: "k", metaKey: true })
    expect(desktop).toHaveFocus()
  })

  it("Ctrl+K opens the menu and focuses its field on a small screen", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById("admin-search-mobile")).toHaveFocus()
  })

  it("single keys don't move focus (WCAG 2.1.4)", () => {
    render(<AdminNav userName="Alice" role="admin" />)
    fireEvent.keyDown(document.body, { key: "k" })
    fireEvent.keyDown(document.body, { key: "/" })
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false")
    expect(document.body).toHaveFocus()
  })

  it("on the search page, no second form in the bar; Ctrl+K goes to the page's field", () => {
    pathname = "/admin/search"
    render(<><AdminNav userName="Alice" role="admin" /><input id="search-page-q" type="search" aria-label="page" /></>)
    expect(document.getElementById("admin-search")).toBeNull()
    expect(document.getElementById("admin-search-mobile")).toBeNull()
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(screen.getByRole("searchbox", { name: "page" })).toHaveFocus()
  })
})
