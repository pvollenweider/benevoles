/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

const signOut = vi.hoisted(() => vi.fn())
vi.mock("next-auth/react", () => ({ signOut }))
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/events" }))

import UserMenu from "../admin/UserMenu"

// The user menu in the admin top bar: account page and sign-out behind the user's name, keyboard
// operable like the other menus (focus into the menu on open, arrows, Escape back to the trigger).

describe("UserMenu", () => {
  beforeEach(() => signOut.mockReset())
  afterEach(cleanup)

  const trigger = () => screen.getByRole("button", { name: /Alice/ })

  it("is closed until the name is activated, then exposes the account link and sign-out", () => {
    render(<UserMenu userName="Alice" isSuperAdmin={false} />)
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("menu")).toBeNull()

    fireEvent.click(trigger())
    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("menu", { name: "Menu du compte" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Mon compte" })).toHaveAttribute("href", "/admin/account")
    expect(screen.getByRole("menuitem", { name: "Se déconnecter" })).toBeInTheDocument()
  })

  it("sends a super admin to their own profile page", () => {
    render(<UserMenu userName="Alice" isSuperAdmin />)
    fireEvent.click(trigger())
    expect(screen.getByRole("menuitem", { name: "Mon compte" })).toHaveAttribute("href", "/super-admin/profile")
  })

  it("moves focus into the menu, cycles with the arrows, and returns to the name on Escape", () => {
    render(<UserMenu userName="Alice" isSuperAdmin={false} />)
    fireEvent.keyDown(trigger(), { key: "ArrowDown" })
    const [account, logout] = screen.getAllByRole("menuitem")
    expect(account).toHaveFocus()

    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(logout).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(account).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowUp" })
    expect(logout).toHaveFocus()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it("signs out back to the login page", () => {
    render(<UserMenu userName="Alice" isSuperAdmin={false} />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole("menuitem", { name: "Se déconnecter" }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/admin/login" })
  })

  // Regression: on iOS Safari a tapped button does not take focus, so tapping « Se déconnecter »
  // blurred « Mon compte » with no relatedTarget; the menu closed before the click and sign-out
  // never ran (mobile only).
  it("signs out when the item is tapped without taking focus (iOS)", () => {
    render(<UserMenu userName="Alice" isSuperAdmin={false} />)
    fireEvent.click(trigger())
    const account = screen.getByRole("menuitem", { name: "Mon compte" })
    const signOutItem = screen.getByRole("menuitem", { name: "Se déconnecter" })
    fireEvent.pointerDown(signOutItem)
    fireEvent.blur(account, { relatedTarget: null })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.click(signOutItem)
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/admin/login" })
  })

  it("still closes when focus moves to an element outside the menu", () => {
    render(<><UserMenu userName="Alice" isSuperAdmin={false} /><button>Ailleurs</button></>)
    fireEvent.click(trigger())
    const outside = screen.getByRole("button", { name: "Ailleurs" })
    fireEvent.blur(screen.getByRole("menuitem", { name: "Mon compte" }), { relatedTarget: outside })
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("stays open when Shift+Tab moves focus back to the trigger", () => {
    render(<UserMenu userName="Alice" isSuperAdmin={false} />)
    fireEvent.click(trigger())
    fireEvent.blur(screen.getByRole("menuitem", { name: "Mon compte" }), { relatedTarget: trigger() })
    expect(screen.getByRole("menu")).toBeInTheDocument()
  })

  it("closes on a tap outside", () => {
    render(<UserMenu userName="Alice" isSuperAdmin={false} />)
    fireEvent.click(trigger())
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
