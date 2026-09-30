/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import PublicFooter from "../PublicFooter"
import pkg from "../../../package.json"

// Footer (#494): the name, the version and the code on GitHub are one link, with the GitHub mark.
describe("PublicFooter", () => {
  afterEach(cleanup)

  it("joins name and version in the GitHub link, the mark hidden from assistive technologies", () => {
    render(<PublicFooter />)
    const link = screen.getByRole("link", { name: `benevol.app v${pkg.version}, code source sur GitHub (ouvre dans un nouvel onglet)` })
    expect(link).toHaveAttribute("href", "https://github.com/pvollenweider/benevoles")
    expect(link).toHaveAttribute("target", "_blank")
    const mark = link.querySelector("svg")
    expect(mark).toHaveAttribute("aria-hidden", "true")
    expect(mark).toHaveAttribute("focusable", "false")
    // No separate version text left beside it.
    expect(screen.getAllByText(new RegExp(`v${pkg.version.replace(/\./g, "\\.")}`))).toHaveLength(1)
  })
})
