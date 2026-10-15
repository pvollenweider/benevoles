/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AddMemberModal } from "@/components/admin/members/MemberFormModals"
import ImportModal from "@/components/admin/members/ImportModal"
import { MEMBER_TAGS_HINT } from "@/lib/role-reservation"

afterEach(cleanup)

describe("member forms", () => {
  // #1003: the name was « Prénom * (obligatoire) », read « étoile » then « obligatoire » twice.
  it("names required fields without the asterisk, required by their state, and explains « Étiquettes »", () => {
    render(<AddMemberModal onClose={() => {}} onCreated={() => {}} />)
    const first = screen.getByRole("textbox", { name: "Prénom" })
    expect(first).toBeRequired()
    expect(screen.getByRole("textbox", { name: "Nom" })).toBeRequired()
    expect(screen.getByRole("textbox", { name: "Email" })).not.toBeRequired()
    expect(document.body.textContent).not.toContain("(obligatoire)")
    const tags = screen.getByRole("textbox", { name: "Étiquettes (séparées par des virgules)" })
    expect(tags).toHaveAccessibleDescription(MEMBER_TAGS_HINT)
    expect(document.body.textContent).not.toMatch(/\bTags\b/)
  })
})

describe("members import", () => {
  // The browser's own file button said « Choose File / No file chosen », in English.
  it("chooses the file with a French button and says which file was chosen", () => {
    render(<ImportModal onClose={() => {}} onImported={() => {}} />)
    const input = screen.getByLabelText("Choisir un fichier CSV ou Excel")
    expect(input).toHaveAttribute("type", "file")
    expect(input).toHaveClass("sr-only")
    expect(input).toHaveAccessibleDescription(/^Aucun fichier choisi/)
    fireEvent.change(input, { target: { files: [new File(["email\na@example.com"], "membres.csv", { type: "text/csv" })] } })
    expect(input).toHaveAccessibleDescription(/^membres\.csv/)
    expect(screen.getByText("membres.csv")).toHaveAttribute("aria-live", "polite")
    expect(screen.getByText(/Colonnes attendues/)).toHaveTextContent("étiquettes (ou « tags »)")
  })
})
