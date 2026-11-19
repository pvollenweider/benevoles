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
    return { id, label, level: stale ? "error" : "ok", detail: stale ? `Démarré ${ago(run.startedAt, now)} et jamais terminé.` : `En cours, démarré ${ago(run.startedAt, now)}.` }
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

export type OutboxFacts = {
  failedLastDay: number
  recipientFailuresLastDay: number
  otherFailuresLastDay: number
  oldestPendingMinutes: number | null
  staleClaims: number
  healthy: boolean
}

/** « 3 adresses refusées… » : the recipient's address is wrong, not the platform. */
function recipientFailuresDetail(n: number): string {
  return `${n} adresse${n > 1 ? "s" : ""} refusée${n > 1 ? "s" : ""} par le destinataire en 24 h (domaine ou boîte inexistants, souvent une faute de frappe)`
}

function otherFailuresDetail(n: number): string {
  return `${n} échec${n > 1 ? "s" : ""} définitif${n > 1 ? "s" : ""} en 24 h`
}

export function assessOutbox(o: OutboxFacts): HealthItem {
  const id = "outbox"
  const label = "File d'envoi des emails"
  if (o.healthy && o.recipientFailuresLastDay === 0) {
    return { id, label, level: "ok", detail: o.oldestPendingMinutes === null ? "Rien en attente." : `Plus ancien en attente : ${o.oldestPendingMinutes} min.` }
  }
  const parts: string[] = []
  if (o.otherFailuresLastDay > 0) parts.push(otherFailuresDetail(o.otherFailuresLastDay))
  if (o.recipientFailuresLastDay > 0) parts.push(recipientFailuresDetail(o.recipientFailuresLastDay))
  if (o.staleClaims > 0) parts.push(`${o.staleClaims} envoi${o.staleClaims > 1 ? "s" : ""} bloqué${o.staleClaims > 1 ? "s" : ""}`)
  if (o.oldestPendingMinutes !== null && o.oldestPendingMinutes > 15) parts.push(`en attente depuis ${o.oldestPendingMinutes} min`)
  const level: HealthLevel = o.otherFailuresLastDay > 0 || o.staleClaims > 0 ? "error" : "warn"
  return { id, label, level, detail: `${parts.join(", ")}.` }
}

export type DeferredBounceCounts = {
  scanned: number
  flagged: number
  alreadyKnown: number
  ignoredTemporary: number
  ignored: number
  uncorrelated: number
  errors: number
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

/** The counts stored in the JobRun summary by src/lib/bounce-mailbox.ts, tolerant of old/absent JSON. */
export function deferredBounceCounts(summary: unknown): DeferredBounceCounts {
  const s = (summary ?? {}) as Record<string, unknown>
  return {
    scanned: countOf(s.scanned),
    flagged: countOf(s.flagged),
    alreadyKnown: countOf(s.alreadyKnown),
    ignoredTemporary: countOf(s.ignoredTemporary),
    ignored: countOf(s.ignored),
    uncorrelated: countOf(s.uncorrelated),
    errors: countOf(s.errors),
  }
}

/**
 * High-water mark of uncorrelated messages over the runs of the last 24 h. Uncorrelated messages
 * are left in the inbox, so every run sees them again: the largest recent count is the useful
 * figure, not the sum (which would increase by the same message every 15 minutes).
 */
export function uncorrelatedInLastDay(summary: unknown, now: Date): number {
  const raw = (summary as { uncorrelatedRuns?: unknown } | null)?.uncorrelatedRuns
  if (!Array.isArray(raw)) return 0
  const cutoff = now.getTime() - DAY
  let max = 0
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const at = (entry as { at?: unknown }).at
    const count = (entry as { count?: unknown }).count
    if (typeof at !== "string" || typeof count !== "number" || !Number.isFinite(count) || count < 0) continue
    const time = Date.parse(at)
    if (!Number.isFinite(time) || time < cutoff) continue
    max = Math.max(max, Math.floor(count))
  }
  return max
}

