/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import fs from "node:fs"
import path from "node:path"

// Front-desk access limited to one event (#1142): the pages. A front-desk session renders one
// admin page, its landing page, and nothing of the organisation: no navigation, no data.

const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
const signOut = vi.hoisted(() => vi.fn())
vi.mock("next-auth/react", () => ({ signOut }))
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
  path: null as string | null,
}))
vi.mock("next/navigation", () => ({ redirect: nav.redirect, usePathname: () => "/admin/front-desk" }))
vi.mock("next/headers", () => ({
  headers: async () => new Headers(nav.path ? { "x-benevoles-path": nav.path } : {}),
  cookies: async () => ({ get: () => undefined }),
}))
const prismaTouched = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: (_t, model) => new Proxy({}, { get: (_m, op) => (...args: unknown[]) => { prismaTouched(model, op, args); return Promise.resolve(null) } }) }),
}))
vi.mock("@/components/admin/AdminNav", () => ({ default: () => <nav aria-label="Navigation de l'administration" /> }))
vi.mock("@/components/admin/ChangePasswordForm", () => ({ default: () => <form aria-label="Mot de passe" /> }))
vi.mock("@/components/admin/HelpLink", () => ({ default: () => null }))

import FrontDeskPage, { metadata } from "@/app/admin/front-desk/page"
import AdminLayout from "@/app/admin/layout"
import AccountPage from "@/app/admin/account/page"

const colette = { user: { id: "adm-colette", name: "Colette Favre", email: "colette.favre@example.org", role: "front_desk", organizationId: "org-fete" } }
const sami = { user: { id: "adm-sami", name: "Sami Haddad", email: "sami.haddad@example.org", role: "organizer", organizationId: "org-fete" } }

beforeEach(() => {
  vi.clearAllMocks()
  nav.path = null
  auth.mockResolvedValue(colette)
})
afterEach(cleanup)

