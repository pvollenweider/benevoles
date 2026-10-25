/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react"

const push = vi.fn()
let pathname = "/doc/admin"
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }))

import ContentShellRoot from "../ContentShellRoot"
import ContentShell from "../ContentShell"

const PAGES = ["/doc", "/doc/admin", "/fonctionnalites"]

beforeAll(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never
})
beforeEach(() => {
  push.mockReset()
  pathname = "/doc/admin"
  window.history.replaceState(null, "", "/doc/admin")
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

function Prose() {
  return (
    <ContentShellRoot pages={PAGES} className="">
      <main id="main" tabIndex={-1}>
        {/* The rendered Markdown: plain links, as dangerouslySetInnerHTML would give. */}
        <div dangerouslySetInnerHTML={{ __html: '<a href="/doc/creer-son-premier-evenement#etape-2">Créer</a> <a href="#ici">Ici</a> <a href="/blog/feed.xml">Flux</a> <a href="/doc/benevole" target="_blank">Onglet</a>' }} />
        {/* A next/link handles its own click first (preventDefault), as here. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- stands in for a next/link */}
        <a href="/fonctionnalites" onClick={(e) => e.preventDefault()}>Lien Next</a>
      </main>
    </ContentShellRoot>
  )
}

describe("ContentShellRoot: plain links of a content page", () => {
  it("navigates client-side to another content page, fragment kept", () => {
    render(<Prose />)
    const link = screen.getByRole("link", { name: "Créer" })
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
    link.dispatchEvent(event)
    expect(push).toHaveBeenCalledWith("/doc/creer-son-premier-evenement#etape-2")
    expect(event.defaultPrevented).toBe(true)
  })

  it("leaves same-page anchors, files, new tabs and modified clicks to the browser", () => {
    render(<Prose />)
    fireEvent.click(screen.getByRole("link", { name: "Ici" }))
    fireEvent.click(screen.getByRole("link", { name: "Flux" }))
    fireEvent.click(screen.getByRole("link", { name: "Onglet" }))
    fireEvent.click(screen.getByRole("link", { name: "Créer" }), { metaKey: true })
    fireEvent.click(screen.getByRole("link", { name: "Créer" }), { ctrlKey: true })
    expect(push).not.toHaveBeenCalled()
  })

  it("never handles a click a next/link already handled", () => {
    render(<Prose />)
    fireEvent.click(screen.getByRole("link", { name: "Lien Next" }))
    expect(push).not.toHaveBeenCalled()
  })
})

describe("ContentShellRoot: focus after a client navigation", () => {
  it("leaves the focus alone on the first page, then moves it to <main> on the next one", async () => {
    const { rerender } = render(<Prose />)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(document.activeElement).toBe(document.body)

    pathname = "/doc/creer-son-premier-evenement"
    window.history.replaceState(null, "", pathname)
    rerender(<Prose />)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(document.activeElement).toBe(screen.getByRole("main"))
  })

  it("leaves it alone on Back or Forward", async () => {
    const { rerender } = render(<Prose />)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    act(() => (document.activeElement as HTMLElement).blur())
    pathname = "/doc/creer-son-premier-evenement"
    window.history.replaceState(null, "", pathname)
    window.dispatchEvent(new PopStateEvent("popstate"))
    rerender(<Prose />)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(document.activeElement).toBe(document.body)
  })

  it("moves it to the fragment's target, made focusable only while focused", async () => {
    const { rerender } = render(<Prose />)
    pathname = "/doc/creer-son-premier-evenement"
    window.history.replaceState(null, "", `${pathname}#etape-2`)
    rerender(
      <ContentShellRoot pages={PAGES} className="">
        <main id="main" tabIndex={-1}>
          <h2 id="etape-2">Étape 2</h2>
          <button type="button">Ailleurs</button>
        </main>
      </ContentShellRoot>,
    )
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    const heading = screen.getByRole("heading", { name: "Étape 2" })
    expect(document.activeElement).toBe(heading)
    expect(heading).toHaveAttribute("tabindex", "-1")
    act(() => screen.getByRole("button", { name: "Ailleurs" }).focus())
    expect(heading).not.toHaveAttribute("tabindex")
  })
})

describe("ContentShell: theme without a fade on arrival", () => {
  it("fades the colours only while the reader switches the theme", () => {
    localStorage.setItem("doc-theme", "dark")
    const { container } = render(<ContentShell><h1>Titre</h1></ContentShell>)
    const root = container.firstElementChild as HTMLElement
    // Applied on mount (client navigation), with no transition armed.
    expect(root).toHaveClass("dark")
    expect(root.className.split(/\s+/)).not.toContain("transition-colors")
    expect(root).not.toHaveAttribute("data-theme-switching")

    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole("button", { name: "Thème sombre" }))
      expect(root).not.toHaveClass("dark")
      expect(root).toHaveAttribute("data-theme-switching")
      act(() => vi.advanceTimersByTime(250))
      expect(root).not.toHaveAttribute("data-theme-switching")
    } finally {
      vi.useRealTimers()
    }
  })
})
