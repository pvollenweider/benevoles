/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"

import EventShareLink, { COPIED, COPY_FAILED, SHARED, SHARE_FAILED } from "../admin/EventShareLink"

// Copy and share the public link of an event (#564).
const URL = "https://fete.benevol.app/fete-2031"

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
  }
}

describe("EventShareLink", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    setNavigator({ share: undefined, clipboard: undefined })
  })

  it("shows the public link and copies it, with a visible and announced confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } })
    render(<EventShareLink url={URL} />)
    expect(screen.getByText(URL).tagName).toBe("SPAN")
    expect(screen.queryByRole("link")).toBeNull()
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("")
    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }))
    await waitFor(() => expect(status).toHaveTextContent(COPIED))
    expect(writeText).toHaveBeenCalledWith(URL)
    expect(status).not.toHaveClass("sr-only")
  })

  it("selects the link and says so when the clipboard refuses", async () => {
    setNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
    render(<EventShareLink url={URL} />)
    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(COPY_FAILED))
    expect(window.getSelection()?.toString()).toBe(URL)
  })

  it("hides « Partager » without a native share sheet", () => {
    render(<EventShareLink url={URL} />)
    expect(screen.queryByRole("button", { name: "Partager" })).toBeNull()
  })

  it("never renders « Partager » on the server, so hydration agrees", () => {
    setNavigator({ share: vi.fn() })
    expect(renderToString(<EventShareLink url={URL} />)).not.toContain("Partager")
  })

  it("shares the public URL only, and announces it", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share })
    render(<EventShareLink url={URL} />)
    fireEvent.click(screen.getByRole("button", { name: "Partager" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(SHARED))
    expect(share).toHaveBeenCalledWith({ url: URL })
  })

  it("stays silent when the share sheet is closed, and reports a real failure", async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException("closed", "AbortError")).mockRejectedValueOnce(new Error("boom"))
    setNavigator({ share })
    render(<EventShareLink url={URL} />)
    const button = screen.getByRole("button", { name: "Partager" })
    fireEvent.click(button)
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("status")).toHaveTextContent("")
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(SHARE_FAILED))
    expect(screen.getByRole("status")).toHaveClass("text-red-800")
    // Closing the sheet after a failure clears the failure too.
    share.mockRejectedValueOnce(new DOMException("closed", "AbortError"))
    fireEvent.click(button)
    await waitFor(() => expect(share).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(""))
    expect(screen.getByRole("status")).toHaveClass("sr-only")
    expect(screen.getByRole("status")).not.toHaveClass("text-red-800")
  })
})
