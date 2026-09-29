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

  it("rejects an invalid APP_TIME_ZONE at startup, naming the value (#343)", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development", APP_TIME_ZONE: "Europe/Zuric" })).toThrow(/APP_TIME_ZONE "Europe\/Zuric"/)
    expect(() => assertProductionSecrets({ NODE_ENV: "development", APP_TIME_ZONE: "UTC+1" })).toThrow(/APP_TIME_ZONE/)
  })

  it("accepts a valid APP_TIME_ZONE, and uses the default when unset or blank", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development", APP_TIME_ZONE: " America/New_York " })).not.toThrow()
    expect(() => assertProductionSecrets({ NODE_ENV: "development", APP_TIME_ZONE: "UTC" })).not.toThrow()
    expect(() => assertProductionSecrets({ NODE_ENV: "development", APP_TIME_ZONE: "  " })).not.toThrow()
  })
})
