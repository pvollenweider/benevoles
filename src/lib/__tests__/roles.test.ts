import { describe, it, expect } from "vitest"
import { getRoleAccent, getBarClasses, COLOR_OPTIONS } from "../roles"

// ── getRoleAccent ─────────────────────────────────────────────────────────────

describe("getRoleAccent", () => {
  it("retourne la couleur accueil, toujours bleue", () => {
    expect(getRoleAccent("Accueil")).toBe("bg-blue-400")
    expect(getRoleAccent("Accueil & info")).toBe("bg-blue-400")
  })

  it("retourne la couleur billetterie (famille accueil)", () => {
    expect(getRoleAccent("Billetterie entrée")).toBe("bg-blue-400")
  })

  it("retourne la couleur buvette", () => {
    expect(getRoleAccent("Buvette bar")).toBe("bg-amber-400")
  })

  it("retourne la couleur photo (famille image et son)", () => {
    expect(getRoleAccent("Photos")).toBe("bg-violet-400")
  })

  it("retourne la couleur vidéo (famille image et son, plus rouge)", () => {
    expect(getRoleAccent("Vidéo")).toBe("bg-violet-400")
  })

  it("retourne la couleur montage (famille installation)", () => {
    expect(getRoleAccent("Montage & rangement")).toBe("bg-teal-400")
  })

  it("retourne la couleur démontage (famille démontage, pas montage)", () => {
    expect(getRoleAccent("Démontage & rangement")).toBe("bg-stone-400")
  })

  it("retourne les couleurs des autres familles", () => {
    expect(getRoleAccent("Cuisine")).toBe("bg-orange-400")
    expect(getRoleAccent("Sécurité")).toBe("bg-yellow-500")
    expect(getRoleAccent("Premiers secours")).toBe("bg-red-400")
    expect(getRoleAccent("Ravitaillement")).toBe("bg-emerald-500")
    expect(getRoleAccent("Animation enfants")).toBe("bg-pink-400")
    expect(getRoleAccent("Stand")).toBe("bg-rose-400")
    expect(getRoleAccent("Transport")).toBe("bg-cyan-500")
    expect(getRoleAccent("Rangement")).toBe("bg-stone-400")
  })

  it("fallback coloré (palette hash) pour un rôle inconnu", () => {
    const color = getRoleAccent("Jardinage")
    expect(["bg-indigo-400", "bg-lime-500", "bg-sky-400", "bg-fuchsia-400"]).toContain(color)
    expect(["bg-gray-300", "bg-red-400", "bg-blue-400", "bg-amber-400"]).not.toContain(color)
  })

  it("insensible à la casse", () => {
    expect(getRoleAccent("BILLETTERIE")).toBe("bg-blue-400")
    expect(getRoleAccent("ACCUEIL")).toBe("bg-blue-400")
  })
})

// ── getBarClasses ─────────────────────────────────────────────────────────────

describe("getBarClasses", () => {
  it("donne les classes blue à Accueil sans colorKey", () => {
    expect(getBarClasses("Accueil", "default")).toBe("bg-blue-600 hover:bg-blue-700")
    expect(getBarClasses("Accueil", "unavailable")).toBe("bg-blue-100")
  })

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

  it("retourne les classes de la famille pour les postes connus", () => {
    expect(getBarClasses("Montage", "default")).toBe("bg-teal-700 hover:bg-teal-800")
    expect(getBarClasses("Démontage", "default")).toBe("bg-stone-600 hover:bg-stone-700")
    expect(getBarClasses("Vidéo", "default")).toBe("bg-violet-600 hover:bg-violet-700")
  })

  it("fallback pour rôle inconnu — une des quatre couleurs sans famille, jamais une couleur de famille", () => {
    const fallback = [
      "bg-indigo-600 hover:bg-indigo-700",
      "bg-lime-700 hover:bg-lime-800",
      "bg-sky-600 hover:bg-sky-700",
      "bg-fuchsia-600 hover:bg-fuchsia-700",
    ]
    for (const name of ["Inconnue", "Jardinage", "Pas de tir", "Zzz"]) {
      expect(fallback).toContain(getBarClasses(name, "default"))
    }
  })
})

// ── Admin-chosen colorKey override (#219) ───────────────────────────────────────

describe("colorKey override", () => {
  it("wins over a family-matched default", () => {
    // "Accueil" would normally be blue (its family) — an explicit choice must win.
    expect(getBarClasses("Accueil", "default", "red")).toBe("bg-red-600 hover:bg-red-700")
    expect(getRoleAccent("Accueil", "red")).toBe("bg-red-400")
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
