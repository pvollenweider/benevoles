/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import SectorLeadersManager from "../admin/SectorLeadersManager"
import { NO_SECTOR_LABEL } from "@/lib/sectors"

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

// #1010: a deleted poste (every shift cancelled) keeps its leaders, marked; a poste typed
// before its shifts exist is not marked.
describe("SectorLeadersManager — leaders of a deleted poste", () => {
  afterEach(cleanup)

  it("marks the group in its heading and describes its Retirer buttons", () => {
    render(
      <SectorLeadersManager
        eventId="evt-1"
        roleNames={["Bar"]}
        deletedPostes={["Vestiaire"]}
        initialLeaders={[
          { id: "l1", roleName: "Bar", name: "Léa", email: "lea@x.ch" },
          { id: "l2", roleName: "Vestiaire", name: "Noé", email: "noe@x.ch" },
          { id: "l3", roleName: "Sécurité", name: "Marc", email: "marc@x.ch" },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { name: /^Vestiaire\W+Créneaux tous annulés$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Bar" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Sécurité" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: /^Vestiaire\W+Créneaux tous annulés$/ })).toBeInTheDocument()
    const hint = "Ce poste a été supprimé, ou tous ses créneaux annulés. Ses responsables ne sont pas repris si vous dupliquez l'événement ; un nouveau créneau de ce poste leur rend leur poste."
    expect(screen.getByRole("button", { name: "Retirer Noé des responsables de Vestiaire" })).toHaveAccessibleDescription(hint)
    expect(screen.getByRole("button", { name: "Retirer Léa des responsables de Bar" })).not.toHaveAccessibleDescription()
    expect(screen.getByText("3 responsables, dont 1 sur un poste aux créneaux tous annulés")).toBeInTheDocument()
  })
})

// #1169: labels with and without sectors, the « un poste / un secteur » choice.
describe("SectorLeadersManager — poste and sector leaders (#1169)", () => {
  afterEach(cleanup)
  const leaders = [
    { id: "l1", roleName: "Parking Nord", sectorId: null, name: "Nina", email: "nina@x.ch" },
    { id: "l2", roleName: null, sectorId: "sec-parking", name: "Paula", email: "paula@x.ch" },
    { id: "l3", roleName: null, sectorId: "sec-old", name: "Oscar", email: "oscar@x.ch" },
  ]
  const sectors = {
    canAdd: true,
    list: [
      { id: "sec-parking", name: "Parking", archived: false, postes: ["École", "Parking Nord", "Parking Sud"] },
      { id: "sec-old", name: "Accueil", archived: true, postes: [] },
    ],
  }

  it("without sectors: no kind label, no choice, the poste field first (as before #1169)", () => {
    render(<SectorLeadersManager eventId="e" roleNames={["Bar"]} initialLeaders={[{ id: "l1", roleName: "Bar", name: "Bob", email: "b@x.ch" }]} />)
    expect(screen.getByRole("heading", { level: 2, name: "Bar" })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Responsable de (poste|secteur)/)
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un responsable" }))
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("group", { name: "Responsable de" })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Poste" }))
  })

  it("with sectors: grouped by sector, « Responsable de secteur » then the poste leaders, « Autres postes » last", () => {
    render(<SectorLeadersManager eventId="e" roleNames={["Parking Nord"]} initialLeaders={[...leaders, { id: "l4", roleName: "Bar", sectorId: null, name: "Bob", email: "bob@x.ch" }]} sectors={sectors} />)
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Parking", "Accueil, Secteur archivé", NO_SECTOR_LABEL])
    const parking = screen.getByRole("region", { name: "Parking" })
    expect(within(parking).getByText("Postes : École, Parking Nord, Parking Sud")).toBeInTheDocument()
    expect(within(parking).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Responsable de secteur", "Responsable de poste · , Parking Nord"])
    expect(within(parking).getByRole("button", { name: "Retirer Paula des responsables du secteur Parking" })).toBeInTheDocument()
    expect(within(parking).getByRole("button", { name: "Retirer Nina des responsables du poste Parking Nord" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retirer Bob des responsables du poste Bar" })).toBeInTheDocument()
    expect(screen.getByText(/4 responsables, dont 1 sur un secteur archivé/)).toBeInTheDocument()
  })

  it("shows an active sector without any leader, so the organiser sees where one can go", () => {
    render(<SectorLeadersManager eventId="e" roleNames={[]} initialLeaders={[]} sectors={sectors} />)
    const parking = screen.getByRole("region", { name: "Parking" })
    expect(within(parking).getByText("Personne pour tout le secteur.")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /Accueil/ })).toBeNull()
  })

  it("offers « Tout un secteur / Un poste précis », the sector first, and swaps the field", () => {
    render(<SectorLeadersManager eventId="e" roleNames={["Parking Nord"]} initialLeaders={[]} sectors={sectors} />)
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un responsable" }))
    expect(screen.getByRole("group", { name: "Responsable de" })).toBeInTheDocument()
    expect(screen.getAllByRole("radio").map((r) => (r.closest("label") as HTMLElement).textContent)).toEqual(["Tout un secteur", "Un poste précis"])
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Tout un secteur" }))
    const select = screen.getByRole("combobox", { name: "Secteur" }) as HTMLSelectElement
    // Only the active sectors, and no sector preselected.
    expect(Array.from(select.options).map((o) => o.text)).toEqual(["Choisir un secteur…", "Parking"])
    expect(select.value).toBe("")
    fireEvent.click(screen.getByRole("radio", { name: "Un poste précis" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Poste" }), { target: { value: "Bar" } })
    fireEvent.click(screen.getByRole("radio", { name: "Tout un secteur" }))
    // Back to « Un poste précis »: what was typed is kept.
    fireEvent.click(screen.getByRole("radio", { name: "Un poste précis" }))
    expect((screen.getByRole("combobox", { name: "Poste" }) as HTMLInputElement).value).toBe("Bar")
  })

  it("no choice while the beta capability is closed: poste leaders only, and says why", () => {
    render(<SectorLeadersManager eventId="e" roleNames={[]} initialLeaders={[]} sectors={{ ...sectors, canAdd: false }} />)
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un responsable" }))
    expect(screen.queryByRole("group", { name: "Responsable de" })).toBeNull()
    expect(screen.getByText(/fait partie des fonctions bêta/)).toBeInTheDocument()
  })
})
