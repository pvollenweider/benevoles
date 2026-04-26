/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { RoleIcon } from "../roles"

describe("RoleIcon", () => {
  it("rend un SVG pour un rôle connu (billetterie)", () => {
    const { container } = render(<RoleIcon roleName="Billetterie" />)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("rend un SVG pour buvette", () => {
    const { container } = render(<RoleIcon roleName="Buvette" />)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("rend un SVG pour photos", () => {
    const { container } = render(<RoleIcon roleName="Photos" />)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("rend un SVG pour vidéo", () => {
    const { container } = render(<RoleIcon roleName="Vidéo" />)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("rend un SVG pour montage", () => {
    const { container } = render(<RoleIcon roleName="Montage & rangement" />)
    expect(container.querySelector("svg")).not.toBeNull()
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
