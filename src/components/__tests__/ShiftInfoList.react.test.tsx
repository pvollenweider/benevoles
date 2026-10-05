/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

import ShiftInfoList from "../ShiftInfoList"
import { EMERGENCY_NOTE } from "@/lib/shift-info"

// Practical info per shift (#397), as shown on the personal page and the sign-up recap.
describe("ShiftInfoList", () => {
  afterEach(cleanup)

  it("renders nothing without info", () => {
    const { container } = render(<ShiftInfoList info={{ locationDetails: " ", contactName: null }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists place, contact with a tappable phone, and instructions", () => {
    render(<ShiftInfoList info={{ locationDetails: "Entrée B", contactName: "Léa", contactPhone: "079 000 00 00", instructions: "Gilet fourni" }} />)
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(["Lieu :", "Contact pour ce créneau :", "À savoir :"])
    const phone = screen.getByRole("link", { name: "079 000 00 00, appeler Léa" })
    expect(phone).toHaveAttribute("href", "tel:0790000000")
    expect(screen.getByText(/Léa,/)).toBeInTheDocument()
    expect(screen.getByText("Gilet fourni")).toBeInTheDocument()
  })

  // Day-of contact (#560): stands in for a shift without a contact, with the emergency note.
  it("shows the day-of contact when the shift has none, with the emergency note", () => {
    render(<ShiftInfoList info={{ dayContactName: "Coordination", dayContactPhone: "+41 79 111 11 11" }} />)
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(["Contact le jour J :"])
    expect(screen.getByRole("link", { name: "+41 79 111 11 11, appeler Coordination" })).toHaveAttribute("href", "tel:+41791111111")
    expect(screen.getByText(EMERGENCY_NOTE)).toBeInTheDocument()
  })

  it("prefers the shift's contact and then says nothing about emergencies", () => {
    render(<ShiftInfoList info={{ contactName: "Léa", contactPhone: "079 000 00 00", dayContactName: "Coordination", dayContactPhone: "079 111 11 11" }} />)
    expect(screen.getByRole("link", { name: "079 000 00 00, appeler Léa" })).toBeInTheDocument()
    expect(screen.queryByText(/Coordination/)).toBeNull()
    expect(screen.queryByText(EMERGENCY_NOTE)).toBeNull()
  })

  // Sector leaders (#560): named, never with an email or a phone.
  it("names the role's sector leaders after the contact", () => {
    render(<ShiftInfoList info={{ contactName: "Léa", sectorLeaderNames: ["Paul Martin", "Zoé Roux"] }} />)
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(["Contact pour ce créneau :", "Responsables du poste :"])
    expect(screen.getByText("Paul Martin, Zoé Roux")).toBeInTheDocument()
  })

  it("names the place in the map link, with a visible arrow hidden from screen readers", () => {
    render(<ShiftInfoList info={{ locationDetails: "Entrée B", latitude: 46.18, longitude: 6.12 }} />)
    const link = screen.getByRole("link", { name: "Voir sur la carte, Entrée B (OpenStreetMap, ouvre dans un nouvel onglet)" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link.querySelector("[aria-hidden='true']")?.textContent).toBe(" ↗")
  })

  it("shows a contact name alone as plain text", () => {
    render(<ShiftInfoList info={{ contactName: "Léa" }} />)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText("Léa")).toBeInTheDocument()
  })
})
