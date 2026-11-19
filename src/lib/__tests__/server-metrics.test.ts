// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest"

const fs = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile: fs.readFile }))

const db = vi.hoisted(() => ({ queryRaw: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: db.queryRaw } }))

import {
  assessServerMetrics,
  cpuPercent,
  FAILED_SERVER_METRICS,
  formatBytes,
  formatMs,
  formatPercent,
  formatUptime,
  parseByteCount,
  parseCgroupMemoryMax,
  parseCpuUsageUsec,
  UNAVAILABLE_SERVER_METRICS,
  type ServerMetricFacts,
} from "../server-metrics"
import { loadServerMetrics } from "../server-metrics-data"

// Super-admin health page (#1415): the pod's cgroup files, with a graceful « non disponible » when
// they are absent (local dev, Docker Compose), and the wording of each figure.

const facts = (over: Partial<ServerMetricFacts> = {}): ServerMetricFacts => ({
  memory: { currentBytes: 100 * 1024 * 1024, maxBytes: 1024 * 1024 * 1024, unlimited: false },
  cpuPercent: 12,
  cpuSampleMs: 250,
  eventLoop: { meanMs: 2, maxMs: 15 },
  uptimeSeconds: 3 * 86_400 + 2 * 3_600,
  database: { sizeBytes: 512 * 1024 * 1024, connections: 18 },
  measurementFailed: false,
  ...over,
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("cgroup v2 parsing", () => {
  it("reads byte counts and the literal max of memory.max", () => {
    expect(parseByteCount("12345")).toBe(12_345)
    expect(parseByteCount("0")).toBe(0)
    expect(parseByteCount("abc")).toBeNull()
    expect(parseByteCount(null)).toBeNull()
    expect(parseCgroupMemoryMax("max")).toEqual({ bytes: null, unlimited: true })
    expect(parseCgroupMemoryMax("1073741824")).toEqual({ bytes: 1_073_741_824, unlimited: false })
    expect(parseCgroupMemoryMax(null)).toEqual({ bytes: null, unlimited: false })
  })

  it("reads usage_usec from cpu.stat and ignores missing files", () => {
    expect(parseCpuUsageUsec("usage_usec 123456\nuser_usec 100000\nsystem_usec 23456\n")).toBe(123_456)
    expect(parseCpuUsageUsec("user_usec 100000\n")).toBeNull()
    expect(parseCpuUsageUsec(null)).toBeNull()
  })

  it("computes the CPU share of one core over the sample", () => {
    expect(cpuPercent(1_000, 101_000, 250)).toBe(40)
    expect(cpuPercent(0, 250_000, 250)).toBe(100)
    expect(cpuPercent(null, 1, 250)).toBeNull()
    expect(cpuPercent(10, 5, 250)).toBeNull()
    expect(cpuPercent(0, 100, 0)).toBeNull()
  })
})

describe("server metric wording", () => {
  it("formats sizes, durations and percentages in French", () => {
    expect(formatBytes(512 * 1024 * 1024)).toBe("512 Mo")
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1,5 Go")
    expect(formatBytes(840)).toBe("840 o")
    expect(formatMs(3.4)).toBe("3,4 ms")
    expect(formatUptime(45)).toBe("45 s")
    expect(formatUptime(12 * 60)).toBe("12 min")
    expect(formatUptime(3 * 3600 + 20 * 60)).toBe("3 h 20 min")
    expect(formatUptime(4 * 86_400)).toBe("4 jours")
    expect(formatPercent(31.4)).toBe("31 %")
  })

  it("reports every missing figure as unknown, never green", () => {
    const items = assessServerMetrics(UNAVAILABLE_SERVER_METRICS)
    expect(items.map((item) => item.id)).toEqual(["server:memory", "server:cpu", "server:event-loop", "server:uptime", "server:database"])
    expect(items.every((item) => item.level === "unknown")).toBe(true)
    expect(items[0].detail).toContain("fichiers cgroup absents")
  })

  it("shows memory, CPU, event loop, uptime and database values with thresholds", () => {
    const items = assessServerMetrics(facts())
    expect(items.map((item) => item.level)).toEqual(["ok", "ok", "ok", "ok", "ok"])
    expect(items[0].detail).toBe("100 Mo sur 1 Go (9,8 %).")
    expect(items[1].detail).toBe("12 % d'un cœur (mesure sur 250 ms).")
    expect(items[2].detail).toBe("Retard moyen 2 ms, pic 15 ms.")
    expect(items[3].detail).toBe("En service depuis 3 jours.")
    expect(items[4].detail).toBe("512 Mo ; 18 connexions ouvertes.")

    const memoryWarn = assessServerMetrics(facts({ memory: { currentBytes: 900 * 1024 * 1024, maxBytes: 1024 * 1024 * 1024, unlimited: false } }))[0]
    expect(memoryWarn.level).toBe("warn")
    expect(memoryWarn.detail).toContain("seuil d'alerte : 85 %")
    const memoryError = assessServerMetrics(facts({ memory: { currentBytes: 990 * 1024 * 1024, maxBytes: 1024 * 1024 * 1024, unlimited: false } }))[0]
    expect(memoryError.level).toBe("error")
    expect(memoryError.detail).toContain("seuil critique : 95 %")

    const cpuWarn = assessServerMetrics(facts({ cpuPercent: 75 }))[1]
    expect(cpuWarn.level).toBe("warn")
    expect(cpuWarn.detail).toContain("seuil d'alerte : 70 %")
    const cpuError = assessServerMetrics(facts({ cpuPercent: 95 }))[1]
    expect(cpuError.level).toBe("error")
    expect(cpuError.detail).toContain("seuil critique : 90 %")

    const loopWarn = assessServerMetrics(facts({ eventLoop: { meanMs: 60, maxMs: 300 } }))[2]
    expect(loopWarn.level).toBe("warn")
    expect(loopWarn.detail).toContain("seuil d'alerte : 50 ms")
    const loopError = assessServerMetrics(facts({ eventLoop: { meanMs: 250, maxMs: 900 } }))[2]
    expect(loopError.level).toBe("error")
    expect(loopError.detail).toContain("seuil critique : 200 ms")
  })

  it("never calls a partial database reading ok", () => {
    const partialSize = assessServerMetrics(facts({ database: { sizeBytes: null, connections: 18 } }))[4]
    expect(partialSize.level).toBe("unknown")
    expect(partialSize.detail).toBe("Taille non disponible ; 18 connexions ouvertes.")

    const partialConnections = assessServerMetrics(facts({ database: { sizeBytes: 512 * 1024 * 1024, connections: null } }))[4]
    expect(partialConnections.level).toBe("unknown")
    expect(partialConnections.detail).toBe("512 Mo ; connexions non disponibles.")
  })

  it("uses a neutral reason when the whole measurement failed", () => {
    const items = assessServerMetrics(FAILED_SERVER_METRICS)
    expect(items.every((item) => item.level === "unknown")).toBe(true)
    expect(items.every((item) => item.detail === "Non disponible (mesure impossible).")).toBe(true)
    expect(items.some((item) => item.detail.includes("fichiers cgroup absents"))).toBe(false)
  })

  it("says when memory.max is max, without inventing a percentage", () => {
    const item = assessServerMetrics(facts({ memory: { currentBytes: 200 * 1024 * 1024, maxBytes: null, unlimited: true } }))[0]
    expect(item.level).toBe("ok")
    expect(item.detail).toBe("200 Mo utilisés ; aucune limite de mémoire appliquée au conteneur.")
  })
})

describe("loadServerMetrics", () => {
  it("returns non-disponible cgroup figures when the files are absent, and keeps the database", async () => {
    fs.readFile.mockRejectedValue(Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }))
    db.queryRaw.mockResolvedValue([{ size_bytes: BigInt(123_456), connections: 4 }])
    const loaded = await loadServerMetrics()
    expect(loaded.memory).toEqual({ currentBytes: null, maxBytes: null, unlimited: false })
    expect(loaded.cpuPercent).toBeNull()
    expect(loaded.cpuSampleMs).toBeGreaterThan(0)
    expect(loaded.uptimeSeconds).toBeGreaterThan(0)
    expect(loaded.database).toEqual({ sizeBytes: 123_456, connections: 4 })
    expect(loaded.measurementFailed).toBe(false)
    expect(assessServerMetrics(loaded)[0].detail).toContain("Non disponible")
  })

  it("reads memory.current, memory.max=max and two cpu.stat samples", async () => {
    let cpuReads = 0
    fs.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith("/memory.current")) return "104857600"
      if (path.endsWith("/memory.max")) return "max"
      if (path.endsWith("/cpu.stat")) {
        cpuReads += 1
        return cpuReads === 1 ? "usage_usec 1000\n" : "usage_usec 101000\n"
      }
      throw new Error(`unexpected path ${path}`)
    })
    db.queryRaw.mockResolvedValue([{ size_bytes: BigInt(1_000_000), connections: 2 }])
    const loaded = await loadServerMetrics()
    expect(loaded.memory).toEqual({ currentBytes: 104_857_600, maxBytes: null, unlimited: true })
    expect(loaded.cpuPercent).toBeGreaterThan(20)
    expect(loaded.eventLoop.meanMs).not.toBeNull()
    expect(loaded.uptimeSeconds).not.toBeNull()
    expect(loaded.database).toEqual({ sizeBytes: 1_000_000, connections: 2 })
  })
})
