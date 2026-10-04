import { describe, it, expect } from "vitest"
import { e2eSlot, e2eEnvOverrides, MAX_SLOT } from "../../scripts/e2e-slot.mjs"
import { isOurs } from "../../scripts/e2e-port-guard.mjs"

// Isolated e2e stack per worktree (#581).
describe("e2eSlot", () => {
  it("slot 0 keeps the historical stack (CI and an unset E2E_SLOT)", () => {
    expect(e2eSlot(0)).toEqual({
      E2E_SLOT: "0", E2E_SUFFIX: "", E2E_PROJECT: "benevoles-e2e", E2E_PG_CONTAINER: "benevoles_postgres_e2e",
      E2E_PORT: "3100", E2E_PG_PORT: "5433", E2E_SMTP_PORT: "1026", E2E_MAILPIT_PORT: "8026",
    })
  })

  it("slot N shifts every port by 10 × N and suffixes the names", () => {
    expect(e2eSlot(2)).toMatchObject({
      E2E_PROJECT: "benevoles-e2e-2", E2E_PG_CONTAINER: "benevoles_postgres_e2e-2",
      E2E_PORT: "3120", E2E_PG_PORT: "5453", E2E_SMTP_PORT: "1046", E2E_MAILPIT_PORT: "8046",
    })
  })

  it("no two slots share a port", () => {
    const ports = Array.from({ length: MAX_SLOT + 1 }, (_, i) => e2eSlot(i)).flatMap((s) => [s.E2E_PORT, s.E2E_PG_PORT, s.E2E_SMTP_PORT, s.E2E_MAILPIT_PORT])
    expect(new Set(ports).size).toBe(ports.length)
  })

  it("refuses a slot outside 0 to 9", () => {
    for (const bad of [-1, 10, 1.5, Number.NaN]) expect(() => e2eSlot(bad)).toThrow(/E2E_SLOT/)
  })

  it("the .env.e2e overrides point the app at its own stack", () => {
    expect(e2eEnvOverrides(1)).toEqual({
      DATABASE_URL: "postgresql://benevoles:benevoles@localhost:5443/benevoles_e2e",
      SMTP_PORT: "1036",
      NEXT_PUBLIC_APP_URL: "http://localhost:3110",
      AUTH_URL: "http://localhost:3110",
      E2E_PORT: "3110",
      MAILPIT_URL: "http://localhost:8036",
    })
  })
})

describe("isOurs (port guard)", () => {
  it("accepts a server started from this checkout or below it", () => {
    expect(isOurs("/work/benevoles-581", "/work/benevoles-581")).toBe(true)
    expect(isOurs("/work/benevoles-581/.next", "/work/benevoles-581")).toBe(true)
  })

  it("refuses another checkout, even with a shared prefix, and an unknown directory", () => {
    expect(isOurs("/work/benevoles", "/work/benevoles-581")).toBe(false)
    expect(isOurs("/work/benevoles-5810", "/work/benevoles-581")).toBe(false)
    expect(isOurs(null, "/work/benevoles-581")).toBe(false)
  })
})
