/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import EventEmbedPanel, { EMBED_COPIED, EMBED_COPY_FAILED } from "../admin/EventEmbedPanel"

// « Intégrer à votre site » (#948): the snippet, its options, copy and preview.

const LINKS = [{ code: "abcd2345", name: "Amicale des pompiers" }]

function setup(groupLinks = LINKS) {
  render(<EventEmbedPanel publicUrl="https://club.benevol.app/fete" eventTitle="Fête du village" eventSlug="fete" groupLinks={groupLinks} />)
  const toggle = screen.getByRole("button", { name: "Code d'intégration" })
  fireEvent.click(toggle)
  return { toggle, code: () => (screen.getByLabelText("Code à coller dans votre site") as HTMLTextAreaElement).value }
}

describe("EventEmbedPanel", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("is closed at first, behind a disclosure button", () => {
    render(<EventEmbedPanel publicUrl="https://club.benevol.app/fete" eventTitle="Fête" eventSlug="fete" groupLinks={[]} />)
    const toggle = screen.getByRole("button", { name: "Code d'intégration" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByLabelText("Code à coller dans votre site")).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("gives an iframe of the embeddable page, fixed height, named for screen readers", () => {
    const { code } = setup()
    expect(code()).toContain(`src="https://club.benevol.app/fete?embed=1"`)
    expect(code()).toContain(`title="Inscription bénévoles – Fête du village"`)
    expect(code()).toContain(`loading="lazy"`)
    expect(code()).toContain(`width="100%"`)
    expect(code()).not.toContain("<script")
  })

  it("embeds a group link's roles when chosen", () => {
    const { code } = setup()
    fireEvent.change(screen.getByLabelText("Postes affichés"), { target: { value: "abcd2345" } })
    expect(code()).toContain(`src="https://club.benevol.app/fete?groupe=abcd2345&amp;embed=1"`)
    expect(code()).toContain(`id="benevol-fete-abcd2345"`)
  })

  it("offers no group choice without group links", () => {
    setup([])
    expect(screen.queryByLabelText("Postes affichés")).not.toBeInTheDocument()
  })

  it("adds the inline listener with the auto-resize", () => {
    const { code } = setup()
    fireEvent.click(screen.getByRole("checkbox", { name: "Ajuster la hauteur automatiquement" }))
    expect(code()).toContain("<script>")
    expect(code()).toContain("benevol:embed-height")
  })

  it("copies the code and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
    const { code } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Copier le code" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(EMBED_COPIED))
    expect(writeText).toHaveBeenCalledWith(code())
  })

  it("selects the code when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Copier le code" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(EMBED_COPY_FAILED))
    expect(screen.getByLabelText("Code à coller dans votre site")).toHaveFocus()
  })

  it("shows a live preview in a named frame", () => {
    setup()
    expect(screen.queryByTitle(/^Aperçu/)).not.toBeInTheDocument()
    const previewButton = screen.getByRole("button", { name: "Aperçu en direct" })
    expect(previewButton).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(previewButton)
    const frame = screen.getByTitle("Aperçu : Inscription bénévoles – Fête du village")
    expect(frame).toHaveAttribute("src", "https://club.benevol.app/fete?embed=1")
    expect(previewButton).toHaveAttribute("aria-expanded", "true")
  })
})
