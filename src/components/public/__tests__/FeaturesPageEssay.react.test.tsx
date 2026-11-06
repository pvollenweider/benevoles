/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import FeaturesPage, { ESSAY_PROSE_CLASS, FEATURES_PROSE_CLASS } from "../FeaturesPage"
import type { RenderedFeaturesPage } from "@/lib/public-content"

// The manifesto's essay layout and the editorial pages' opening without media.
const html = (s: string) => ({ kind: "html" as const, html: s })

const page = (stills: RenderedFeaturesPage["intro"]["stills"] = []) => ({
  title: "Pourquoi benevol.app existe",
  intro: {
    parts: [html("<p>Introduction.</p><p><strong>Pourquoi ?</strong></p><blockquote><p>« Une citation. »</p></blockquote>")],
    stills,
    actions: [],
  },
  sections: [
    { id: "poser-le-cadre", heading: "Poser le cadre", parts: [html("<blockquote><p>« Le cadre. »</p></blockquote>")], stills: [], actions: [] },
    { id: "aujourd-hui", heading: "Aujourd'hui", parts: [html("<p>Concrètement.</p>")], stills: [], actions: [] },
  ],
}) as unknown as RenderedFeaturesPage

describe("FeaturesPage essay variant (/manifeste)", () => {
  afterEach(cleanup)

  it("reads top to bottom: no « Sur cette page » band, every section heading keeps its anchor", () => {
    render(<FeaturesPage page={page()} eyebrow="Manifeste" variant="essay" />)
    expect(screen.queryByRole("navigation", { name: "Sur cette page" })).toBeNull()
    expect(screen.getByRole("heading", { level: 1, name: "Pourquoi benevol.app existe" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Poser le cadre" })).toHaveAttribute("id", "poser-le-cadre")
    expect(screen.getByRole("heading", { level: 2, name: "Aujourd'hui" })).toHaveAttribute("id", "aujourd-hui")
  })

  it("keeps the quotes as native blockquotes, the questions as bold paragraphs, not headings", () => {
    const { container } = render(<FeaturesPage page={page()} eyebrow="Manifeste" variant="essay" />)
    expect(container.querySelectorAll("blockquote")).toHaveLength(2)
    expect(screen.queryByRole("heading", { name: "Pourquoi ?" })).toBeNull()
    expect(screen.getByText("Pourquoi ?").tagName).toBe("STRONG")
  })

  it("draws a quote as a plain rule on the start side, never the tinted box", () => {
    expect(ESSAY_PROSE_CLASS).toContain("prose-blockquote:border-s-2")
    expect(ESSAY_PROSE_CLASS).toContain("prose-blockquote:not-italic")
    expect(ESSAY_PROSE_CLASS).not.toContain("prose-blockquote:bg-blue-50")
    expect(ESSAY_PROSE_CLASS).not.toContain("prose-blockquote:rounded-xl")
    // The features page keeps its « Bénévole ? » aside as a box.
    expect(FEATURES_PROSE_CLASS).toContain("prose-blockquote:bg-blue-50")
  })
})

describe("FeaturesPage opening", () => {
  afterEach(cleanup)

  it("has no empty column beside the text when there is no still or video", () => {
    const { container } = render(<FeaturesPage page={page()} eyebrow="Tarifs" />)
    const opening = container.querySelector("section > div")!
    expect(opening.className).not.toMatch(/grid-cols/)
    expect(opening.children).toHaveLength(1)
  })

  it("keeps the two columns when a still stands beside the text", () => {
    const still = { src: "/still.png", alt: "Le planning", width: 1600, height: 1000 }
    const { container } = render(<FeaturesPage page={page([still] as never)} eyebrow="Fonctionnalités" />)
    const opening = container.querySelector("section > div")!
    expect(opening.className).toMatch(/lg:grid-cols-/)
    expect(opening.children).toHaveLength(2)
  })
})
