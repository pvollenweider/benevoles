import { describe, it, expect } from "vitest"
import { getRoleAccent, getBarClasses, COLOR_OPTIONS } from "../roles"

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

  it("fallback coloré (palette hash) pour un rôle inconnu", () => {
    const color = getRoleAccent("Jardinage")
    expect(color).toBeTruthy()
    expect(color).not.toBe("bg-gray-300")
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

// ── Admin-chosen colorKey override (#219) ───────────────────────────────────────

describe("colorKey override", () => {
  it("wins over a keyword-matched default", () => {
    // "Billetterie" would normally match the blue keyword default — an explicit choice must win.
    expect(getBarClasses("Billetterie", "default", "red")).toContain("bg-red")
    expect(getRoleAccent("Billetterie", "red")).toBe("bg-red-400")
  })

  it("wins over the hash-based fallback for an unknown role", () => {
    expect(getBarClasses("Un poste jamais vu", "default", "emerald")).toContain("bg-emerald")
  })

  it("is ignored when null, undefined, or not a real palette key", () => {
    const withoutOverride = getBarClasses("Billetterie", "default")
    expect(getBarClasses("Billetterie", "default", null)).toBe(withoutOverride)
    expect(getBarClasses("Billetterie", "default", undefined)).toBe(withoutOverride)
    expect(getBarClasses("Billetterie", "default", "not-a-real-color")).toBe(withoutOverride)
  })

  it("every listed color option resolves to real bar and accent classes for all 3 states", () => {
    for (const { key } of COLOR_OPTIONS) {
      for (const state of ["default", "selected", "unavailable"] as const) {
        expect(getBarClasses("Peu importe", state, key).length).toBeGreaterThan(0)
      }
      expect(getRoleAccent("Peu importe", key)).toMatch(/^bg-/)
    }
  })
})
