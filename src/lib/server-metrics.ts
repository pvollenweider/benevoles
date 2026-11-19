// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The application's own server resources for the super-admin health page (#1415): memory and CPU
 * from the pod's cgroup v2 files, event-loop lag, process uptime, database size and open
 * connections. Pure parsing and wording; the file reads and the measurement are in
 * src/lib/server-metrics-data.ts.
 *
 * The app has no access to the Kubernetes API (#1413): no metrics-server, no `kubectl top`. On a
 * local dev machine or Docker Compose without cgroup v2 files, the cgroup figures read
 * « non disponible » instead of failing the page.
 */

import type { HealthItem } from "./health-view"

export type CgroupMemoryFacts = {
  currentBytes: number | null
  /** memory.max in bytes; null when unlimited or unreadable. */
  maxBytes: number | null
  /** memory.max was the literal "max": no memory limit on the container. */
  unlimited: boolean
}

export type ServerMetricFacts = {
  memory: CgroupMemoryFacts
  /** CPU used during the short sample, in percent of one core (can exceed 100 on several cores). */
  cpuPercent: number | null
  cpuSampleMs: number | null
  eventLoop: { meanMs: number | null; maxMs: number | null }
  uptimeSeconds: number | null
  database: { sizeBytes: number | null; connections: number | null }
  /** loadServerMetrics() itself threw: every figure is unknown for a neutral reason, not a cgroup one. */
  measurementFailed: boolean
}

export const UNAVAILABLE_SERVER_METRICS: ServerMetricFacts = {
  memory: { currentBytes: null, maxBytes: null, unlimited: false },
  cpuPercent: null,
  cpuSampleMs: null,
  eventLoop: { meanMs: null, maxMs: null },
  uptimeSeconds: null,
  database: { sizeBytes: null, connections: null },
  measurementFailed: false,
}

/** The whole probe failed, rather than the cgroup files being absent (local dev, Docker Compose). */
export const FAILED_SERVER_METRICS: ServerMetricFacts = { ...UNAVAILABLE_SERVER_METRICS, measurementFailed: true }

/** A cgroup value in bytes ("12345") or null when absent or unreadable. */
export function parseByteCount(raw: string | null | undefined): number | null {
  if (raw == null || !raw.trim()) return null
  const value = Number(raw.trim())
  return Number.isFinite(value) && value >= 0 ? value : null
}

/** memory.max: a byte count, or the literal "max" meaning no limit. */
export function parseCgroupMemoryMax(raw: string | null | undefined): { bytes: number | null; unlimited: boolean } {
  if (raw == null || !raw.trim()) return { bytes: null, unlimited: false }
  if (raw.trim() === "max") return { bytes: null, unlimited: true }
  return { bytes: parseByteCount(raw), unlimited: false }
}

/** usage_usec from a cgroup v2 cpu.stat file ("usage_usec 123456"), or null. */
export function parseCpuUsageUsec(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const match = /^\s*usage_usec\s+(\d+)\s*$/m.exec(raw)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value >= 0 ? value : null
}

/** CPU share of one core between two usage_usec readings. */
export function cpuPercent(beforeUsec: number | null, afterUsec: number | null, elapsedMs: number | null): number | null {
  if (beforeUsec == null || afterUsec == null || elapsedMs == null || elapsedMs <= 0) return null
  const deltaUsec = afterUsec - beforeUsec
  if (!Number.isFinite(deltaUsec) || deltaUsec < 0) return null
  return (deltaUsec / (elapsedMs * 1000)) * 100
}

const BYTE_UNITS = ["o", "ko", "Mo", "Go", "To"] as const

/** A size in French units: « 512 Mo », « 1,5 Go », « 840 o ». */
export function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—"
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)
  return `${number} ${BYTE_UNITS[unit]}`
}

/** A duration of work in milliseconds: « 3 ms », « 0,4 ms ». */
export function formatMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—"
  const digits = ms < 10 ? 1 : 0
  const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(ms)
  return `${number} ms`
}

/** Process uptime in plain French: « 45 s », « 12 min », « 3 h 20 min », « 4 jours ». */
export function formatUptime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return `${days} jour${days > 1 ? "s" : ""}`
}

/** « 31 % », « 7,5 % ». */
export function formatPercent(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return "—"
  const digits = percent < 10 ? 1 : 0
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(percent)} %`
}

const UNAVAILABLE_CGROUP = "Non disponible (fichiers cgroup absents : développement local ou Docker Compose)."
const UNAVAILABLE_MEASUREMENT = "Non disponible (mesure impossible)."

/** On a warning or a problem, name the threshold that was crossed, so the level is not colour alone. */
function thresholdNote(level: string, alert: string, critical: string): string {
  if (level === "warn") return ` ; seuil d'alerte : ${alert}`
  if (level === "error") return ` ; seuil critique : ${critical}`
  return ""
}

