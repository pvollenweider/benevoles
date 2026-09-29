/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

import SkipLink, { MAIN_CONTENT_ID } from "../admin/SkipLink"

// Skip link of the admin layout (#389): the first focusable element, pointing at the main landmark.
describe("SkipLink", () => {
  afterEach(cleanup)

  it("is a link to the main content, hidden until focused", () => {
    render(
      <>
        <SkipLink />
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>Contenu</main>
      </>,
    )
    const link = screen.getByRole("link", { name: "Aller au contenu" })
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`)
    expect(link.className).toContain("sr-only")
    expect(link.className).toContain("focus:not-sr-only")
    expect(document.getElementById(MAIN_CONTENT_ID)).toHaveAttribute("tabindex", "-1")
  })
})
