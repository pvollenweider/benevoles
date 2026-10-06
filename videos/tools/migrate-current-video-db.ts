// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Apply the current product migrations only to the disposable video database. */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import path from "node:path"

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(database.hostname) && database.port === "45433" && database.pathname === "/benevoles_video", "Only the disposable local video database is accepted")
  const copy = path.resolve(process.argv[2] ?? "")
  assert(/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(copy), "Explicit isolated product copy required")
  const cli = path.join(copy, "node_modules/prisma/build/index.js")
  await access(cli)
  const child = spawn(process.execPath, [cli, "migrate", "deploy", "--config", path.join(copy, "prisma.config.ts")], { cwd: copy, env: process.env, stdio: "inherit" })
  child.on("error", () => { console.error("Local migration process failed to start"); process.exitCode = 1 })
  child.on("exit", code => { process.exitCode = code ?? 1 })
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local video migration failed"); process.exitCode = 1 })
