/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

import ShiftInfoList from "../ShiftInfoList"

// Practical info per shift (#397), as shown on the personal page and the sign-up recap.
describe("ShiftInfoList", () => {
  afterEach(cleanup)

  it("renders nothing without info", () => {
    const { container } = render(<ShiftInfoList info={{ locationDetails: " ", contactName: null }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists place, contact with a tappable phone, and instructions", () => {
    render(<ShiftInfoList info={{ locationDetails: "Entrée B", contactName: "Léa", contactPhone: "079 000 00 00", instructions: "Gilet fourni" }} />)
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(["Lieu :", "Contact :", "À savoir :"])
    const phone = screen.getByRole("link", { name: "Appeler Léa au 079 000 00 00" })
    expect(phone).toHaveAttribute("href", "tel:0790000000")
    expect(screen.getByText(/Léa ·/)).toBeInTheDocument()
    expect(screen.getByText("Gilet fourni")).toBeInTheDocument()
  })

  it("shows a contact name alone as plain text", () => {
    render(<ShiftInfoList info={{ contactName: "Léa" }} />)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText("Léa")).toBeInTheDocument()
  })
})
