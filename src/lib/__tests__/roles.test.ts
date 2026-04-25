import { describe, it, expect } from "vitest"
import { getRoleAccent, getBarClasses } from "../roles"

// ── getRoleAccent ─────────────────────────────────────────────────────────────

describe("getRoleAccent", () => {
  it("retourne la couleur billetterie", () => {
    expect(getRoleAccent("Billetterie entrée")).toBe("bg-blue-400")
  })

  it("retourne la couleur buvette", () => {
    expect(getRoleAccent("Buvette bar")).toBe("bg-amber-400")
  })

  it("retourne la couleur photo", () => {
    expect(getRoleAccent("Photos")).toBe("bg-violet-400")
  })

  it("retourne la couleur vidéo (abrév. vid)", () => {
    expect(getRoleAccent("Vidéo")).toBe("bg-red-400")
  })

  it("retourne la couleur montage", () => {
    expect(getRoleAccent("Montage & rangement")).toBe("bg-orange-400")
  })

  it("retourne la couleur démontage (prioritaire sur montage)", () => {
    expect(getRoleAccent("Démontage & rangement")).toBe("bg-stone-400")
  })

  it("fallback gris pour un rôle inconnu", () => {
    expect(getRoleAccent("Jardinage")).toBe("bg-gray-300")
  })

  it("insensible à la casse", () => {
    expect(getRoleAccent("BILLETTERIE")).toBe("bg-blue-400")
  })
})

// ── getBarClasses ─────────────────────────────────────────────────────────────

describe("getBarClasses", () => {
  it("retourne des classes pour l'état default", () => {
    const cls = getBarClasses("Billetterie", "default")
    expect(cls).toContain("bg-blue")
  })

  it("retourne des classes pour l'état selected", () => {
    const cls = getBarClasses("Billetterie", "selected")
    expect(cls).toContain("ring")
  })

  it("retourne des classes pour l'état unavailable", () => {
    const cls = getBarClasses("Billetterie", "unavailable")
    expect(cls).toContain("bg-blue-100")
  })

  it("fallback pour rôle inconnu — retourne une classe non vide", () => {
    const cls = getBarClasses("Inconnue", "default")
    expect(cls.length).toBeGreaterThan(0)
  })
})
