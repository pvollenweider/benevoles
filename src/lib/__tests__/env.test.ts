import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const VALID_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(32),
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
    vi.unstubAllEnvs()
  })

  it("parse sans erreur avec toutes les vars valides", async () => {
    vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)

    await import("../env")

    expect(exitSpy).not.toHaveBeenCalled()
  })

  // #810 : une adresse d'alerte mal saisie a empêché l'application de démarrer en production.
  it("démarre avec une OPERATOR_ALERT_EMAIL invalide (ignorée plus tard, jamais bloquante)", async () => {
    vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
    vi.stubEnv("OPERATOR_ALERT_EMAIL", "philippe@adresse")

    await import("../env")

    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("appelle process.exit(1) si DATABASE_URL est absente", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)

    await import("../env")

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("appelle process.exit(1) si AUTH_SECRET est trop court", async () => {
    vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
    vi.stubEnv("AUTH_SECRET", "court")

    await import("../env")

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("affiche un message d'erreur explicite en cas d'échec", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)

    await import("../env")

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL"))
  })

  it("ne valide pas ADMIN_EMAIL / ADMIN_PASSWORD (utilisées seulement par le seed)", async () => {
    vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
    vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
    // ADMIN_EMAIL / ADMIN_PASSWORD volontairement absents

    await import("../env")

    expect(exitSpy).not.toHaveBeenCalled()
  })

  describe("releaseCheckEnabled (#612)", () => {
    it("on by default (RELEASE_CHECK unset)", async () => {
      vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
      vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
      vi.stubEnv("RELEASE_CHECK", "")
      const { releaseCheckEnabled } = await import("../env")
      expect(releaseCheckEnabled()).toBe(true)
    })

    it("off disables it, case-insensitively", async () => {
      vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
      vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
      vi.stubEnv("RELEASE_CHECK", "OFF")
      const { releaseCheckEnabled } = await import("../env")
      expect(releaseCheckEnabled()).toBe(false)
    })

    it("any other value keeps it on", async () => {
      vi.stubEnv("DATABASE_URL", VALID_ENV.DATABASE_URL)
      vi.stubEnv("AUTH_SECRET", VALID_ENV.AUTH_SECRET)
      vi.stubEnv("RELEASE_CHECK", "on")
      const { releaseCheckEnabled } = await import("../env")
      expect(releaseCheckEnabled()).toBe(true)
    })
  })
})
