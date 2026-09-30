import { describe, it, expect } from "vitest"
import { shiftsOverlap, slugify, cn, generateToken, formatDate, formatShortDate, calculateAgeAt, shiftsTooYoungFor } from "../utils"

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

// ── formatDate / formatShortDate ──────────────────────────────────────────────

describe("formatDate", () => {
  it("formate avec jour de la semaine, jour et mois en français", () => {
    const result = formatDate("2025-08-02")
    expect(result).toMatch(/samedi/)
    expect(result).toMatch(/2/)
    expect(result).toMatch(/août/)
  })

  it("accepte un objet Date", () => {
    const result = formatDate(new Date("2025-12-25T12:00:00Z"))
    expect(result).toMatch(/décembre/)
  })
})

describe("formatShortDate", () => {
  it("formate avec jour, mois et année en français", () => {
    const result = formatShortDate("2025-08-02")
    expect(result).toMatch(/2/)
    expect(result).toMatch(/août/)
    expect(result).toMatch(/2025/)
  })

  it("n'inclut pas le jour de la semaine", () => {
    const result = formatShortDate("2025-08-02")
    expect(result).not.toMatch(/samedi/)
  })
})

describe("shiftsOverlap — shifts that run past midnight", () => {
  const s = (startTime: string, endTime: string, date: string) => ({ startTime, endTime, date })

  it("an overnight shift (22:00 to 02:00) overlaps an evening shift of the same date", () => {
    expect(shiftsOverlap(s("22:00", "02:00", "2026-09-25"), s("23:00", "23:30", "2026-09-25"))).toBe(true)
  })

  it("an overnight shift overlaps an early-morning shift of the next calendar date", () => {
    expect(shiftsOverlap(s("22:00", "02:00", "2026-09-25"), s("01:00", "03:00", "2026-09-26"))).toBe(true)
  })

  it("but not one that starts after it ends, or on another day", () => {
    expect(shiftsOverlap(s("22:00", "02:00", "2026-09-25"), s("02:00", "04:00", "2026-09-26"))).toBe(false)
    expect(shiftsOverlap(s("22:00", "02:00", "2026-09-25"), s("10:00", "12:00", "2026-09-26"))).toBe(false)
  })

  it("a shift ending exactly at midnight does not overlap the next day's first shift", () => {
    expect(shiftsOverlap(s("22:00", "00:00", "2026-09-25"), s("00:00", "02:00", "2026-09-26"))).toBe(false)
  })

  it("legacy hours above 23 still compare correctly", () => {
    expect(shiftsOverlap(s("24:00", "26:00", "2026-09-25"), s("00:30", "01:30", "2026-09-26"))).toBe(true)
  })
})

// ── calculateAgeAt / shiftsTooYoungFor ──────────────────────────────────────

describe("calculateAgeAt", () => {
  it("computes whole years elapsed on the reference date", () => {
    expect(calculateAgeAt("2008-09-24", "2026-09-24")).toBe(18)
  })

  it("hasn't had that year's birthday yet on the reference date", () => {
    expect(calculateAgeAt("2008-09-25", "2026-09-24")).toBe(17)
  })

  it("already had that year's birthday on the reference date", () => {
    expect(calculateAgeAt("2008-09-23", "2026-09-24")).toBe(18)
  })

  it("accepts Date objects as well as strings", () => {
    expect(calculateAgeAt(new Date("2008-09-24"), new Date("2026-09-24T00:00:00Z"))).toBe(18)
  })

  it("handles a 29 February birth date (birthday counted from 1 March in non-leap years)", () => {
    expect(calculateAgeAt("2008-02-29", "2026-02-28")).toBe(17)
    expect(calculateAgeAt("2008-02-29", "2026-03-01")).toBe(18)
  })
})

describe("shiftsTooYoungFor", () => {
  const shift = (id: string, minAge: number | null, date: string) => ({ id, minAge, date: new Date(`${date}T00:00:00Z`) })

  it("uses each shift's own date: birthday between registration and shift is accepted", () => {
    // Registering on Sep 28, turns 18 on Oct 3, shift on Oct 10.
    expect(shiftsTooYoungFor("2008-10-03", [shift("a", 18, "2026-10-10")])).toEqual([])
  })

  it("accepts a birthday on the shift day itself", () => {
    expect(shiftsTooYoungFor("2008-10-10", [shift("a", 18, "2026-10-10")])).toEqual([])
  })

  it("rejects when the birthday is the day after the shift", () => {
    expect(shiftsTooYoungFor("2008-10-11", [shift("a", 18, "2026-10-10")]).map((s) => s.id)).toEqual(["a"])
  })

  it("checks shifts independently when a selection spans the birthday", () => {
    const shifts = [shift("before", 18, "2026-10-02"), shift("after", 18, "2026-10-04"), shift("none", null, "2026-10-01")]
    expect(shiftsTooYoungFor("2008-10-03", shifts).map((s) => s.id)).toEqual(["before"])
  })
})

describe("shiftsTooYoungFor fails closed", () => {
  it("treats a birth date that can't give an age as too young", () => {
    const shifts = [{ minAge: 18, date: "2026-10-10" }, { minAge: null, date: "2026-10-10" }]
    expect(shiftsTooYoungFor("not a date", shifts)).toEqual([shifts[0]])
  })
})
