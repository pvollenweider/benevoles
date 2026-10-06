// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** New local database only; never migrate an existing unmarked database. */
import { Client } from "pg"
import { spawn } from "node:child_process"
import path from "node:path"

async function main() {
  const copy = process.argv[2]
  if (copy && !/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(copy)) throw new Error("Only the disposable compiled video project is accepted")
  const project = copy ? path.resolve(copy) : process.cwd()
  const source = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname) || source.port !== "45433" || source.pathname !== "/benevoles_video") throw new Error("Dedicated local video PostgreSQL required")
  const target = new URL(source)
  target.pathname = "/benevoles_video_operator"
  const maintenance = new URL(source)
  maintenance.pathname = "/postgres"
  const admin = new Client({ connectionString: maintenance.href })
  let created = false
  await admin.connect()
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", ["benevoles_video_operator"])
    if (!existing.rowCount) {
      await admin.query('CREATE DATABASE "benevoles_video_operator"')
      created = true
    }
  } finally { await admin.end() }
  const db = new Client({ connectionString: target.href })
  await db.connect()
  try {
    if (!created) {
      const marker = await db.query("SELECT to_regclass('public._video_operator_fixture') IS NOT NULL AS present")
      if (!marker.rows[0].present) throw new Error("Existing operator database is not marked as this video fixture; refusing to migrate")
      const ownership = await db.query("SELECT purpose FROM public._video_operator_fixture")
      if (ownership.rowCount !== 1 || ownership.rows[0].purpose !== "benevol-masterclass-53-synthetic-only") throw new Error("Operator fixture marker differs")
    }
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(project, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: project, env: { ...process.env, DATABASE_URL: target.href }, stdio: "inherit" })
      child.on("error", reject)
      child.on("exit", result => resolve(result ?? 1))
    })
    if (code) throw new Error("Local operator migrations failed; no seed run")
    if (created) {
      await db.query("CREATE TABLE public._video_operator_fixture (purpose text PRIMARY KEY)")
      await db.query("INSERT INTO public._video_operator_fixture (purpose) VALUES ($1)", ["benevol-masterclass-53-synthetic-only"])
    }
    console.log("✓ Separate synthetic operator video database provisioned; other video database untouched")
  } finally { await db.end() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operator video provisioning failed"); process.exitCode = 1 })
