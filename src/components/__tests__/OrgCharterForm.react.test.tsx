/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

import OrgCharterForm from "../admin/OrgCharterForm"

// The insurance switch of the charter settings (#579): its state is exposed by aria-checked, which
// also drives its forced-colours styling (`forced-colors:aria-checked:*`), so the attribute must
// follow every toggle.
describe("OrgCharterForm insurance switch", () => {
  afterEach(cleanup)

  it("is a named switch whose aria-checked follows the state", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={false} />)
    const toggle = screen.getByRole("switch", { name: "Assurance RC fournie par l'organisation" })
    expect(toggle).toHaveAttribute("aria-checked", "false")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("La charte indique que les bénévoles sont couverts par votre RC.")).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "false")
  })

  it("starts checked when the organisation provides insurance", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={true} />)
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  })

  it("keeps the forced-colours state classes on the attribute, not on a class toggle", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={false} />)
    const toggle = screen.getByRole("switch")
    expect(toggle.className).toContain("forced-colors:aria-checked:bg-[Highlight]")
    expect(toggle.className).toContain("forced-colors:border-[CanvasText]")
    expect(toggle.firstElementChild?.className).toContain("forced-colors:bg-[CanvasText]")
  })
})
