/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import TooManyAttemptsNotice from "../public/TooManyAttemptsNotice"
import { TOO_MANY_ATTEMPTS_PARAGRAPHS } from "@/lib/too-many-attempts"

// « Réessaie dans une heure » on the pages a personal link opens: one level-1 heading, three paragraphs,
// nothing announced by a live region, nothing to click.

describe("TooManyAttemptsNotice", () => {
  afterEach(cleanup)

  it("is one level-1 heading named « Réessaie dans une heure », then three paragraphs in order", () => {
    const { container } = render(<TooManyAttemptsNotice />)
    expect(screen.getAllByRole("heading")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Réessaie dans une heure" })).toBeInTheDocument()
    const paragraphs = [...container.querySelectorAll("p")]
    expect(paragraphs.map((p) => p.textContent)).toEqual([...TOO_MANY_ATTEMPTS_PARAGRAPHS])
    expect(container.firstElementChild?.tagName).toBe("H1")
  })

  it("has no alert or status role, no live region, no link, no button, nothing focusable", () => {
    const { container } = render(<TooManyAttemptsNotice />)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("list")).toBeNull()
    expect(container.querySelector("[aria-live], [tabindex], [autofocus], img, svg")).toBeNull()
  })

  it("uses gray text only, with no fixed width or unbreakable line", () => {
    const { container } = render(<TooManyAttemptsNotice />)
    const classes = [...container.querySelectorAll("*")].map((el) => el.getAttribute("class") ?? "").join(" ")
    expect(screen.getByRole("heading")).toHaveClass("text-xl", "font-bold", "text-gray-900")
    for (const p of container.querySelectorAll("p")) expect(p).toHaveClass("text-sm", "text-gray-700")
    expect(classes).not.toMatch(/red-|amber-|whitespace-nowrap|\bw-\[|min-w-/)
  })
})
