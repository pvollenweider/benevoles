/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import type { ActionRecap } from "@/lib/action-recap"

const recap: ActionRecap = { title: "Supprimer « Asso » ?", lines: ["Tout est effacé."], confirmLabel: "Supprimer", danger: true }

// The confirmation dialog of sensitive actions (#379, #380).
describe("ConfirmActionModal", () => {
  afterEach(cleanup)

  it("is an alert dialog for a dangerous action, described by its recap, with Cancel focused first", () => {
    render(<ConfirmActionModal recap={recap} busy={false} onConfirm={() => {}} onCancel={() => {}} />)
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer « Asso » ?" })
    // The (empty) error paragraph is always part of the description (see below), hence the
    // trailing space after the recap's own text.
    expect(dialog).toHaveAccessibleDescription("Tout est effacé. ")
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus()
  })

  it("the error paragraph is always part of the dialog's description, so a failure already there when it (re)opens is read too", () => {
    const { rerender } = render(<ConfirmActionModal recap={recap} busy={false} onConfirm={() => {}} onCancel={() => {}} />)
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer « Asso » ?" })
    expect(dialog).toHaveAccessibleDescription(/Tout est effacé\./)
    rerender(<ConfirmActionModal recap={recap} busy={false} error="Connexion impossible." onConfirm={() => {}} onCancel={() => {}} />)
    expect(dialog).toHaveAccessibleDescription(/Connexion impossible\./)
  })

  it("keeps a failure inside the dialog and offers to retry", () => {
    const onConfirm = vi.fn()
    render(<ConfirmActionModal recap={recap} busy={false} error="Connexion impossible." onConfirm={onConfirm} onCancel={() => {}} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Connexion impossible.")
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("with a challenge, refuses a wrong text, focuses the field, and lets the exact text through", () => {
    const onConfirm = vi.fn()
    render(<ConfirmActionModal recap={recap} busy={false} challenge={{ label: "Tapez l'identifiant « asso »", expected: "asso" }} onConfirm={onConfirm} onCancel={() => {}} />)
    const input = screen.getByRole("textbox", { name: "Tapez l'identifiant « asso »" })
    fireEvent.change(input, { target: { value: "ass" } })
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription(/ne correspond pas à « asso »/)
    fireEvent.change(input, { target: { value: " asso " } })
    expect(input).not.toHaveAttribute("aria-invalid")
    // Enter in the field confirms, like a form.
    fireEvent.submit(input)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("ignores clicks while busy", () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmActionModal recap={recap} busy onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole("button", { name: "En cours…" }))
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
