/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

// #760: an instance that is not the hosted service has its own short home, not the marketing one
// (which describes the hosted service: its hosting, its price, its support appeal).
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/prisma", () => ({ prisma: { platformSetting: { findUnique: async () => null } } }))
// The page reads the video media base for the landing's phone (#765): no validated env here.
vi.mock("@/lib/env", () => ({ env: {} }))

describe("home of another instance (#760)", () => {
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.resetModules() })

  it("names the instance, links to its spaces, and its footer leads to the operator page", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://benevoles.example.org")
    vi.stubEnv("SITE_NAME", "Bénévoles du Jura")
    vi.resetModules()
    const { default: HomePage } = await import("@/app/page")
    render(await HomePage())

    expect(screen.getByRole("heading", { level: 1, name: "Bénévoles du Jura" })).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Espace organisateur" })[0]).toHaveAttribute("href", "/admin/login")
    expect(screen.getByRole("link", { name: "Exploitant de cette instance" })).toHaveAttribute("href", "/legal/exploitant")
    expect(screen.queryByText(/OVH|Infomaniak|Soutenir le projet/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/benevol\.app/)
  })
})
