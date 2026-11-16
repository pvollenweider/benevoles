/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import path from "node:path"
import fs from "node:fs"

// Front-desk access limited to one event (#1142): the day-of page of the role, in its own route.
const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
const nav = vi.hoisted(() => ({ redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }) }))
vi.mock("next/navigation", () => ({ redirect: nav.redirect, usePathname: () => "/admin/front-desk/events/evt-fete" }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

type Row = Record<string, unknown>
const fake = vi.hoisted(() => {
  const state = { grant: null as Row | null, event: null as Row | null, calls: [] as string[] }
  const client = {
    adminEventAccess: { findFirst: async () => { state.calls.push("adminEventAccess.findFirst"); return state.grant } },
    event: { findFirst: async () => { state.calls.push("event.findFirst"); return state.event } },
    $extends: () => client,
    then: undefined,
  }
  return { state, client }
})
vi.mock("@/lib/prisma", () => ({ prisma: fake.client }))

import FrontDeskDayOfPage, { generateMetadata } from "@/app/admin/front-desk/events/[id]/page"

const colette = { user: { id: "adm-colette", name: "Colette Favre", email: "colette.favre@example.org", role: "front_desk", organizationId: "org-fete" } }
const sami = { user: { id: "adm-sami", name: "Sami Haddad", email: "sami.haddad@example.org", role: "organizer", organizationId: "org-fete" } }
const params = { params: Promise.resolve({ id: "evt-fete" }) }

const eventFixture = () => ({
  id: "evt-fete", organizationId: "org-fete", title: "Fête du village", publicStatus: "published",
  startDate: new Date("2027-06-14T00:00:00Z"), endDate: new Date("2027-06-14T00:00:00Z"),
  organization: { name: "Fête du village", timeZone: "Europe/Zurich" },
})
const grant = (over: Row = {}) => ({
  id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete", expiresAt: new Date("2027-06-15T04:00:00Z"), revokedAt: null,
  adminUser: { organizationId: "org-fete", isActive: true, role: "front_desk" },
  event: eventFixture(),
  ...over,
})
const event = () => ({
  id: "evt-fete", startDate: new Date("2027-06-14T00:00:00Z"), endDate: new Date("2027-06-14T00:00:00Z"),
  publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  organization: { timeZone: "Europe/Zurich" }, shifts: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  fake.state.calls.length = 0
  fake.state.grant = grant()
  fake.state.event = event()
  auth.mockResolvedValue(colette)
})
afterEach(cleanup)

describe("the front-desk day-of page", () => {
  it("renders the board inside its own main and h1, without AddNeedPanel, HelpLink, sector filter or other admin pages", async () => {
    const { container } = render(await FrontDeskDayOfPage(params))
    expect(screen.getAllByRole("main")).toHaveLength(1)
    const main = screen.getByRole("main")
    expect(main).toHaveAttribute("id", "main")
    expect(main).toHaveAttribute("tabindex", "-1")
    const heading = screen.getByRole("heading", { level: 1, name: "Fête du village" })
    expect(heading).toHaveAttribute("id", "page-heading")
    expect(heading).toHaveAttribute("tabindex", "-1")
    // The organisation and the event as text, a link back to the accesses, and the sign-out button.
    expect(screen.getByText("Fête du village", { selector: "p" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Mes accès" })).toHaveAttribute("href", "/admin/front-desk")
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Ajouter un besoin" })).toBeNull()
    expect(screen.queryByText("Autres pages de l'événement")).toBeNull()
    expect(screen.queryByText(/Secteur/)).toBeNull()
    // Not one link into the admin's event pages.
    expect(container.querySelectorAll('a[href^="/admin/events"]')).toHaveLength(0)
    expect(fake.state.calls).toEqual(["adminEventAccess.findFirst", "event.findFirst"])
  })

  it("its title names the event and it is not indexed", async () => {
    expect(await generateMetadata(params)).toEqual({ title: "Jour J : Fête du village", robots: { index: false, follow: false } })
    fake.state.grant = null
    expect(await generateMetadata(params)).toEqual({ title: "Accès accueil", robots: { index: false, follow: false } })
  })

  it("a signed-out visitor goes to the login page, anyone else to the admin", async () => {
    auth.mockResolvedValue(null)
    await expect(FrontDeskDayOfPage(params)).rejects.toThrow("NEXT_REDIRECT:/admin/login")
    auth.mockResolvedValue(sami)
    await expect(FrontDeskDayOfPage(params)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard")
  })

  it.each([
    ["no grant", null],
    ["a revoked grant", grant({ revokedAt: new Date("2027-06-14T07:00:00Z") })],
    ["an expired grant", grant({ expiresAt: new Date("2026-01-01T00:00:00Z") })],
    ["a grant on another event", grant({ eventId: "evt-marche", event: { ...eventFixture(), id: "evt-marche" } })],
    ["a grant in another organisation", grant({ organizationId: "org-tournoi", adminUser: { organizationId: "org-tournoi", isActive: true, role: "front_desk" }, event: { ...eventFixture(), organizationId: "org-tournoi" } })],
    ["an archived event", grant({ event: { ...eventFixture(), publicStatus: "archived" } })],
    ["an event that is over", grant({ event: { ...eventFixture(), startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-01-01T00:00:00Z") } })],
    ["an inactive account", grant({ adminUser: { organizationId: "org-fete", isActive: false, role: "front_desk" } })],
  ])("sends the person to the landing page for %s, reading no board", async (_label, row) => {
    fake.state.grant = row
    await expect(FrontDeskDayOfPage(params)).rejects.toThrow("NEXT_REDIRECT:/admin/front-desk")
    expect(fake.state.calls).not.toContain("event.findFirst")
  })

  it("reads the granted event only, through the organisation's client", async () => {
    await FrontDeskDayOfPage(params)
    expect(fake.state.calls).toEqual(["adminEventAccess.findFirst", "event.findFirst"])
  })

  it("has no dark theme and never imports the admin event layout", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "app", "admin", "front-desk", "events", "[id]", "page.tsx"), "utf-8")
    expect(source).not.toMatch(/\bdark:/)
    expect(source).not.toContain("getOrgContext")
  })
})
