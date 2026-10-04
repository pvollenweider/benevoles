// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Super-admin health page (#383): how each fact reads as ok / warn / error, with a plain sentence.
 * Pure; the loader gathers the facts (database, outbox, job runs, migrations, configuration).
 */

export type HealthLevel = "ok" | "warn" | "error" | "unknown"
export type HealthItem = { id: string; label: string; level: HealthLevel; detail: string }

export const LEVEL_LABELS: Record<HealthLevel, string> = { ok: "OK", warn: "À surveiller", error: "Problème", unknown: "Inconnu" }

const HOUR = 3_600_000
const DAY = 24 * HOUR

export function ago(from: Date, now: Date): string {
  const ms = now.getTime() - from.getTime()
  if (ms < HOUR) return `il y a ${Math.max(1, Math.round(ms / 60_000))} min`
  if (ms < DAY) return `il y a ${Math.round(ms / HOUR)} h`
  const days = Math.round(ms / DAY)
  return `il y a ${days} jour${days > 1 ? "s" : ""}`
}

export type JobRunFacts = {
  job: string
  startedAt: Date
  finishedAt: Date | null
  ok: boolean | null
  error: string | null
}

/** Cron jobs: last success within `maxAgeHours`, or something is wrong with the scheduler or the job. */
export function assessJob(label: string, run: JobRunFacts | null | undefined, now: Date, maxAgeHours: number): HealthItem {
  const id = `job:${label}`
  if (!run) return { id, label, level: "unknown", detail: "Jamais exécuté (ou pas encore de battement de cœur)." }
  if (run.finishedAt === null) {
    const stale = now.getTime() - run.startedAt.getTime() > 2 * HOUR
    return { id, label, level: stale ? "error" : "ok", detail: stale ? `Démarré ${ago(run.startedAt, now)} et jamais terminé.` : `En cours depuis ${ago(run.startedAt, now)}.` }
  }
  const age = now.getTime() - run.finishedAt.getTime()
  if (run.ok === false) return { id, label, level: "error", detail: `Dernière exécution en échec ${ago(run.finishedAt, now)}${run.error ? ` : ${run.error}` : "."}` }
  if (age > maxAgeHours * HOUR) return { id, label, level: "error", detail: `Dernier succès ${ago(run.finishedAt, now)} ; attendu toutes les ${maxAgeHours} h.` }
  return { id, label, level: "ok", detail: `Dernier succès ${ago(run.finishedAt, now)}.` }
}

/** The restore test is manual and monthly: a warning past 45 days, a problem past 90. */
export function assessRestoreTest(run: JobRunFacts | null | undefined, now: Date): HealthItem {
  const id = "job:restore-test"
  const label = "Test de restauration"
  if (!run?.finishedAt) return { id, label, level: "warn", detail: "Jamais enregistré : à faire, puis à signaler avec le battement de cœur « restore-test »." }
  const days = Math.floor((now.getTime() - run.finishedAt.getTime()) / DAY)
  if (run.ok === false) return { id, label, level: "error", detail: `Le dernier test a échoué ${ago(run.finishedAt, now)}.` }
  if (days > 90) return { id, label, level: "error", detail: `Dernier test ${ago(run.finishedAt, now)} : plus de 90 jours.` }
  if (days > 45) return { id, label, level: "warn", detail: `Dernier test ${ago(run.finishedAt, now)} : à refaire ce mois.` }
  return { id, label, level: "ok", detail: `Dernier test ${ago(run.finishedAt, now)}.` }
}

export type OutboxFacts = { failedLastDay: number; oldestPendingMinutes: number | null; staleClaims: number; healthy: boolean }

export function assessOutbox(o: OutboxFacts): HealthItem {
  const id = "outbox"
  const label = "File d'envoi des emails"
  if (o.healthy) return { id, label, level: "ok", detail: o.oldestPendingMinutes === null ? "Rien en attente." : `Plus ancien en attente : ${o.oldestPendingMinutes} min.` }
  const parts: string[] = []
  if (o.failedLastDay > 0) parts.push(`${o.failedLastDay} échec${o.failedLastDay > 1 ? "s" : ""} définitif${o.failedLastDay > 1 ? "s" : ""} en 24 h`)
  if (o.staleClaims > 0) parts.push(`${o.staleClaims} envoi${o.staleClaims > 1 ? "s" : ""} bloqué${o.staleClaims > 1 ? "s" : ""}`)
  if (o.oldestPendingMinutes !== null && o.oldestPendingMinutes > 15) parts.push(`en attente depuis ${o.oldestPendingMinutes} min`)
  return { id, label, level: o.failedLastDay > 0 || o.staleClaims > 0 ? "error" : "warn", detail: `${parts.join(", ")}.` }
}

