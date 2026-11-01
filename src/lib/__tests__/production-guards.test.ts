import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { assertProductionSecrets, KNOWN_PLACEHOLDER_SECRETS, placeholderSecretReason } from "../production-guards"

const KEY = Buffer.alloc(32, 1).toString("base64")
const prod = (extra: Record<string, string>) => ({ NODE_ENV: "production", TOKEN_ENCRYPTION_KEY: KEY, ...extra })
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

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

  it("refuses every placeholder secret value shipped in the repository, in production", () => {
    for (const value of KNOWN_PLACEHOLDER_SECRETS) {
      expect(() => assertProductionSecrets(prod({ AUTH_SECRET: value })), value).toThrow(/AUTH_SECRET is not usable in production/)
      expect(() => assertProductionSecrets(prod({ CRON_SECRET: value })), value).toThrow(/CRON_SECRET is not usable in production/)
    }
  })

  it("refuses obvious stand-ins and low-variety values, without echoing the value", () => {
    for (const value of [
      "please-change-me-before-going-live-0001",
      "CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME",
      "my-placeholder-auth-value-for-the-server",
      "your-secret-goes-here-at-least-32-chars",
      "a".repeat(40),
      "12121212121212121212121212121212",
    ]) {
      expect(placeholderSecretReason(value), value).not.toBeNull()
      let message = ""
      try {
        assertProductionSecrets(prod({ AUTH_SECRET: value }))
      } catch (e) {
        message = (e as Error).message
      }
      expect(message, value).toMatch(/openssl rand -base64 32/)
      expect(message).not.toContain(value)
    }
  })

  it("accepts random values (base64, hex, the CI values)", () => {
    for (const value of [
      "q8V3nZk1LwYt0bRj5sXe2HfUoP9mCaD4gN7iK6lM+Qw=",
      "3f9a1c7e5b2d4086a9e1f3c5b7d9e0a2c4e6f8a1b3d5f7e9c1a3e5b7d9f1a3c5",
      "ci-e2e-only-secret-not-used-anywhere-else-0000",
      "ci-e2e-only-cron-not-used-anywhere-else",
    ]) {
      expect(placeholderSecretReason(value), value).toBeNull()
      expect(() => assertProductionSecrets(prod({ AUTH_SECRET: value, CRON_SECRET: value }))).not.toThrow()
    }
  })

  it("doesn't check AUTH_SECRET outside production (dev and test keep their own values)", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development", AUTH_SECRET: KNOWN_PLACEHOLDER_SECRETS[0] })).not.toThrow()
    expect(() => assertProductionSecrets({ NODE_ENV: "test", AUTH_SECRET: "CHANGEME" })).not.toThrow()
  })

  it("ships no default AUTH_SECRET: empty in .env.example, required in docker-compose.yml", () => {
    expect(read(".env.example")).toMatch(/^AUTH_SECRET=""$/m)
    const compose = read("docker-compose.yml")
    expect(compose).toMatch(/AUTH_SECRET: \$\{AUTH_SECRET:\?[^}]+\}/)
    expect(compose).not.toMatch(/AUTH_SECRET: \$\{AUTH_SECRET:-/)
  })
})
