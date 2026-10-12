/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import { BlogIndex, BlogPostView } from "../Blog"
import type { BlogPost } from "@/lib/blog"

const POSTS: BlogPost[] = [
  { slug: "passe-en-2-3", title: "benevol.app passe en 2.3 : moins de ressaisie", date: "2026-10-12", summary: "Le résumé de la 2.3.", version: "2.3", body: "", source: "blog/2026-10-12-passe-en-2-3.md" },
  { slug: "a-bien-grandi", title: "benevol.app a bien grandi 🌱", date: "2026-09-01", summary: "Le résumé de l'été.", body: "", source: "blog/2026-09-01-a-bien-grandi.md" },
]

// /blog (#944): one <h1>, the posts as a list, each its linked <h2>, its date and its summary.
describe("BlogIndex", () => {
  afterEach(cleanup)

  it("lists the posts in order, each a heading linked to its page, its date in a <time> and its version", () => {
    render(<BlogIndex posts={POSTS} />)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    const items = within(screen.getByRole("list")).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    const first = within(items[0])
    expect(first.getByRole("heading", { level: 2 })).toHaveTextContent(POSTS[0].title)
    expect(first.getByRole("link", { name: POSTS[0].title })).toHaveAttribute("href", "/blog/passe-en-2-3")
    expect(items[0].querySelector('time[datetime="2026-10-12"]')).toHaveTextContent("12 octobre 2026")
    expect(first.getByText("Version 2.3")).toBeInTheDocument()
    expect(first.getByText("Le résumé de la 2.3.")).toBeInTheDocument()
    // The title as sent, emoji included; the first of the month is « 1er ».
    expect(within(items[1]).getByRole("link", { name: "benevol.app a bien grandi 🌱" })).toBeInTheDocument()
    expect(items[1].querySelector("time")).toHaveTextContent("1er septembre 2026")
    expect(within(items[1]).queryByText(/^Version/)).toBeNull()
  })

  it("links the changelog and the feed, and says so when there is no post yet", () => {
    render(<BlogIndex posts={[]} />)
    expect(screen.getByRole("link", { name: "nouveautés" })).toHaveAttribute("href", "/nouveautes")
    expect(screen.getByRole("link", { name: "flux Atom" })).toHaveAttribute("href", "/blog/feed.xml")
    expect(screen.getByText("Aucun article pour le moment.")).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })
})

describe("BlogPostView", () => {
  afterEach(cleanup)

  it("shows the title as the single <h1>, the date, the version, the text and the way back", () => {
    render(<BlogPostView post={POSTS[0]} html="<h2 id='a'>Section</h2><p>Texte</p>" releaseAnchors={["2.3.0"]} />)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(POSTS[0].title)
    expect(document.querySelector('time[datetime="2026-10-12"]')).toHaveTextContent("12 octobre 2026")
    expect(screen.getByText("Version 2.3")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Section" })).toBeInTheDocument()
    const back = screen.getAllByRole("link", { name: /Toutes les nouvelles/ })
    expect(back).toHaveLength(2)
    for (const link of back) expect(link).toHaveAttribute("href", "/blog")
    expect(screen.getByRole("link", { name: "les nouveautés de la version 2.3" })).toHaveAttribute("href", "/nouveautes#2.3.0")
  })

  it("links the whole changelog when the post's version isn't on /nouveautes", () => {
    render(<BlogPostView post={POSTS[1]} html="<p>Texte</p>" releaseAnchors={["2.3.0"]} />)
    expect(screen.getByRole("link", { name: "nouveautés" })).toHaveAttribute("href", "/nouveautes")
    expect(screen.queryByRole("link", { name: /version/ })).toBeNull()
  })
})
