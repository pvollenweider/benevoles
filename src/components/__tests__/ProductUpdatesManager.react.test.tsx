/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import ProductUpdatesManager from "../super-admin/ProductUpdatesManager"
import type { ProductUpdateDraft } from "@/lib/product-update-draft"

// « Partir des nouveautés de la version » (#762): fills subject and content, asks before overwriting.
const drafts: ProductUpdateDraft[] = [
  { version: "2.5.0", date: "2026-10-22", dateLabel: "22 octobre 2026", subject: "Nouveautés de benevol.app, version 2.5.0", content: "Voici 2.5.0" },
  { version: "2.4.0", date: "2026-10-16", dateLabel: "16 octobre 2026", subject: "Nouveautés de benevol.app, version 2.4.0", content: "Voici 2.4.0" },
]

const subject = () => screen.getByRole("textbox", { name: /Objet/ })
const content = () => screen.getByRole("textbox", { name: /Contenu/ })

describe("product updates: prefill from a version", () => {
  afterEach(cleanup)

  it("offers the released versions, newest first, without touching the fields", () => {
    render(<ProductUpdatesManager recipientCount={2} initialSends={[]} drafts={drafts} />)
    const select = screen.getByRole("combobox", { name: "Partir des nouveautés de la version" })
    expect(select).toHaveValue("2.5.0")
    expect(select).toHaveAccessibleDescription(/lien vers la page Nouveautés/)
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["2.5.0, 22 octobre 2026", "2.4.0, 16 octobre 2026"])
    fireEvent.change(select, { target: { value: "2.4.0" } })
    expect(subject()).toHaveValue("")
    expect(content()).toHaveValue("")
  })

  it("fills empty fields at once and announces it, focus left on the button", () => {
    render(<ProductUpdatesManager recipientCount={2} initialSends={[]} drafts={drafts} />)
    fireEvent.change(screen.getByRole("combobox", { name: /Partir des nouveautés/ }), { target: { value: "2.4.0" } })
    const button = screen.getByRole("button", { name: "Préremplir" })
    button.focus()
    fireEvent.click(button)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(subject()).toHaveValue("Nouveautés de benevol.app, version 2.4.0")
    expect(content()).toHaveValue("Voici 2.4.0")
    expect(document.activeElement).toBe(button)
  })

  it("asks before replacing a draft; cancel keeps it, confirm replaces it", () => {
    render(<ProductUpdatesManager recipientCount={2} initialSends={[]} drafts={drafts} />)
    fireEvent.change(subject(), { target: { value: "Mon objet" } })
    fireEvent.click(screen.getByRole("button", { name: "Préremplir" }))
    const dialog = screen.getByRole("dialog", { name: "Remplacer le brouillon par les nouveautés de la version 2.5.0 ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(subject()).toHaveValue("Mon objet")

    fireEvent.click(screen.getByRole("button", { name: "Préremplir" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remplacer le brouillon" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(subject()).toHaveValue("Nouveautés de benevol.app, version 2.5.0")
    expect(content()).toHaveValue("Voici 2.5.0")
  })

  it("shows no picker when no version has been released", () => {
    render(<ProductUpdatesManager recipientCount={2} initialSends={[]} drafts={[]} />)
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Préremplir" })).not.toBeInTheDocument()
  })
})
