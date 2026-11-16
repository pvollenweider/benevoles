// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Canonical documentation fixture isolated from every in-flight video fixture. */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile, open } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { Client } from "pg"
async function main() {
  const source = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(source.hostname) && source.port === "45433" && source.pathname === "/benevoles_video")
  const snapshot = "/tmp/benevoles-video-production.DjebK9ng"
  const product = JSON.parse(await readFile(path.join(snapshot, ".video-build.json"), "utf8"))
  assert(product.commit === "e8ed666a48294d77213f8bf64fe35898314b0ed9" && product.buildId === "HO6mRRAZuOevekAmdhN_C" && product.snapshot === snapshot)
  const port = 43116, databaseName = "benevoles_video_docs_batch41"
  const probe = createServer()
  await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve) })
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  const adminUrl = new URL(source); adminUrl.pathname = "/postgres"
  const db = new Client({ connectionString: adminUrl.href }); await db.connect()
  let resume = false
  try {
    resume = (await db.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName])).rowCount !== 0
    if (resume) assert(process.argv.includes("--resume-owned"), "Existing documentation database requires an explicit owned resume")
    else await db.query('CREATE DATABASE "benevoles_video_docs_batch41"')
  } finally { await db.end() }
  const target = new URL(source); target.pathname = `/${databaseName}`
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: target.href, ORG_ADMIN_EMAIL: "elodie.rochat@example.org", NODE_ENV: "test", TOKEN_ENCRYPTION_KEY: createHash("sha256").update("benevol-local-video-fixture-only-never-production").digest("base64"), TOKEN_ENCRYPTION_KEY_ID: "local-video-fixture", TOKEN_ENCRYPTION_PREVIOUS_KEYS: "", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" }
  const run = (command: string, args: string[]) => new Promise<void>((resolve, reject) => { const child = spawn(command, args, { cwd: snapshot, env, stdio: "inherit" }); child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Documentation command failed (${code})`))) })
  if (resume) {
    const fixture = new Client({ connectionString: target.href }); await fixture.connect()
    try {
      const organizations = (await fixture.query('SELECT "id", "slug", "name" FROM "Organization"')).rows
      assert(organizations.length === 1 && organizations[0].id === "default" && organizations[0].slug === "default" && organizations[0].name === "Fêtes de Montvert")
      const people = (await fixture.query('SELECT "email" FROM "Volunteer"')).rows
      assert(people.length === 27 && people.every(p => typeof p.email === "string" && p.email.endsWith("@example.org")), "Only canonical synthetic documentation members may be resumed")
      const admins = (await fixture.query('SELECT "email" FROM "AdminUser"')).rows
      assert(admins.some(a => a.email === "elodie.rochat@example.org") && admins.every(a => a.email === "admin@localhost" || a.email.endsWith("@example.org")))
    } finally { await fixture.end() }
  } else {
    await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"])
    await run(process.execPath, ["--import", "tsx", "prisma/seed.ts"])
    await run(process.execPath, ["--import", "tsx", "scripts/seed-demo.ts"])
  }
  const log = await open("/tmp/batch41-docs-server-43116.log", "a")
  const server = spawn(process.execPath, [path.join(snapshot, ".next/standalone/server.js")], { cwd: path.join(snapshot, ".next/standalone"), env: { ...env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port), NEXTAUTH_URL: `http://localhost:${port}`, NEXT_PUBLIC_APP_URL: `http://localhost:${port}`, SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false" }, stdio: ["ignore", log.fd, log.fd] })
  try {
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) { try { if ((await fetch(`http://localhost:${port}/admin/login`)).ok) { ready = true; break } } catch {} await new Promise(resolve => setTimeout(resolve, 250)) }
    assert(ready, "Own documentation server did not become ready")
    Object.assign(env, { BASE_URL: `http://localhost:${port}`, ONLY: "admin-reminders,admin-print,admin-event-archive,admin-members,admin-members-bulk-delete", LANG: "fr_CH.UTF-8", LC_ALL: "fr_CH.UTF-8" })
    await run("npm", ["run", "screenshots"])
    await writeFile("videos/evidence/batch41/doc-captures-isolated.json", JSON.stringify({ capturedAt: new Date().toISOString(), product, databaseName, port, ownServerPid: server.pid, command: `ONLY=${env.ONLY} npm run screenshots`, note: "New isolated database, canonical seed only, all five captures completed. No video fixture reset. Server stopped by its owned child handle afterwards." }, null, 2) + "\n")
  } finally { server.kill("SIGTERM"); await log.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Documentation capture failed"); process.exitCode = 1 })