describe("/admin/front-desk", () => {
  it("has its own title and is not indexed", () => {
    expect(metadata).toEqual({ title: "Accès accueil", robots: { index: false, follow: false } })
  })

  it("says the access is ready and offers to sign out: one main landmark, one heading, one paragraph, one button", async () => {
    const { container } = render(await FrontDeskPage())
    expect(screen.getAllByRole("main")).toHaveLength(1)
    expect(screen.getAllByRole("heading")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Accès accueil" })).toBeInTheDocument()
    const sentence = screen.getByText("Votre accès accueil est prêt. L'écran de pointage arrive avec une prochaine version.")
    expect(sentence.tagName).toBe("P")
    expect(container.querySelectorAll("p")).toHaveLength(1)
    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName("Se déconnecter")
    expect(buttons[0].tagName).toBe("BUTTON")
    expect(buttons[0]).toHaveAttribute("type", "button")
  })

  it("shows nothing else: no navigation, no link, no form field, no name, email or organisation", async () => {
    const { container } = render(await FrontDeskPage())
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.queryAllByRole("link")).toEqual([])
    expect(container.querySelectorAll("a, input, select, textarea, form, img")).toHaveLength(0)
    expect(container.textContent).toBe("Accès accueilVotre accès accueil est prêt. L'écran de pointage arrive avec une prochaine version.Se déconnecter")
    expect(prismaTouched).not.toHaveBeenCalled()
  })

  it("signs out the way the admin's user menu does", async () => {
    render(await FrontDeskPage())
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/admin/login" })
    // One definition for both (src/components/admin/sign-out.ts).
    const src = path.join(__dirname, "..", "components", "admin")
    for (const file of ["UserMenu.tsx", "SignOutButton.tsx"]) {
      const source = fs.readFileSync(path.join(src, file), "utf-8")
      expect(source, file).toContain("signOutOfAdmin()")
      expect(source, file).not.toContain("next-auth/react")
    }
  })

  it("is for front-desk accounts: anyone else is sent to the admin, a signed-out visitor to the login page", async () => {
    auth.mockResolvedValue(sami)
    await expect(FrontDeskPage()).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard")
    auth.mockResolvedValue({ user: { id: "sa", role: "super_admin", organizationId: null } })
    await expect(FrontDeskPage()).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard")
    auth.mockResolvedValue(null)
    await expect(FrontDeskPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
  })

  it("has no dark-theme class (admin screens have no dark theme) and keeps the global focus outline", () => {
    const root = path.join(__dirname, "..")
    for (const file of ["app/admin/front-desk/page.tsx", "components/admin/SignOutButton.tsx"]) {
      const source = fs.readFileSync(path.join(root, file), "utf-8")
      expect(source, file).not.toMatch(/\bdark:/)
      // No utility that would remove the outline the global styles give a focused button.
      expect(source, file).not.toMatch(/outline-none|focus:outline-0|focus-visible:outline-0/)
    }
  })
})

describe("admin layout as a front-desk account", () => {
  it("renders the page alone: no navigation, no skip link, no organisation read", async () => {
    nav.path = "/admin/front-desk"
    render(await AdminLayout({ children: <p>contenu</p> }))
    expect(screen.getByText("contenu")).toBeInTheDocument()
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.queryByRole("main")).toBeNull()
    expect(screen.queryAllByRole("link")).toEqual([])
    expect(prismaTouched).not.toHaveBeenCalled()
  })

  it("with the landing page inside: exactly one main landmark and one heading on the whole screen", async () => {
    nav.path = "/admin/front-desk"
    render(await AdminLayout({ children: await FrontDeskPage() }))
    expect(screen.getAllByRole("main")).toHaveLength(1)
    expect(screen.getAllByRole("heading")).toHaveLength(1)
    expect(screen.queryByRole("navigation")).toBeNull()
  })

  it.each(["/admin/dashboard", "/admin/events", "/admin/events/evt-1/day-of", "/admin/members", "/admin/settings/admins", "/admin/account", "/admin/search?q=rochat"])("refuses %s: sent to the landing page, nothing read", async (page) => {
    nav.path = page
    await expect(AdminLayout({ children: <p>contenu</p> })).rejects.toThrow("NEXT_REDIRECT:/admin/front-desk")
    expect(prismaTouched).not.toHaveBeenCalled()
  })

  it("a session-less page (the login page, a link from an email) is left alone, still without navigation", async () => {
    for (const page of ["/admin/login", "/admin/reset-password", "/admin/keep"]) {
      cleanup()
      nav.path = page
      render(await AdminLayout({ children: <p>contenu</p> }))
      expect(screen.queryByRole("navigation")).toBeNull()
    }
    expect(nav.redirect).not.toHaveBeenCalled()
  })

  it("still gives an organiser the navigation and the organisation's name", async () => {
    auth.mockResolvedValue(sami)
    nav.path = "/admin/events"
    render(await AdminLayout({ children: <p>contenu</p> }))
    expect(screen.getByRole("navigation", { name: "Navigation de l'administration" })).toBeInTheDocument()
    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(prismaTouched).toHaveBeenCalled()
  })
})

describe("account page as a front-desk account", () => {
  it("is refused: sent to the landing page", async () => {
    await expect(AccountPage()).rejects.toThrow("NEXT_REDIRECT:/admin/front-desk")
  })

  it("a role that is no admin level has no account page either", async () => {
    auth.mockResolvedValue({ user: { id: "x", name: "X", email: "x@example.org", role: "volunteer", organizationId: "org-fete" } })
    await expect(AccountPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
  })

  it("still opens for an owner and an organiser", async () => {
    for (const role of ["admin", "organizer"]) {
      cleanup()
      auth.mockResolvedValue({ user: { ...sami.user, role } })
      render(await AccountPage())
      expect(screen.getByRole("heading", { level: 1, name: "Mon compte" })).toBeInTheDocument()
    }
  })
})
