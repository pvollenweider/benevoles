import { describe, it, expect } from "vitest"
import { seedPasswords } from "../seed-credentials"

const STRONG = "Tournesol-Lumineux7!"
const OTHER = "Glacier-Bleu-2026?"

describe("seed passwords (pentest F8)", () => {
  it("keeps the documented development defaults outside production", () => {
    expect(seedPasswords({})).toEqual({ superAdminPassword: "change-me", orgAdminPassword: "change-me" })
    expect(seedPasswords({ NODE_ENV: "development", ADMIN_PASSWORD: "admin" })).toEqual({ superAdminPassword: "admin", orgAdminPassword: "admin" })
    expect(seedPasswords({ NODE_ENV: "test", ADMIN_PASSWORD: "a", ORG_ADMIN_PASSWORD: "b" })).toEqual({ superAdminPassword: "a", orgAdminPassword: "b" })
  })

  it("refuses to run in production without both passwords, with no fallback from one to the other", () => {
    expect(seedPasswords({ NODE_ENV: "production" })).toMatchObject({ error: expect.stringContaining("ADMIN_PASSWORD n'est pas défini") })
    const onlySuper = seedPasswords({ NODE_ENV: "production", ADMIN_PASSWORD: STRONG })
    expect(onlySuper).toMatchObject({ error: expect.stringContaining("ORG_ADMIN_PASSWORD n'est pas défini") })
  })

  it("refuses a weak or default password in production", () => {
    for (const weak of ["change-me", "admin", "alllowercase1!", "NoDigitsHere!!"]) {
      const result = seedPasswords({ NODE_ENV: "production", ADMIN_PASSWORD: weak, ORG_ADMIN_PASSWORD: OTHER })
      expect(result, weak).toMatchObject({ error: expect.stringContaining("ADMIN_PASSWORD ne respecte pas les règles") })
    }
  })

  it("accepts two passwords that follow the policy in production", () => {
    expect(seedPasswords({ NODE_ENV: "production", ADMIN_PASSWORD: STRONG, ORG_ADMIN_PASSWORD: OTHER })).toEqual({ superAdminPassword: STRONG, orgAdminPassword: OTHER })
  })

  it("never echoes a password in the refusal", () => {
    const result = seedPasswords({ NODE_ENV: "production", ADMIN_PASSWORD: "weakpass", ORG_ADMIN_PASSWORD: "otherweak" })
    expect("error" in result && result.error).not.toMatch(/weakpass|otherweak/)
  })
})
