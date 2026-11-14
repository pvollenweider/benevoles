/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import ReadBeforeLinks from "@/components/ReadBeforeLinks"

afterEach(() => cleanup())

const caisse = { title: "Tenir la caisse", url: "https://asso.example/fete/caisse" }
const parking = { title: "Plan du parking", url: "https://asso.example/fete/parking" }

describe("ReadBeforeLinks (#1324)", () => {
  it("renders nothing without a page", () => {
    const { container } = render(<ReadBeforeLinks pages={[]} label="À lire avant ton créneau" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("puts the whole sentence in the link, so it reads out of its context", () => {
    render(<ReadBeforeLinks pages={[caisse]} label="À lire avant ton créneau" />)
    const link = screen.getByRole("link", { name: "À lire avant ton créneau : Tenir la caisse" })
    expect(link).toHaveAttribute("href", caisse.url)
    expect(link).not.toHaveAttribute("target")
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })

  it("lists several pages, one link each", () => {
    render(<ReadBeforeLinks pages={[caisse, parking]} label="À lire avant ton créneau" />)
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByRole("link", { name: "À lire avant ton créneau : Plan du parking" })).toBeInTheDocument()
  })

  it("uses the page's title alone under a heading that already names the block (leaders)", () => {
    render(<ReadBeforeLinks pages={[caisse]} />)
    expect(screen.getByRole("link", { name: "Tenir la caisse" })).toBeInTheDocument()
  })
})
