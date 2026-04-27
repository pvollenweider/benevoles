import { describe, it, expect } from "vitest"
import { parseCsv } from "../csv-import"

describe("parseCsv — header detection", () => {
  it("detects standard French headers", () => {
    const csv = "prenom,nom,email,telephone,tags\nAlice,Martin,alice@x.com,+41 79 1,bar"
    const result = parseCsv(csv)
    expect(result.detectedColumns.firstName).toBe("prenom")
    expect(result.detectedColumns.lastName).toBe("nom")
    expect(result.detectedColumns.email).toBe("email")
    expect(result.detectedColumns.phone).toBe("telephone")
    expect(result.detectedColumns.tags).toBe("tags")
  })

  it("detects accented and capitalised variants", () => {
    const csv = "Prénom,Nom de famille,E-mail,Téléphone,Tags\nBob,Dupont,bob@x.com,,musicien"
    const result = parseCsv(csv)
    expect(result.detectedColumns.firstName).toBe("Prénom")
    expect(result.detectedColumns.lastName).toBe("Nom de famille")
    expect(result.detectedColumns.email).toBe("E-mail")
    expect(result.detectedColumns.phone).toBe("Téléphone")
  })

  it("detects English headers (firstName, lastName)", () => {
    const csv = "firstName,lastName,email\nAlice,M,a@x.com"
    const result = parseCsv(csv)
    expect(result.detectedColumns.firstName).toBe("firstName")
    expect(result.detectedColumns.lastName).toBe("lastName")
  })
})

describe("parseCsv — row validation", () => {
  it("parses a clean CSV with all fields", () => {
    const csv = `prenom,nom,email,telephone,tags
Alice,Martin,alice@x.com,+41 79 123 45 67,"parent CM2,bar"
Bob,Dupont,bob@x.com,,musicien`
    const result = parseCsv(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({
      firstName: "Alice",
      lastName: "Martin",
      email: "alice@x.com",
      phone: "+41 79 123 45 67",
      tags: ["parent CM2", "bar"],
    })
    expect(result.rows[1]).toEqual({
      firstName: "Bob",
      lastName: "Dupont",
      email: "bob@x.com",
      phone: undefined,
      tags: ["musicien"],
    })
  })

  it("supports semicolon and pipe separators in tags column", () => {
    const csv = `prenom,nom,tags\nAlice,M,"a;b|c,d"`
    const result = parseCsv(csv)
    expect(result.rows[0]?.tags).toEqual(["a", "b", "c", "d"])
  })

  it("reports an error for rows missing the first name", () => {
    const csv = "prenom,nom\n,Martin"
    const result = parseCsv(csv)
    expect(result.rows).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toMatch(/Pr[ée]nom/i)
    expect(result.errors[0].line).toBe(2)
  })

  it("reports an error for rows missing the last name", () => {
    const csv = "prenom,nom\nAlice,"
    const result = parseCsv(csv)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toMatch(/Nom/i)
  })

  it("reports an error for invalid emails", () => {
    const csv = "prenom,nom,email\nAlice,M,not-an-email"
    const result = parseCsv(csv)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toMatch(/Email invalide/i)
  })

  it("returns empty preview for an empty file", () => {
    const result = parseCsv("")
    expect(result.rows).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it("ignores rows with neither prenom nor nom but reports them as errors", () => {
    const csv = "prenom,nom\n,\nAlice,Martin"
    const result = parseCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
  })
})
