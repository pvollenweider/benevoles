/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({ usePathname: () => "/super-admin/health" }))

import SuperAdminMenu, { superAdminItemLabel } from "../admin/SuperAdminMenu"

// The « Super Admin » menu in the admin top bar, aligned with UserMenu (#589, #590): it closes on
// a tap outside (pointerdown, not mousedown, which a tablet does not fire on non-clickable
// content) and when focus moves out of it, but not when a tapped item blurs the focused one with
// no new target (Safari does not focus a tapped link).

describe("SuperAdminMenu", () => {
  afterEach(cleanup)

  const trigger = () => screen.getByRole("button", { name: "Super Admin" })

  it("exposes aria-expanded, and aria-controls only while the menu is open", () => {
    render(<SuperAdminMenu />)
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    expect(trigger()).not.toHaveAttribute("aria-controls")
    expect(screen.queryByRole("menu")).toBeNull()

    fireEvent.click(trigger())
    const menu = screen.getByRole("menu", { name: "Menu super admin" })
    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    expect(trigger()).toHaveAttribute("aria-controls", menu.id)

    fireEvent.click(trigger())
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    expect(trigger()).not.toHaveAttribute("aria-controls")
  })

  it("lists the destinations and marks the current page", () => {
    render(<SuperAdminMenu />)
    fireEvent.click(trigger())
    expect(screen.getByRole("menuitem", { name: "Organisations" })).toHaveAttribute("href", "/super-admin/organizations")
    expect(screen.getByRole("menuitem", { name: "Organisations" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("menuitem", { name: "Santé du service" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("menuitem", { name: "Communications admin" })).not.toHaveAttribute("aria-current")
  })

  it("moves focus into the menu, cycles with the arrows, and returns to the trigger on Escape", () => {
    render(<SuperAdminMenu />)
    fireEvent.keyDown(trigger(), { key: "ArrowDown" })
    const [orgs, stats, blocklist, journal, health, updates, videoFeedback] = screen.getAllByRole("menuitem")
    expect(orgs).toHaveFocus()

    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(stats).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(blocklist).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(journal).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(health).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(updates).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(videoFeedback).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(orgs).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowUp" })
    expect(videoFeedback).toHaveFocus()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it("closes on a tap outside", () => {
    render(<SuperAdminMenu />)
    fireEvent.click(trigger())
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
  })

  it("stays open on a pointerdown inside the menu or on the trigger", () => {
    render(<SuperAdminMenu />)
    fireEvent.click(trigger())
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Organisations" }))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.pointerDown(trigger())
    expect(screen.getByRole("menu")).toBeInTheDocument()
  })

  it("closes when focus moves to an element outside the menu (Tab past the last item)", () => {
    render(<><SuperAdminMenu /><button type="button">Ailleurs</button></>)
    fireEvent.click(trigger())
    const outside = screen.getByRole("button", { name: "Ailleurs" })
    fireEvent.blur(screen.getByRole("menuitem", { name: "Communications admin" }), { relatedTarget: outside })
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("stays open when focus moves inside the menu, or back to the trigger with Shift+Tab", () => {
    render(<SuperAdminMenu />)
    fireEvent.click(trigger())
    const orgs = screen.getByRole("menuitem", { name: "Organisations" })
    fireEvent.blur(orgs, { relatedTarget: screen.getByRole("menuitem", { name: "Santé du service" }) })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.blur(orgs, { relatedTarget: trigger() })
    expect(screen.getByRole("menu")).toBeInTheDocument()
  })

  // Safari does not focus a tapped link: tapping an item blurs the focused first item with no
  // relatedTarget. The menu must stay open so the tap reaches the item, which closes it.
  it("lets a tapped item act when the tap blurs the focused item without a new target", () => {
    render(<SuperAdminMenu />)
    fireEvent.click(trigger())
    const orgs = screen.getByRole("menuitem", { name: "Organisations" })
    const updates = screen.getByRole("menuitem", { name: "Communications admin" })
    fireEvent.pointerDown(updates)
    fireEvent.blur(orgs, { relatedTarget: null })
    expect(screen.getByRole("menu")).toBeInTheDocument()

    let clicked = false
    updates.addEventListener("click", (e) => { clicked = true; e.preventDefault() })
    fireEvent.click(updates)
    expect(clicked).toBe(true)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  // #810: the spaces awaiting validation, on the trigger and on « Organisations ».
  it("shows how many spaces wait for a validation", () => {
    render(<SuperAdminMenu pendingSpaces={2} />)
    const button = screen.getByRole("button", { name: "Super Admin 2 espaces en attente" })
    fireEvent.click(button)
    expect(screen.getByRole("menuitem", { name: "Organisations (2 en attente)" })).toBeInTheDocument()
    cleanup()
    render(<SuperAdminMenu pendingSpaces={1} />)
    expect(screen.getByRole("button", { name: "Super Admin 1 espace en attente" })).toBeInTheDocument()
    cleanup()
    render(<SuperAdminMenu pendingSpaces={0} />)
    fireEvent.click(screen.getByRole("button", { name: "Super Admin" }))
    expect(screen.getByRole("menuitem", { name: "Organisations" })).toBeInTheDocument()
    expect(superAdminItemLabel({ href: "/super-admin/stats", label: "Statistiques" }, 2)).toBe("Statistiques")
    expect(superAdminItemLabel({ href: "/super-admin/organizations", label: "Organisations" }, 0)).toBe("Organisations")
  })
})
