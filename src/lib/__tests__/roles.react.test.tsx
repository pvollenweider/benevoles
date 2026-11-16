/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { RoleIcon } from "../roles"
import { POSTE_CATEGORIES } from "../poste-categories"

describe("RoleIcon", () => {
  it.each(POSTE_CATEGORIES.map((category) => [category.label, category.keywords[0]]))(
    "rend un SVG pour la famille %s (%s)",
    (_label, roleName) => {
      const { container } = render(<RoleIcon roleName={roleName} />)
      expect(container.querySelector("svg")).not.toBeNull()
    },
  )

  it("rend la même icône pour deux postes de la même famille", () => {
    const billing = render(<RoleIcon roleName="Billetterie" />)
    const caisse = render(<RoleIcon roleName="Caisse" />)
    expect(billing.container.innerHTML).toBe(caisse.container.innerHTML)
  })

  it("marque l'icône décorative comme aria-hidden", () => {
    const { container } = render(<RoleIcon roleName="Buvette" />)
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("retourne null pour un rôle inconnu (pas de SVG)", () => {
    const { container } = render(<RoleIcon roleName="Jardinage" />)
    expect(container.querySelector("svg")).toBeNull()
  })

  it("est insensible à la casse", () => {
    const { container } = render(<RoleIcon roleName="BILLETTERIE" />)
    expect(container.querySelector("svg")).not.toBeNull()
  })
})
