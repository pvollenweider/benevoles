/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import MakeLeaderModal from "../admin/registrations/MakeLeaderModal"

// #582: the « Rendre responsable » window reads in words: no « inscrit·e » (« inscrit point e »),
// no dash, no asterisk in the field name (« étoile »).
describe("MakeLeaderModal — texts read in words", () => {
  afterEach(cleanup)

  const renderModal = (volunteerEmail: string | null) => render(
    <MakeLeaderModal
      eventId="evt-1"
      volunteerName="Chloé Roy"
      volunteerEmail={volunteerEmail}
      roleOptions={["Bar", "Accueil"]}
      defaultRole="Bar"
      onClose={() => {}}
      onDone={() => {}}
    />,
  )

  it("explains the choice of role and the missing email without « ·e » or a dash", () => {
    renderModal(null)
    expect(screen.getByText("Chloé Roy a des inscriptions sur plusieurs postes : choisissez celui dont cette personne sera responsable.")).toBeInTheDocument()
    expect(screen.getByText("Aucun email enregistré pour cette personne : il en faut un pour lui envoyer son lien de responsable.")).toBeInTheDocument()
    // Each hint describes its field, so it is read with it (#582).
    expect(screen.getByRole("combobox", { name: "Poste" })).toHaveAccessibleDescription("Chloé Roy a des inscriptions sur plusieurs postes : choisissez celui dont cette personne sera responsable.")
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAccessibleDescription("Aucun email enregistré pour cette personne : il en faut un pour lui envoyer son lien de responsable.")
    const dialog = screen.getByRole("dialog")
    expect(dialog.textContent).not.toMatch(/[·–—]/)
  })

  it("names the email field without its asterisk, and marks it required", () => {
    renderModal("chloe@x.ch")
    const email = screen.getByRole("textbox", { name: "Email" })
    expect(email).toBeRequired()
    expect(document.querySelector(`label[for="${email.id}"]`)).toHaveTextContent("Email *")
    // With an email on file there is no hint: nothing describes the field.
    expect(email).not.toHaveAttribute("aria-describedby")
  })

  it("keeps the missing-email hint in the description when the email is invalid", () => {
    renderModal(null)
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    const email = screen.getByRole("textbox", { name: "Email" })
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email).toHaveAccessibleDescription(/il en faut un pour lui envoyer son lien de responsable\..*Indiquez une adresse email complète\./)
  })
})
