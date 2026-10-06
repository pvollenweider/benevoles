// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Internal-video server: separately marked DB, separate port, local SMTP only. */
import { Client } from "pg"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { access } from "node:fs/promises"
import path from "node:path"

async function main() {
  const source = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname) || source.port !== "45433" || source.pathname !== "/benevoles_video") throw new Error("Dedicated local video PostgreSQL required")
  if (!["localhost", "127.0.0.1", "::1"].includes(process.env.SMTP_HOST ?? "") || process.env.SMTP_PORT !== "41026") throw new Error("Operator videos require local Mailpit SMTP on 41026")
  source.pathname = "/benevoles_video_operator"
  const db = new Client({ connectionString: source.href })
  await db.connect()
  try {
    const marker = await db.query("SELECT purpose FROM public._video_operator_fixture")
    if (marker.rowCount !== 1 || marker.rows[0].purpose !== "benevol-masterclass-53-synthetic-only") throw new Error("Operator database is not marked for our fixture")
  } finally { await db.end() }
  const [mode, ...args] = process.argv.slice(2)
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: source.href, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXTAUTH_URL: "http://localhost:43104", VIDEO_BASE_URL: "http://localhost:43104", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "",
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASSWORD: "",
    EMAIL_FROM: "Bénévoles formation <video.operator.platform@example.org>", EMAIL_REPLY_TO: "video.operator.platform@example.org",
    TOKEN_ENCRYPTION_KEY: createHash("sha256").update("benevol-local-video-fixture-only-never-production").digest("base64"), TOKEN_ENCRYPTION_KEY_ID: "local-video-fixture", TOKEN_ENCRYPTION_PREVIOUS_KEYS: "" }
  let commandArgs: string[]
  if (mode === "serve") {
    const copy = path.resolve(args[0] ?? "")
    if (args.length !== 1 || !/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(copy)) throw new Error("Only existing disposable compiled video copy accepted")
    const server = path.join(copy, ".next/standalone/server.js")
    await access(server)
    Object.assign(env, { PORT: "43104", HOSTNAME: "127.0.0.1" })
    commandArgs = [server]
  } else if (mode === "run" && args[0] === "videos/tools/record.ts" && args[1] === "PLATFORM_INTERNAL_ADMINISTRATION" && (args.length === 2 || args.length === 4 && args[2] === "--rehearse" && args[3] === "--quick-rehearse")) {
    commandArgs = ["--import", "tsx", ...args]
  } else if (mode === "run" && args.length === 2 && args[0] === "videos/tools/audit-audiovisual.ts" && args[1] === "PLATFORM_INTERNAL_ADMINISTRATION") {
    commandArgs = ["--import", "tsx", ...args]
  } else if (mode === "run" && args.length === 1 && ["videos/tools/prepare-operator.ts", "videos/tools/verify-operator-lifecycle.ts", "videos/tools/inspect-operator-sessions.ts"].includes(args[0])) {
    commandArgs = ["--import", "tsx", args[0]]
  } else throw new Error("Usage: operator-local.ts serve TEMP_COPY | run OPERATOR_PREFLIGHT_TOOL")
  const child = spawn(process.execPath, commandArgs, { env, stdio: "inherit" })
  child.on("error", () => { console.error("Local operator child failed to start"); process.exitCode = 1 })
  child.on("exit", code => { process.exitCode = code ?? 1 })
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local operator wrapper failed"); process.exitCode = 1 })
