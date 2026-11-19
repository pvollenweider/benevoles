// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reads the pod's own resource figures for the super-admin health page (#1415). No Kubernetes API
 * (#1413): memory and CPU come from the cgroup v2 files, the event-loop lag from a short
 * measurement, and the database figures from PostgreSQL itself. Every probe is optional: a missing
 * file (local dev, Docker Compose) or a failing query yields « non disponible », never a failed
 * health page. The whole read is time-boxed by the fixed 250 ms measurement.
 */

import { readFile } from "node:fs/promises"
import { monitorEventLoopDelay, performance } from "node:perf_hooks"
import { prisma } from "./prisma"
import {
  cpuPercent,
  parseByteCount,
  parseCgroupMemoryMax,
  parseCpuUsageUsec,
  type ServerMetricFacts,
} from "./server-metrics"

/** cgroup v2 mount point of the container (the app's own files, not the host's). */
export const CGROUP_ROOT = "/sys/fs/cgroup"
/** Length of the CPU and event-loop sample; short enough for a page load. */
export const SERVER_METRIC_SAMPLE_MS = 250
/** A database figure that takes longer than this is reported as unavailable, not waited on. */
export const SERVER_METRIC_QUERY_TIMEOUT_MS = 1000

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The first of the two, with the timer cleared so a fast query leaves nothing behind. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

async function loadDatabaseResources(): Promise<{ sizeBytes: number | null; connections: number | null }> {
  const [row] = await prisma.$queryRaw<{ size_bytes: bigint | number | string; connections: number | string }[]>`
    SELECT pg_database_size(current_database()) AS size_bytes,
           (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections
  `
  if (!row) return { sizeBytes: null, connections: null }
  const sizeBytes = Number(row.size_bytes)
  const connections = Number(row.connections)
  return {
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    connections: Number.isFinite(connections) ? connections : null,
  }
}

/** Memory/CPU from cgroup v2, event-loop lag and uptime, database size and connections. */
export async function loadServerMetrics(): Promise<ServerMetricFacts> {
  const databasePromise = withTimeout(loadDatabaseResources(), SERVER_METRIC_QUERY_TIMEOUT_MS, { sizeBytes: null, connections: null })

  const [memoryCurrentRaw, memoryMaxRaw, cpuBeforeRaw] = await Promise.all([
    readOptional(`${CGROUP_ROOT}/memory.current`),
    readOptional(`${CGROUP_ROOT}/memory.max`),
    readOptional(`${CGROUP_ROOT}/cpu.stat`),
  ])
  const memoryMax = parseCgroupMemoryMax(memoryMaxRaw)
  const memory = {
    currentBytes: parseByteCount(memoryCurrentRaw),
    maxBytes: memoryMax.bytes,
    unlimited: memoryMax.unlimited,
  }
  const before = parseCpuUsageUsec(cpuBeforeRaw)

  const histogram = monitorEventLoopDelay({ resolution: 10 })
  histogram.enable()
  const started = performance.now()
  await delay(SERVER_METRIC_SAMPLE_MS)
  const elapsedMs = performance.now() - started
  histogram.disable()

  const after = before === null ? null : parseCpuUsageUsec(await readOptional(`${CGROUP_ROOT}/cpu.stat`))
  const database = await databasePromise

  const meanMs = Number.isFinite(histogram.mean) ? histogram.mean / 1e6 : null
  const maxMs = Number.isFinite(histogram.max) ? histogram.max / 1e6 : null

  return {
    memory,
    cpuPercent: cpuPercent(before, after, elapsedMs),
    cpuSampleMs: elapsedMs,
    eventLoop: { meanMs, maxMs },
    uptimeSeconds: process.uptime(),
    database,
    measurementFailed: false,
  }
}