export type DeferredBounceFacts = {
  configured: boolean
  run: (JobRunFacts & { summary?: unknown }) | null | undefined
}

/** « Rejets différés » (#602): not configured, last run and counts, or an error/stale run to look at. */
export function assessDeferredBounces(f: DeferredBounceFacts, now: Date): HealthItem {
  const id = "deferred-bounces"
  const label = "Rejets différés"
  if (!f.configured) {
    return { id, label, level: "unknown", detail: "Inconnu : la boîte des avis de non-remise n'est pas configurée, les rejets différés ne sont pas lus." }
  }
  const run = f.run
  if (!run) return { id, label, level: "warn", detail: "Aucun passage enregistré depuis la configuration." }
  if (run.finishedAt === null) {
    const stale = now.getTime() - run.startedAt.getTime() > 2 * HOUR
    return { id, label, level: stale ? "error" : "ok", detail: stale ? `Démarré ${ago(run.startedAt, now)} et jamais terminé.` : `En cours, démarré ${ago(run.startedAt, now)}.` }
  }
  if (run.ok === false) {
    return { id, label, level: "error", detail: `Dernière exécution en échec ${ago(run.finishedAt, now)}${run.error ? ` : ${run.error}` : "."}` }
  }

  const counts = deferredBounceCounts(run.summary)
  // One noun, then only the non-zero kinds: six bare numbers say nothing when read aloud.
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`
  const kinds = [
    counts.flagged > 0 ? plural(counts.flagged, "signalé") : null,
    counts.alreadyKnown > 0 ? `${counts.alreadyKnown} déjà connu${counts.alreadyKnown > 1 ? "s" : ""}` : null,
    counts.ignoredTemporary > 0 ? `${counts.ignoredTemporary} avis temporaire${counts.ignoredTemporary > 1 ? "s" : ""}` : null,
    counts.uncorrelated > 0 ? plural(counts.uncorrelated, "non rattaché") : null,
    counts.ignored > 0 ? plural(counts.ignored, "ignoré") : null,
  ].filter((part): part is string => part !== null)
  const countsText = `${counts.scanned} avis analysé${counts.scanned > 1 ? "s" : ""}${kinds.length > 0 ? ` : ${kinds.join(", ")}` : ""}`
  const age = now.getTime() - run.finishedAt.getTime()
  if (age > HOUR) {
    return { id, label, level: "warn", detail: `Dernier succès ${ago(run.finishedAt, now)} ; attendu toutes les 15 min.` }
  }
  if (counts.errors > 0) {
    return { id, label, level: "warn", detail: `Dernier passage ${ago(run.finishedAt, now)} : ${countsText}, ${counts.errors} erreur${counts.errors > 1 ? "s" : ""}.` }
  }
  const uncorrelated = uncorrelatedInLastDay(run.summary, now)
  if (uncorrelated > 0) {
    return {
      id,
      label,
      level: "warn",
      detail: `Dernier passage ${ago(run.finishedAt, now)} : ${countsText}. ${uncorrelated} message${uncorrelated > 1 ? "s" : ""} non rattaché${uncorrelated > 1 ? "s" : ""} en 24 h.`,
    }
  }
  return { id, label, level: "ok", detail: `Dernier passage ${ago(run.finishedAt, now)} : ${countsText}.` }
}

/** Spaces awaiting the operator's validation (#810): fine while young, to look at after 24 hours. */
export function assessPendingSpaces(createdAts: readonly Date[], now: Date): HealthItem {
  const id = "pending-spaces"
  const label = "Espaces en attente de validation"
  const n = createdAts.length
  if (n === 0) return { id, label, level: "ok", detail: "Aucun." }
  const late = createdAts.filter((d) => now.getTime() - d.getTime() > 24 * 60 * 60 * 1000).length
  const head = `${n} en attente`
  return late > 0
    ? { id, label, level: "warn", detail: `${head}, dont ${late} depuis plus de 24 heures.` }
    : { id, label, level: "ok", detail: `${head}.` }
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