/**
 * The « Serveur » rows of the health page. Thresholds are deliberately conservative: a warning
 * above 85 % of the memory limit or 70 % of a core, a problem above 95 % or 90 %; an event loop
 * mean above 50 ms is a warning, above 200 ms a problem. A missing figure is « unknown », never
 * silently green.
 */
export function assessServerMetrics(facts: ServerMetricFacts): HealthItem[] {
  const memory = assessMemory(facts.memory)
  const cpu = assessCpu(facts.cpuPercent, facts.cpuSampleMs)
  const eventLoop = assessEventLoop(facts.eventLoop)
  const uptime = assessUptime(facts.uptimeSeconds)
  const database = assessDatabaseResources(facts.database)
  const items = [memory, cpu, eventLoop, uptime, database]
  if (!facts.measurementFailed) return items
  return items.map((item): HealthItem => ({ ...item, level: "unknown", detail: UNAVAILABLE_MEASUREMENT }))
}

function assessMemory(memory: CgroupMemoryFacts): HealthItem {
  const id = "server:memory"
  const label = "Mémoire de l'application"
  if (memory.currentBytes === null) return { id, label, level: "unknown", detail: UNAVAILABLE_CGROUP }
  if (memory.maxBytes !== null && memory.maxBytes > 0) {
    const percent = (memory.currentBytes / memory.maxBytes) * 100
    const level = percent >= 95 ? "error" : percent >= 85 ? "warn" : "ok"
    return { id, label, level, detail: `${formatBytes(memory.currentBytes)} sur ${formatBytes(memory.maxBytes)} (${formatPercent(percent)})${thresholdNote(level, "85 %", "95 %")}.` }
  }
  if (memory.unlimited) return { id, label, level: "ok", detail: `${formatBytes(memory.currentBytes)} utilisés ; aucune limite de mémoire appliquée au conteneur.` }
  return { id, label, level: "ok", detail: `${formatBytes(memory.currentBytes)} utilisés ; limite inconnue.` }
}

function assessCpu(percent: number | null, sampleMs: number | null): HealthItem {
  const id = "server:cpu"
  const label = "CPU de l'application"
  if (percent === null) return { id, label, level: "unknown", detail: "Non disponible (fichier cgroup cpu.stat absent : développement local ou Docker Compose)." }
  const level = percent >= 90 ? "error" : percent >= 70 ? "warn" : "ok"
  const sample = sampleMs === null ? "" : ` (mesure sur ${sampleMs >= 1000 ? `${Math.round(sampleMs / 1000)} s` : `${Math.round(sampleMs)} ms`})`
  return { id, label, level, detail: `${formatPercent(percent)} d'un cœur${sample}${thresholdNote(level, "70 %", "90 %")}.` }
}

function assessEventLoop(eventLoop: { meanMs: number | null; maxMs: number | null }): HealthItem {
  const id = "server:event-loop"
  const label = "Retard de la boucle d'événements"
  if (eventLoop.meanMs === null) return { id, label, level: "unknown", detail: "Non disponible." }
  const level = eventLoop.meanMs >= 200 ? "error" : eventLoop.meanMs >= 50 ? "warn" : "ok"
  const peak = eventLoop.maxMs === null ? "" : `, pic ${formatMs(eventLoop.maxMs)}`
  return { id, label, level, detail: `Retard moyen ${formatMs(eventLoop.meanMs)}${peak}${thresholdNote(level, "50 ms", "200 ms")}.` }
}

function assessUptime(seconds: number | null): HealthItem {
  const id = "server:uptime"
  const label = "Durée de marche de l'application"
  if (seconds === null) return { id, label, level: "unknown", detail: "Non disponible." }
  return { id, label, level: "ok", detail: `En service depuis ${formatUptime(seconds)}.` }
}

function assessDatabaseResources(database: { sizeBytes: number | null; connections: number | null }): HealthItem {
  const id = "server:database"
  const label = "Taille de la base et connexions"
  if (database.sizeBytes === null && database.connections === null) return { id, label, level: "unknown", detail: "Non disponible." }
  const size = database.sizeBytes === null ? "Taille non disponible" : formatBytes(database.sizeBytes)
  const connections = database.connections === null ? "connexions non disponibles" : `${database.connections} connexion${database.connections > 1 ? "s" : ""} ouverte${database.connections > 1 ? "s" : ""}`
  // A partial reading is never green: one of the two figures is missing.
  const level = database.sizeBytes === null || database.connections === null ? "unknown" : "ok"
  return { id, label, level, detail: `${size} ; ${connections}.` }
}
