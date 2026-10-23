/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

vi.mock("next/navigation", () => ({ usePathname: () => "/videos" }))

import ContentShell from "../ContentShell"
import VideosLayout from "@/app/videos/layout"
import LegalLayout from "@/app/legal/layout"
import DocLayout from "@/app/doc/layout"
import BlogLayout from "@/app/blog/layout"
import FeaturesLayout from "@/app/fonctionnalites/layout"
import ReleaseNotesLayout from "@/app/nouveautes/layout"
import AccessibilityLayout from "@/app/accessibilite/layout"
import * as videosLayout from "@/app/videos/layout"
import * as legalLayout from "@/app/legal/layout"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"

// #1116: every public content page draws the same site header (brand, content navigation with
// « Pour qui ? », theme toggle) and the same footer, from ContentShell only, so they cannot drift.
const LAYOUTS = {
  "/videos, /videos/[id]": VideosLayout,
  "/legal/*": LegalLayout,
  "/doc": DocLayout,
  "/blog": BlogLayout,
  "/fonctionnalites": FeaturesLayout,
  "/nouveautes": ReleaseNotesLayout,
  "/accessibilite": AccessibilityLayout,
} as const

// The theme toggle reads the system preference; jsdom has no matchMedia.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never
})

function frame(Layout: (props: { children: React.ReactNode }) => React.ReactNode) {
  // A layout that draws its own <main> (doc, features) gets one from its page; give it one here.
  const own = Layout === DocLayout || Layout === FeaturesLayout
  const { container } = render(<Layout>{own ? <main id="main"><h1>Titre</h1></main> : <h1>Titre</h1>}</Layout>)
  const banner = screen.getByRole("banner")
  const footer = screen.getByRole("contentinfo")
  return { banner: withoutReactIds(banner.outerHTML), footer: withoutReactIds(footer.outerHTML), root: container.firstElementChild as HTMLElement }
}

/** useId values differ from one render to the next; the markup around them must not. */
function withoutReactIds(html: string): string {
  return html.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "<id>")
}

describe("one site header and footer for every public content page", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it.each(Object.entries(LAYOUTS))("%s renders ContentShell's header and footer, theme toggle included", (_, Layout) => {
    vi.stubEnv("HOSTED_SERVICE", "true")
    const reference = frame(ContentShell)
    cleanup()
    const page = frame(Layout)
    expect(page.banner).toBe(reference.banner)
    expect(page.footer).toBe(reference.footer)

    const banner = screen.getByRole("banner")
    expect(within(banner).getByRole("link", { name: "benevol.app" })).toHaveAttribute("href", "/")
    expect(within(banner).getByRole("navigation", { name: "Présentation, guides et blog" })).toBeInTheDocument()
    expect(within(banner).getByRole("button", { name: /^Pour qui \?/ })).toBeInTheDocument()
    expect(within(banner).getByRole("button", { name: "Thème sombre" })).toHaveAttribute("aria-pressed", "false")
    // The dark theme is scoped to the frame's root, set by its inline script, never on <html>.
    expect(page.root).toHaveAttribute("data-theme-scope")
    expect(page.root.querySelector(":scope > script")?.textContent).toContain('localStorage.getItem("doc-theme")')
    expect(document.documentElement).not.toHaveClass("dark")
    // One main, the skip link's target, with the footer after it.
    const main = screen.getByRole("main")
    expect(main).toHaveAttribute("id", "main")
    expect(main.contains(screen.getByRole("contentinfo"))).toBe(false)
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveAttribute("href", "#main")
  })

  // The browser bar follows the header's colour in both themes, as on the other content pages.
  it("gives the video and legal pages the content pages' theme colour", () => {
    expect((videosLayout as { viewport?: unknown }).viewport).toBe(CONTENT_VIEWPORT)
    expect((legalLayout as { viewport?: unknown }).viewport).toBe(CONTENT_VIEWPORT)
  })

  // /videos/[id] and each /legal/* page inherit the frame: no nested layout may replace it.
  it("has no nested layout under /videos or /legal", () => {
    const nested: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__") walk(path)
        } else if (/^layout\.(t|j)sx?$/.test(name) && dir !== join("src/app/videos") && dir !== join("src/app/legal")) {
          nested.push(path)
        }
      }
    }
    for (const root of ["src/app/videos", "src/app/legal"]) {
      expect(existsSync(join(root, "layout.tsx"))).toBe(true)
      walk(root)
    }
    expect(nested).toEqual([])
  })
})
