/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import SectorLeaderRoster from "../public/SectorLeaderRoster"

// #1169: a sector leader's page, grouped by poste, with a day filter.
const reg = (id: string, first: string, roleName: string, date: string, label = "Matin") => ({
  id, status: "active", comment: null,
  volunteer: { firstName: first, lastName: "M", email: `${first.toLowerCase()}@example.org`, phone: "" },
  shift: { roleName, label, date: `${date}T00:00:00.000Z`, startTime: "08:00", endTime: "12:00" },
})

describe("SectorLeaderRoster (#1169)", () => {
  afterEach(cleanup)
  const registrations = [reg("r1", "Ana", "Parking Nord", "2030-06-01"), reg("r2", "Ana", "Parking Sud", "2030-06-02"), reg("r3", "Ben", "Parking Nord", "2030-06-02")]

  const renderRoster = (postes = ["École", "Parking Nord", "Parking Sud"]) => render(
    <SectorLeaderRoster heading="Responsable de secteur · Parking" eventTitle="Fête" postes={postes} registrations={registrations} staffing={[]} />,
  )

  it("shows every poste of the sector as a heading with its count, empty ones too", () => {
    renderRoster()
    expect(screen.getByRole("heading", { level: 1, name: "Responsable de secteur · Parking" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["École, 0 inscrit", "Parking Nord, 2 inscrits", "Parking Sud, 1 inscrit"])
    expect(screen.getByText("Personne n'est encore inscrit·e sur ce poste.")).toBeInTheDocument()
  })

  it("counts people once and announces the day filter in one status sentence", () => {
    renderRoster()
    const status = screen.getByRole("status")
    expect(status).toHaveAttribute("aria-atomic", "true")
    expect(status).toHaveTextContent("2 bénévoles inscrits, tous les jours")
    fireEvent.change(screen.getByRole("combobox", { name: "Jour" }), { target: { value: "2030-06-01" } })
    expect(status).toHaveTextContent(/^1 bénévole inscrit, samedi 1 juin$/)
    const sud = screen.getByRole("region", { name: /Parking Sud/ })
    expect(within(sud).getByText("Personne n'est inscrit·e ce jour-là.")).toBeInTheDocument()
  })

  it("an empty sector says so, without a filter", () => {
    render(<SectorLeaderRoster heading="Responsable de secteur · Accueil" eventTitle="Fête" postes={[]} registrations={[]} staffing={[]} />)
    expect(screen.getByText("Aucun poste n'est dans ce secteur pour l'instant.")).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Jour" })).toBeNull()
  })
})
