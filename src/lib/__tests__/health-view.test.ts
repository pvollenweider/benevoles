import { describe, it, expect } from "vitest"
import {
  ago, assessConfig, assessDatabase, assessDeferredBounces, assessJob, assessPendingSpaces, assessMigrations, assessOutbox,
  assessReleaseCheck, assessRestoreTest, deferredBounceCounts, healthHeadline, uncorrelatedInLastDay, worstLevel,
} from "../health-view"

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

  it("outbox: ok, recipient-address warnings, other failures and blocked sends as errors", () => {
    const outbox = { failedLastDay: 0, recipientFailuresLastDay: 0, otherFailuresLastDay: 0, oldestPendingMinutes: null, staleClaims: 0, healthy: true }
    expect(assessOutbox(outbox)).toMatchObject({ level: "ok", detail: "Rien en attente." })

    // Only mistyped/unknown addresses: a warning, never « Problème à traiter ».
    const addressText = (n: number) => `${n} adresse${n > 1 ? "s" : ""} refusée${n > 1 ? "s" : ""} par le destinataire en 24 h (domaine ou boîte inexistants, souvent une faute de frappe)`
    expect(assessOutbox({ ...outbox, failedLastDay: 1, recipientFailuresLastDay: 1 }))
      .toMatchObject({ level: "warn", detail: `${addressText(1)}.` })
    expect(assessOutbox({ ...outbox, failedLastDay: 3, recipientFailuresLastDay: 3 }))
      .toMatchObject({ level: "warn", detail: `${addressText(3)}.` })

    // Any other definitive failure stays an error, as before.
    expect(assessOutbox({ ...outbox, failedLastDay: 2, otherFailuresLastDay: 2, oldestPendingMinutes: 40, healthy: false }))
      .toMatchObject({ level: "error", detail: "2 échecs définitifs en 24 h, en attente depuis 40 min." })

    // Both causes: error, and the sentence names both.
    expect(assessOutbox({ ...outbox, failedLastDay: 3, recipientFailuresLastDay: 2, otherFailuresLastDay: 1, healthy: false }))
      .toMatchObject({ level: "error", detail: `1 échec définitif en 24 h, ${addressText(2)}.` })

    // A blocked send is an error; a slightly late pending row only a warning.
    expect(assessOutbox({ ...outbox, staleClaims: 2, healthy: false })).toMatchObject({ level: "error", detail: "2 envois bloqués." })
    expect(assessOutbox({ ...outbox, oldestPendingMinutes: 40, healthy: false })).toMatchObject({ level: "warn", detail: "en attente depuis 40 min." })
    expect(assessOutbox({ ...outbox, failedLastDay: 1, recipientFailuresLastDay: 1, oldestPendingMinutes: 40 }))
      .toMatchObject({ level: "warn", detail: `${addressText(1)}, en attente depuis 40 min.` })

    expect(assessDatabase(12).level).toBe("ok")
    expect(assessDatabase(800).level).toBe("warn")
    expect(assessDatabase(null).level).toBe("error")
    expect(assessMigrations({ applied: 80, lastName: "20260930200000_outbox_organization", lastAt: now, pending: 0 })).toMatchObject({ level: "ok" })
    expect(assessMigrations({ applied: 80, lastName: "x", lastAt: now, pending: 2 })).toMatchObject({ level: "error", detail: "2 migrations du code pas encore appliquées (80 appliquées)." })
    const cfg = assessConfig({ smtp: false, push: false, cronSecret: true, tokenEncryption: true, sentry: false })
    expect(cfg.map((c) => c.level)).toEqual(["error", "warn", "ok", "ok", "warn"])
  })

  it("release check: off, never checked, up to date, newer available", () => {
    expect(assessReleaseCheck({ enabled: false, latestVersion: null, lastCheckedAt: null, isNewer: false }, "2.0.2", now))
      .toMatchObject({ level: "unknown", detail: "Vérification désactivée (RELEASE_CHECK=off)." })
    expect(assessReleaseCheck({ enabled: true, latestVersion: null, lastCheckedAt: null, isNewer: false }, "2.0.2", now))
      .toMatchObject({ level: "unknown", detail: "Jamais vérifié." })
    expect(assessReleaseCheck({ enabled: true, latestVersion: "2.0.2", lastCheckedAt: at("2026-07-10T11:50:00Z"), isNewer: false }, "2.0.2", now))
      .toMatchObject({ level: "ok", detail: "À jour (2.0.2) ; vérifié il y a 10 min." })
    expect(assessReleaseCheck({ enabled: true, latestVersion: "2.1.0", lastCheckedAt: at("2026-07-10T11:50:00Z"), isNewer: true }, "2.0.2", now))
      .toMatchObject({ level: "warn", detail: "2.1.0 disponible (vous utilisez 2.0.2) ; vérifié il y a 10 min." })
  })

  it("headline and worst level", () => {
    const items = [{ id: "a", label: "a", level: "ok" as const, detail: "" }, { id: "b", label: "b", level: "warn" as const, detail: "" }]
    expect(worstLevel(items)).toBe("warn")
    expect(healthHeadline(items)).toBe("Rien de bloquant ; 1 point à surveiller.")
    expect(healthHeadline([...items, { id: "c", label: "c", level: "error", detail: "" }])).toBe("1 problème à traiter, 1 point à surveiller.")
    expect(healthHeadline([items[0]])).toBe("Tout est en ordre.")
  })
})

