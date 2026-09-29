import { describe, it, expect } from "vitest"
import { assertProductionSecrets } from "../production-guards"

describe("assertProductionSecrets", () => {
  it("refuses to start in production without TOKEN_ENCRYPTION_KEY (missing or blank)", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "production" })).toThrow(/TOKEN_ENCRYPTION_KEY/)
    expect(() => assertProductionSecrets({ NODE_ENV: "production", TOKEN_ENCRYPTION_KEY: "  " })).toThrow(/TOKEN_ENCRYPTION_KEY/)
  })

  it("starts in production with a key", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "production", TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") })).not.toThrow()
  })

  it("doesn't require it in development or test", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development" })).not.toThrow()
    expect(() => assertProductionSecrets({ NODE_ENV: "test" })).not.toThrow()
  })

  it("rejects malformed keys at startup in any environment (#313)", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development", TOKEN_ENCRYPTION_KEY: "a2V5" })).toThrow(/32 bytes/)
    expect(() => assertProductionSecrets({ NODE_ENV: "development", TOKEN_ENCRYPTION_PREVIOUS_KEYS: "nocolon" })).toThrow(/id:base64key/)
  })
})