export function assessDatabase(latencyMs: number | null): HealthItem {
  const id = "database"
  const label = "Base de données"
  if (latencyMs === null) return { id, label, level: "error", detail: "Injoignable." }
  return { id, label, level: latencyMs > 500 ? "warn" : "ok", detail: `Répond en ${latencyMs} ms.` }
}

export type ConfigFacts = { smtp: boolean; push: boolean; cronSecret: boolean; tokenEncryption: boolean; sentry: boolean }

export function assessConfig(c: ConfigFacts): HealthItem[] {
  return [
    { id: "config:smtp", label: "Envoi d'emails (SMTP)", level: c.smtp ? "ok" : "error", detail: c.smtp ? "Configuré." : "SMTP_HOST manquant : aucun email ne part." },
    { id: "config:push", label: "Notifications push (VAPID)", level: c.push ? "ok" : "warn", detail: c.push ? "Configuré." : "Clés VAPID absentes : rappels par email seulement." },
    { id: "config:cron", label: "Secret des tâches planifiées", level: c.cronSecret ? "ok" : "error", detail: c.cronSecret ? "Configuré." : "CRON_SECRET manquant : les tâches planifiées sont refusées en production." },
    { id: "config:tokens", label: "Chiffrement des liens personnels", level: c.tokenEncryption ? "ok" : "warn", detail: c.tokenEncryption ? "Configuré." : "TOKEN_ENCRYPTION_KEY absente : liens stockés en clair." },
    { id: "config:sentry", label: "Remontée d'erreurs (Sentry)", level: c.sentry ? "ok" : "warn", detail: c.sentry ? "Configuré." : "Pas de DSN : erreurs visibles dans les journaux seulement." },
  ]
}

export type ReleaseCheckFacts = { enabled: boolean; latestVersion: string | null; lastCheckedAt: Date | null; isNewer: boolean }

/** Self-hosted release check (#612): latest known release, when it was last checked, or that it's off. */
export function assessReleaseCheck(f: ReleaseCheckFacts, currentVersion: string, now: Date): HealthItem {
  const id = "release"
  const label = "Nouvelle version"
  if (!f.enabled) return { id, label, level: "unknown", detail: "Vérification désactivée (RELEASE_CHECK=off)." }
  if (!f.lastCheckedAt) return { id, label, level: "unknown", detail: "Jamais vérifié." }
  if (!f.latestVersion) return { id, label, level: "unknown", detail: `Vérifié ${ago(f.lastCheckedAt, now)}, aucune version publiée trouvée.` }
  if (f.isNewer) return { id, label, level: "warn", detail: `${f.latestVersion} disponible (vous utilisez ${currentVersion}) ; vérifié ${ago(f.lastCheckedAt, now)}.` }
  return { id, label, level: "ok", detail: `À jour (${f.latestVersion}) ; vérifié ${ago(f.lastCheckedAt, now)}.` }
}

export type MigrationFacts = { applied: number; lastName: string | null; lastAt: Date | null; pending: number }

export function assessMigrations(m: MigrationFacts): HealthItem {
  const id = "migrations"
  const label = "Migrations de la base"
  if (m.pending > 0) return { id, label, level: "error", detail: `${m.pending} migration${m.pending > 1 ? "s" : ""} du code pas encore appliquée${m.pending > 1 ? "s" : ""} (${m.applied} appliquées).` }
  return { id, label, level: "ok", detail: `${m.applied} appliquées, dernière : ${m.lastName ?? "—"}.` }
}

/** The worst level of a list, for the page headline. */
export function worstLevel(items: HealthItem[]): HealthLevel {
  const rank: Record<HealthLevel, number> = { ok: 0, unknown: 1, warn: 2, error: 3 }
  return items.reduce<HealthLevel>((w, i) => (rank[i.level] > rank[w] ? i.level : w), "ok")
}

export function healthHeadline(items: HealthItem[]): string {
  const errors = items.filter((i) => i.level === "error").length
  const warns = items.filter((i) => i.level === "warn").length
  if (errors > 0) return `${errors} problème${errors > 1 ? "s" : ""} à traiter${warns ? `, ${warns} point${warns > 1 ? "s" : ""} à surveiller` : ""}.`
  if (warns > 0) return `Rien de bloquant ; ${warns} point${warns > 1 ? "s" : ""} à surveiller.`
  return "Tout est en ordre."
}