describe("assessPendingSpaces (#810)", () => {
  const now = new Date("2026-10-09T12:00:00Z")
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000)

  it("is fine with none or only young requests, and asks to look after 24 hours", () => {
    expect(assessPendingSpaces([], now)).toMatchObject({ level: "ok", detail: "Aucun." })
    expect(assessPendingSpaces([hoursAgo(2), hoursAgo(5)], now)).toMatchObject({ level: "ok", detail: "2 en attente." })
    expect(assessPendingSpaces([hoursAgo(2), hoursAgo(30)], now)).toMatchObject({ level: "warn", detail: "2 en attente, dont 1 depuis plus de 24 heures." })
  })
})

describe("assessDeferredBounces (#602)", () => {
  const now = new Date("2026-11-19T12:00:00Z")
  const at = (iso: string) => new Date(iso)
  const summary = {
    scanned: 4,
    flagged: 1,
    alreadyKnown: 1,
    ignoredTemporary: 1,
    ignored: 1,
    uncorrelated: 0,
    errors: 0,
  }
  const bounceRun = (over: Record<string, unknown> = {}) => ({
    job: "bounces",
    startedAt: at("2026-11-19T07:50:00Z"),
    finishedAt: at("2026-11-19T07:51:00Z"),
    ok: true,
    error: null,
    summary,
    ...over,
  })

  it("says « non configuré » when IMAP settings are absent", () => {
    expect(assessDeferredBounces({ configured: false, run: null }, now))
      .toMatchObject({ id: "deferred-bounces", label: "Rejets différés", level: "unknown", detail: "Inconnu : la boîte des avis de non-remise n'est pas configurée, les rejets différés ne sont pas lus." })
  })

  it("warns when configured but never run", () => {
    expect(assessDeferredBounces({ configured: true, run: null }, now)).toMatchObject({ level: "warn" })
  })

  it("shows an in-progress run, an abandoned one, and a failed one as an error", () => {
    expect(assessDeferredBounces({ configured: true, run: bounceRun({ finishedAt: null, ok: null, startedAt: at("2026-11-19T11:50:00Z") }) }, now))
      .toMatchObject({ level: "ok", detail: "En cours, démarré il y a 10 min." })
    expect(assessDeferredBounces({ configured: true, run: bounceRun({ finishedAt: null, ok: null, startedAt: at("2026-11-19T08:00:00Z") }) }, now))
      .toMatchObject({ level: "error", detail: "Démarré il y a 4 h et jamais terminé." })
    expect(assessDeferredBounces({ configured: true, run: bounceRun({ ok: false, error: "IMAP down" }) }, now))
      .toMatchObject({ level: "error", detail: "Dernière exécution en échec il y a 4 h : IMAP down" })
  })

  it("warns when the last success is older than an hour", () => {
    expect(assessDeferredBounces({ configured: true, run: bounceRun({ finishedAt: at("2026-11-19T09:00:00Z") }) }, now))
      .toMatchObject({ level: "warn", detail: "Dernier succès il y a 3 h ; attendu toutes les 15 min." })
  })

  it("shows the last run's counts and stays ok without uncorrelated messages", () => {
    expect(assessDeferredBounces({ configured: true, run: bounceRun({ finishedAt: at("2026-11-19T11:50:00Z") }) }, now))
      .toMatchObject({
        level: "ok",
        detail: "Dernier passage il y a 10 min : 4 avis analysés : 1 signalé, 1 déjà connu, 1 avis temporaire, 1 ignoré.",
      })
  })

  it("warns on uncorrelated messages in the last 24 h, with their count only", () => {
    const run = bounceRun({
      finishedAt: at("2026-11-19T11:50:00Z"),
      summary: { ...summary, uncorrelated: 2, uncorrelatedRuns: [{ at: "2026-11-19T11:45:00Z", count: 2 }] },
    })
    expect(assessDeferredBounces({ configured: true, run }, now)).toMatchObject({
      level: "warn",
      detail: "Dernier passage il y a 10 min : 4 avis analysés : 1 signalé, 1 déjà connu, 1 avis temporaire, 2 non rattachés, 1 ignoré. 2 messages non rattachés en 24 h.",
    })
  })

  it("warns on per-message errors in an otherwise successful run", () => {
    const run = bounceRun({ finishedAt: at("2026-11-19T11:50:00Z"), summary: { ...summary, errors: 1 } })
    expect(assessDeferredBounces({ configured: true, run }, now)).toMatchObject({ level: "warn", detail: expect.stringContaining("1 erreur") })
  })

  it("reads tolerant counts and a 24 h high-water mark, ignoring old entries", () => {
    expect(deferredBounceCounts({ scanned: 3.8, flagged: -1, bad: "x" })).toEqual({
      scanned: 3, flagged: 0, alreadyKnown: 0, ignoredTemporary: 0, ignored: 0, uncorrelated: 0, errors: 0,
    })
    expect(uncorrelatedInLastDay({
      uncorrelatedRuns: [
        { at: "2026-11-19T11:45:00Z", count: 2 },
        { at: "2026-11-19T07:00:00Z", count: 5 },
        { at: "2026-11-17T07:00:00Z", count: 9 },
      ],
    }, now)).toBe(5)
    expect(uncorrelatedInLastDay(null, now)).toBe(0)
  })
})
