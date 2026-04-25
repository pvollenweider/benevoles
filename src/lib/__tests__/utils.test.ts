import { describe, it, expect } from "vitest"
import { shiftsOverlap, slugify, cn, generateToken } from "../utils"

// ── shiftsOverlap ────────────────────────────────────────────────────────────

describe("shiftsOverlap", () => {
  const day = "2025-08-02"
  const other = "2025-08-03"

  function s(startTime: string, endTime: string, date = day) {
    return { startTime, endTime, date }
  }

  it("détecte un chevauchement complet (a dans b)", () => {
    expect(shiftsOverlap(s("10:00", "12:00"), s("09:00", "13:00"))).toBe(true)
  })

  it("détecte un chevauchement partiel (début de b dans a)", () => {
    expect(shiftsOverlap(s("09:00", "11:00"), s("10:00", "12:00"))).toBe(true)
  })

  it("détecte un chevauchement partiel (fin de b dans a)", () => {
    expect(shiftsOverlap(s("10:00", "12:00"), s("09:00", "11:00"))).toBe(true)
  })

  it("détecte des créneaux identiques", () => {
    expect(shiftsOverlap(s("09:00", "12:00"), s("09:00", "12:00"))).toBe(true)
  })

  it("pas de chevauchement — b après a", () => {
    expect(shiftsOverlap(s("09:00", "11:00"), s("11:00", "13:00"))).toBe(false)
  })

  it("pas de chevauchement — a après b", () => {
    expect(shiftsOverlap(s("13:00", "15:00"), s("09:00", "11:00"))).toBe(false)
  })

  it("pas de chevauchement — jours différents", () => {
    expect(shiftsOverlap(s("09:00", "12:00", day), s("09:00", "12:00", other))).toBe(false)
  })

  it("accepte un objet Date comme date", () => {
    const a = { startTime: "09:00", endTime: "11:00", date: new Date("2025-08-02T00:00:00Z") }
    const b = { startTime: "10:00", endTime: "12:00", date: new Date("2025-08-02T00:00:00Z") }
    expect(shiftsOverlap(a, b)).toBe(true)
  })
})

// ── slugify ──────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("met en minuscule", () => {
    expect(slugify("Festival")).toBe("festival")
  })

  it("retire les accents", () => {
    expect(slugify("Été")).toBe("ete")
    expect(slugify("bénévoles")).toBe("benevoles")
  })

  it("remplace les espaces par des tirets", () => {
    expect(slugify("Festival 2025")).toBe("festival-2025")
  })

  it("supprime les tirets en début/fin", () => {
    expect(slugify("-test-")).toBe("test")
  })

  it("fusionne plusieurs séparateurs consécutifs", () => {
    expect(slugify("a  --  b")).toBe("a-b")
  })

  it("retire les caractères spéciaux", () => {
    expect(slugify("Fête de la musique !")).toBe("fete-de-la-musique")
  })

  it("chaîne vide → chaîne vide", () => {
    expect(slugify("")).toBe("")
  })
})

// ── cn ───────────────────────────────────────────────────────────────────────

describe("cn", () => {
  it("concatène des classes simples", () => {
    expect(cn("a", "b", "c")).toBe("a b c")
  })

  it("filtre les valeurs falsy", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b")
  })

  it("retourne une chaîne vide si tout est falsy", () => {
    expect(cn(false, null, undefined)).toBe("")
  })
})

// ── generateToken ─────────────────────────────────────────────────────────────

describe("generateToken", () => {
  it("génère une chaîne non vide", () => {
    expect(generateToken().length).toBeGreaterThan(0)
  })

  it("génère des tokens différents à chaque appel", () => {
    expect(generateToken()).not.toBe(generateToken())
  })

  it("ne contient que des caractères alphanumériques minuscules", () => {
    expect(generateToken()).toMatch(/^[a-z0-9]+$/)
  })
})
