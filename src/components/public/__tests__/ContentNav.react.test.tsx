/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

const pathname = vi.hoisted(() => ({ current: "/blog" }))
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }))

import ContentNav from "../ContentNav"

// The header navigation marks where the visitor is: the page itself, or its section (#944).
describe("ContentNav", () => {
  afterEach(cleanup)

  it("marks /blog as the current page", () => {
    pathname.current = "/blog"
    render(<ContentNav />)
    const blog = screen.getByRole("link", { name: "Blog" })
    expect(blog).toHaveAttribute("href", "/blog")
    expect(blog).toHaveAttribute("aria-current", "page")
    expect(blog).toHaveAttribute("data-current")
  })

  it("marks Blog as the current section on a post, and nothing else", () => {
    pathname.current = "/blog/benevol-app-passe-en-2-3"
    render(<ContentNav />)
    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute("aria-current", "true")
    for (const name of ["Fonctionnalités", "Guide administrateur", "Guide bénévole"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current")
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("data-current")
    }
  })

  it("doesn't mark a guide on a documentation unit, which isn't below it", () => {
    pathname.current = "/doc/s-inscrire"
    render(<ContentNav />)
    expect(screen.getByRole("link", { name: "Guide bénévole" })).not.toHaveAttribute("aria-current")
  })
})
