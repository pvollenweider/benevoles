import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const VALID_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(32),
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "secret",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
}

describe("env validation", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never)
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("parse sans erreur avec toutes les vars valides", async () => {
    vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
    vi.stubEnv("ADMIN_EMAIL", VALID_ENV.ADMIN_EMAIL)
    vi.stubEnv("ADMIN_PASSWORD", VALID_ENV.ADMIN_PASSWORD)

    await import("../env")

    expect(exitSpy).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it("appelle process.exit(1) si DATABASE_URL est absente", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
    vi.stubEnv("ADMIN_EMAIL", VALID_ENV.ADMIN_EMAIL)
    vi.stubEnv("ADMIN_PASSWORD", VALID_ENV.ADMIN_PASSWORD)

    await import("../env")

    expect(exitSpy).toHaveBeenCalledWith(1)
    vi.unstubAllEnvs()
  })

  it("appelle process.exit(1) si AUTH_SECRET est trop court", async () => {
    vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
    vi.stubEnv("AUTH_SECRET", "court")
    vi.stubEnv("ADMIN_EMAIL", VALID_ENV.ADMIN_EMAIL)
    vi.stubEnv("ADMIN_PASSWORD", VALID_ENV.ADMIN_PASSWORD)

    await import("../env")

    expect(exitSpy).toHaveBeenCalledWith(1)
    vi.unstubAllEnvs()
  })

  it("affiche un message d'erreur explicite en cas d'échec", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
    vi.stubEnv("ADMIN_EMAIL", VALID_ENV.ADMIN_EMAIL)
    vi.stubEnv("ADMIN_PASSWORD", VALID_ENV.ADMIN_PASSWORD)

    await import("../env")

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL"))
    vi.unstubAllEnvs()
  })
})
