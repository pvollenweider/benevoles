/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import SectorLeadersManager from "../admin/SectorLeadersManager"

// #582: the leaders screen reads in words: no « un·e » (« un point e »), no « · » in the options
// of the native select, no asterisk in the field names (« étoile »).
describe("SectorLeadersManager — names read in words", () => {
  afterEach(cleanup)

  const renderManager = () => render(
    <SectorLeadersManager
      eventId="evt-1"
      roleNames={["Bar", "Accueil"]}
      initialLeaders={[]}
      registeredVolunteers={[
        { id: "v1", name: "Chloé Roy", email: "chloe@x.ch", roleNames: ["Bar", "Accueil"] },
        { id: "v2", name: "Marc Duc", email: "marc@x.ch", roleNames: ["Bar"] },
      ]}
    />,
  )

  it("names the add button without a middle dot", () => {
    renderManager()
    expect(screen.getByRole("button", { name: "+ Ajouter un responsable" })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/·/)
  })

  it("lists the registered volunteers with their roles in brackets", () => {
    renderManager()
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un responsable" }))
    const pick = screen.getByRole("combobox", { name: "Depuis les inscrits (optionnel)" })
    const options = Array.from((pick as HTMLSelectElement).options).map((o) => o.text)
    expect(options).toEqual(["Choisir parmi les bénévoles inscrits…", "Chloé Roy (Bar, Accueil)", "Marc Duc (Bar)"])
    expect(pick).toHaveAccessibleDescription("Remplit le nom, l'email et le poste ci-dessous ; vous pouvez les modifier avant l'ajout.")
  })

  it("names the required fields without their asterisk, and says nothing with a middle dot or a dash", () => {
    renderManager()
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un responsable" }))
    // « Poste » has a list of suggestions (datalist): a combobox.
    for (const [role, label] of [["combobox", "Poste"], ["textbox", "Nom"], ["textbox", "Email"]] as const) {
      const field = screen.getByRole(role, { name: label })
      expect(field).toBeRequired()
      expect(document.querySelector(`label[for="${field.id}"]`)).toHaveTextContent(`${label} *`)
    }
    expect(document.body.textContent).not.toMatch(/[·–—]/)
  })
})
