// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findReleaseState: vi.fn(),
  findPendingOrgs: vi.fn(),
  loadServerMetrics: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    releaseCheckState: { findUnique: mocks.findReleaseState },
    organization: { findMany: mocks.findPendingOrgs },
  },
}))
vi.mock("@/lib/env", () => ({
  env: { GIT_SHA: null, VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, CRON_SECRET: undefined, TOKEN_ENCRYPTION_KEY: undefined },
  releaseCheckEnabled: () => false,
}))
vi.mock("@/lib/notifications/outbox", () => ({ outboxHealth: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/job-runs", () => ({ JOBS: {}, loadJobRuns: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/server-metrics-data", () => ({ loadServerMetrics: mocks.loadServerMetrics }))

import { loadHealth } from "../health-data"

// A failed resource probe must not borrow the « fichiers cgroup absents » cause: the page says a
// neutral « mesure impossible » (#1415).

describe("loadHealth server section", () => {
  it("uses a neutral reason when loadServerMetrics throws", async () => {
    mocks.queryRaw.mockResolvedValue([])
    mocks.findReleaseState.mockResolvedValue(null)
    mocks.findPendingOrgs.mockResolvedValue([])
    mocks.loadServerMetrics.mockRejectedValue(new Error("probe broke"))

    const { items } = await loadHealth(new Date("2026-11-19T08:00:00Z"))

    const server = items.filter((item) => item.id.startsWith("server:"))
    expect(server.map((item) => item.id)).toEqual(["server:memory", "server:cpu", "server:event-loop", "server:uptime", "server:database"])
    expect(server.every((item) => item.level === "unknown")).toBe(true)
    expect(server.every((item) => item.detail === "Non disponible (mesure impossible).")).toBe(true)
    expect(server.some((item) => item.detail.includes("fichiers cgroup absents"))).toBe(false)
  })
})
