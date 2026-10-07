/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import ReleaseNotes from "../ReleaseNotes"
import type { RenderedRelease } from "@/lib/public-content"

const RELEASES: RenderedRelease[] = [
  { version: "2.1.0", date: "2026-10-06", dateLabel: "6 octobre 2026", introHtml: "", sections: [{ title: "Ajouté", html: "<ul><li>Une nouveauté</li></ul>" }] },
  { version: "1.0.0-beta.1", date: "2026-04-24", dateLabel: "24 avril 2026", introHtml: "<p>Première version.</p>", sections: [] },
]

// /nouveautes (#757): one <h1>, the versions' list, then each version under its anchored <h2>.
describe("ReleaseNotes", () => {
  afterEach(cleanup)

  it("lists every version, each linked to its anchored heading with its date", () => {
    render(<ReleaseNotes releases={RELEASES} fullChangelogUrl="https://example.org/CHANGELOG.md" />)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    const nav = screen.getByRole("navigation", { name: "Toutes les versions" })
    expect(within(nav).getByRole("link", { name: "Version 2.1.0" })).toHaveAttribute("href", "#2.1.0")
    expect(within(nav).getByRole("link", { name: "Version 1.0.0-beta.1" })).toHaveAttribute("href", "#1.0.0-beta.1")
    const heading = screen.getByRole("heading", { level: 2, name: "Version 2.1.0" })
    expect(heading).toHaveAttribute("id", "2.1.0")
    expect(document.querySelector('time[datetime="2026-10-06"]')).toHaveTextContent("6 octobre 2026")
    expect(screen.getByRole("heading", { level: 3, name: "Ajouté" })).toBeInTheDocument()
    expect(screen.getByText("Une nouveauté")).toBeInTheDocument()
    expect(screen.getByText("Première version.")).toBeInTheDocument()
  })

  it("links the full changelog, features and documentation", () => {
    render(<ReleaseNotes releases={RELEASES} fullChangelogUrl="https://example.org/CHANGELOG.md" />)
    expect(screen.getByRole("link", { name: "journal complet des versions sur GitHub" })).toHaveAttribute("href", "https://example.org/CHANGELOG.md")
    expect(screen.getByRole("link", { name: "fonctionnalités" })).toHaveAttribute("href", "/fonctionnalites")
    expect(screen.getByRole("link", { name: "documentation" })).toHaveAttribute("href", "/doc")
  })

  it("says so when there is no released version, without an empty list", () => {
    render(<ReleaseNotes releases={[]} fullChangelogUrl="https://example.org/CHANGELOG.md" />)
    expect(screen.getByText("Aucune version publiée pour le moment.")).toBeInTheDocument()
    expect(screen.queryByRole("navigation")).toBeNull()
  })
})
