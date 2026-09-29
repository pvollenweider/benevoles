import { describe, it, expect } from "vitest"
import { ago, assessConfig, assessDatabase, assessJob, assessMigrations, assessOutbox, assessRestoreTest, healthHeadline, worstLevel } from "../health-view"

const now = new Date("2026-07-10T12:00:00Z")
const at = (iso: string) => new Date(iso)
const run = (finished: string | null, ok: boolean | null = true, started = "2026-07-10T02:00:00Z") =>
  ({ job: "x", startedAt: at(started), finishedAt: finished ? at(finished) : null, ok, error: ok === false ? "boom" : null })

// Super-admin health page (#383).
describe("health view", () => {
  it("words elapsed time", () => {
    expect(ago(at("2026-07-10T11:50:00Z"), now)).toBe("il y a 10 min")
    expect(ago(at("2026-07-10T09:00:00Z"), now)).toBe("il y a 3 h")
    expect(ago(at("2026-07-07T12:00:00Z"), now)).toBe("il y a 3 jours")
  })

  it("jobs: ok within the window, error when late, failed or stuck, unknown when never run", () => {
    expect(assessJob("Nettoyage", run("2026-07-10T02:05:00Z"), now, 26).level).toBe("ok")
    expect(assessJob("Nettoyage", run("2026-07-08T02:05:00Z"), now, 26)).toMatchObject({ level: "error", detail: "Dernier succès il y a 2 jours ; attendu toutes les 26 h." })
    expect(assessJob("Nettoyage", run("2026-07-10T02:05:00Z", false), now, 26)).toMatchObject({ level: "error", detail: "Dernière exécution en échec il y a 10 h : boom" })
    expect(assessJob("Nettoyage", run(null, null, "2026-07-10T11:30:00Z"), now, 26).level).toBe("ok")
    expect(assessJob("Nettoyage", run(null, null, "2026-07-10T08:00:00Z"), now, 26).level).toBe("error")
    expect(assessJob("Nettoyage", null, now, 26).level).toBe("unknown")
  })

  it("restore test: monthly, warn after 45 days, error after 90 or never", () => {
    expect(assessRestoreTest(run("2026-06-20T10:00:00Z"), now).level).toBe("ok")
    expect(assessRestoreTest(run("2026-05-20T10:00:00Z"), now).level).toBe("warn")
    expect(assessRestoreTest(run("2026-03-01T10:00:00Z"), now).level).toBe("error")
    expect(assessRestoreTest(null, now).level).toBe("warn")
  })

  it("outbox, database, migrations, config", () => {
    expect(assessOutbox({ failedLastDay: 0, oldestPendingMinutes: null, staleClaims: 0, healthy: true })).toMatchObject({ level: "ok", detail: "Rien en attente." })
    expect(assessOutbox({ failedLastDay: 2, oldestPendingMinutes: 40, staleClaims: 0, healthy: false })).toMatchObject({ level: "error", detail: "2 échecs définitifs en 24 h, en attente depuis 40 min." })
    expect(assessOutbox({ failedLastDay: 0, oldestPendingMinutes: 40, staleClaims: 0, healthy: false }).level).toBe("warn")
    expect(assessDatabase(12).level).toBe("ok")
    expect(assessDatabase(800).level).toBe("warn")
    expect(assessDatabase(null).level).toBe("error")
    expect(assessMigrations({ applied: 80, lastName: "20260930200000_outbox_organization", lastAt: now, pending: 0 })).toMatchObject({ level: "ok" })
    expect(assessMigrations({ applied: 80, lastName: "x", lastAt: now, pending: 2 })).toMatchObject({ level: "error", detail: "2 migrations du code pas encore appliquées (80 appliquées)." })
    const cfg = assessConfig({ smtp: false, push: false, cronSecret: true, tokenEncryption: true, sentry: false })
    expect(cfg.map((c) => c.level)).toEqual(["error", "warn", "ok", "ok", "warn"])
  })

  it("headline and worst level", () => {
    const items = [{ id: "a", label: "a", level: "ok" as const, detail: "" }, { id: "b", label: "b", level: "warn" as const, detail: "" }]
    expect(worstLevel(items)).toBe("warn")
    expect(healthHeadline(items)).toBe("Rien de bloquant ; 1 point à surveiller.")
    expect(healthHeadline([...items, { id: "c", label: "c", level: "error", detail: "" }])).toBe("1 problème à traiter, 1 point à surveiller.")
    expect(healthHeadline([items[0]])).toBe("Tout est en ordre.")
  })
})
