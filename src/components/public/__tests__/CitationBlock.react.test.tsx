// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import CitationBlock, { CITATION_COPIED, CITATION_COPY_FAILED } from "../CitationBlock"

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
}

describe("CitationBlock (#1323)", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("names the text it copies from the heading above, keeps the focus and announces the result", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CitationBlock text="Une phrase à citer." lang="fr" heading="En une phrase" />)
    const button = screen.getByRole("button", { name: "Copier : En une phrase" })
    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveClass("min-h-11")
    // The status region is mounted before the copy, so the announcement is not a new region.
    expect(screen.getByRole("status")).toHaveTextContent("")
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(CITATION_COPIED))
    expect(writeText).toHaveBeenCalledWith("Une phrase à citer.")
    expect(button).toHaveFocus()
  })

  it("marks an English citation with lang=\"en\" (WCAG 3.1.2)", () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CitationBlock text="A sentence." lang="en" heading="En anglais" />)
    expect(screen.getByText("A sentence.")).toHaveAttribute("lang", "en")
  })

  it("says in words that the copy failed", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")))
    render(<CitationBlock text="Une phrase." lang="fr" heading={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Copier ce texte" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(CITATION_COPY_FAILED))
    // The text is selected, so the copy shortcut is enough for a keyboard user.
    expect(window.getSelection()?.toString()).toBe("Une phrase.")
  })
})
