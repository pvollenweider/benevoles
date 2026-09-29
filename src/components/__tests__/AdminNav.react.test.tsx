/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }))
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/members" }))

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
