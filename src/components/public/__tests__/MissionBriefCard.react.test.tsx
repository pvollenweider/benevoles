/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

import MissionBriefCard from "../MissionBriefCard"
import { EMERGENCY_NOTE } from "@/lib/shift-info"

// « Avant ta mission » (#560) at the top of the personal page.
describe("MissionBriefCard", () => {
  afterEach(cleanup)
  const shift = { label: "Bar soir", date: "2031-06-06T00:00:00.000Z", startTime: "18:00", endTime: "20:00" }

  it("reads in order: when, where, whom to contact, instruction, then pages and the organization's email", () => {
    render(
      <MissionBriefCard
        shift={{ ...shift, dayContactName: "Coordination", dayContactPhone: "079 111 11 11" }}
        event={{ location: "Salle communale", latitude: 46.2, longitude: 6.1, publicInstructions: "Entrée par la cour", pages: [{ title: "Accès", url: "https://org.example/fete/acces" }] }}
        eventTitle="Fête"
        contactEmail="orga@example.org"
      />,
    )
    const section = screen.getByRole("region", { name: "Avant ta mission" })
    expect(section).toHaveAttribute("id", "avant-ta-mission")
    expect(within(section).getByRole("heading", { level: 2, name: "Avant ta mission" })).toBeInTheDocument()
    expect(within(section).getAllByRole("term").map((t) => t.textContent)).toEqual(["Quand", "Lieu", "Contact le jour J", "À savoir"])
    expect(within(section).getByText(/vendredi 6 juin, 18:00/)).toBeInTheDocument()
    expect(within(section).getByRole("link", { name: /Voir sur la carte/ })).toHaveAttribute("href", expect.stringContaining("openstreetmap"))
    expect(within(section).getByRole("link", { name: "079 111 11 11, appeler Coordination" })).toHaveAttribute("href", "tel:0791111111")
    expect(within(section).getByText(EMERGENCY_NOTE)).toBeInTheDocument()
    expect(within(section).getByRole("heading", { level: 3, name: "Infos de l'événement" })).toBeInTheDocument()
    expect(within(section).getByRole("link", { name: "Accès" })).toHaveAttribute("href", "https://org.example/fete/acces")
    expect(within(section).getByRole("link", { name: "Écrire à l'organisation" })).toHaveAttribute("href", expect.stringMatching(/^mailto:orga@example\.org\?subject=/))
  })

  it("names the shift's own contact « Contact pour ce créneau », without the emergency note", () => {
    render(<MissionBriefCard shift={{ ...shift, contactName: "Léa", contactPhone: "079 000 00 00" }} event={{}} eventTitle="Fête" contactEmail={null} />)
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(["Quand", "Contact pour ce créneau"])
    expect(screen.getByRole("link", { name: "079 000 00 00, appeler Léa" })).toBeInTheDocument()
    expect(screen.queryByText(EMERGENCY_NOTE)).toBeNull()
  })

  it("names the sector leaders, never with contact details", () => {
    render(<MissionBriefCard shift={{ ...shift, sectorLeaderNames: ["Paul Martin"] }} event={{}} eventTitle="Fête" contactEmail={null} />)
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(["Quand", "Responsable du poste"])
    expect(screen.getByText("Paul Martin")).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("with partial data, shows only the date and time, no empty line nor link", () => {
    render(<MissionBriefCard shift={shift} event={{ pages: [] }} eventTitle="Fête" contactEmail={null} />)
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(["Quand"])
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull()
  })

  it("a contact with a name only is plain text", () => {
    render(<MissionBriefCard shift={{ ...shift, dayContactName: "Coordination" }} event={{}} eventTitle="Fête" contactEmail={null} />)
    expect(screen.getByText("Coordination")).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
