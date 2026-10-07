// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { realpath } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { register } from "tsx/cjs/api"
import { verifyProductBuild } from "./product-build"

export type CurrentVideoBase = "http://localhost:43102" | "http://localhost:43106" | "http://localhost:43108" | "http://localhost:43110" | "http://localhost:43112" | "http://localhost:43114"
const bases = new Set<string>(["http://localhost:43102", "http://localhost:43106", "http://localhost:43108", "http://localhost:43110", "http://localhost:43112", "http://localhost:43114"])

/** Pure guards run before proof lookup or imports. Never accepts production. */
export function assertCurrentVideoPrismaEnvironment(base: string, databaseUrl: string | undefined, nodeEnv: string | undefined) {
  assert(bases.has(base), "Current video Prisma requires an exact approved local video URL")
  assert.equal(nodeEnv, "production", "Never reuse a development Prisma singleton")
  const database = new URL(databaseUrl ?? "")
  assert(database.protocol === "postgresql:" || database.protocol === "postgres:", "PostgreSQL video database required")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) && database.port === "45433" && database.pathname === "/benevoles_video", "Isolated video database required")
}

/** Reject root paths and broad tmp paths independently of the server proof. */
export function assertCurrentVideoSnapshot(snapshot: string) {
  assert(/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(snapshot), "Dedicated verified product snapshot required")
}

/** Only loads Prisma from the proven clean main build; performs no DB query. */
export async function loadCurrentVideoPrisma(base: CurrentVideoBase) {
  assertCurrentVideoPrismaEnvironment(base, process.env.DATABASE_URL, process.env.NODE_ENV)
  const product = await verifyProductBuild(base)
  assertCurrentVideoSnapshot(product.snapshot)
  const snapshot = await realpath(product.snapshot)
  assertCurrentVideoSnapshot(snapshot)
  const namespace = `video-prisma-${randomUUID()}`
  const previousConfig = process.env.TSX_TSCONFIG_PATH
  process.env.TSX_TSCONFIG_PATH = path.join(snapshot, "tsconfig.json")
  // register() with a namespace returns a scoped loader; ReturnType only sees the last overload.
  let loader: ReturnType<typeof register> & { require: (id: string, fromFile: string | URL) => ReturnType<typeof import("tsx/cjs/api").require>; resolve: (id: string, fromFile: string | URL) => string; unregister: () => void }
  // tsx CJS snapshots this config synchronously. Restore it before imports so
  // unrelated loaders keep their own configuration; do not use tsImport's CJS
  // fallback, which ignores its tsconfig option in this installed version.
  try { loader = register({ namespace }) }
  finally {
    if (previousConfig === undefined) delete process.env.TSX_TSCONFIG_PATH
    else process.env.TSX_TSCONFIG_PATH = previousConfig
  }
  try {
    const parent = path.join(snapshot, "package.json")
    const entry = path.join(snapshot, "src/lib/prisma.ts")
    assert(loader.resolve(entry, parent).startsWith(`${snapshot}/src/`), "Prisma entry escaped the current snapshot")
    const loaded = loader.require(entry, parent)
    assert(loaded.prisma && typeof loaded.prisma.$disconnect === "function", "Current snapshot did not export Prisma")
    for (const file of Object.keys(createRequire(import.meta.url).cache)) {
      if (!file.includes(`namespace=${namespace}`) || !file.includes("/src/") || file.includes("/node_modules/")) continue
      assert(file.startsWith(`${snapshot}/src/`), "Prisma imported an old root product source")
    }
    // The type is only a compile-time convenience for the old tooling checkout;
    // the runtime client's model fields always come from the verified snapshot.
    const tokens = loader.require(path.join(snapshot, "src/lib/token-vault.ts"), parent) as typeof import("../../src/lib/token-vault")
    return { db: loaded.prisma as import("../../src/generated/prisma/client").PrismaClient, tokens, product, unregister: async () => { loader.unregister() } }
  } catch (error) {
    loader.unregister()
    throw error
  }
}
