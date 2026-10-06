// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Production-mode rendering of a disposable LOCAL copy, never a deployment. */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { access } from "node:fs/promises"
import path from "node:path"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Only isolated local video DB accepted")
  const [mode, ...args] = process.argv.slice(2)
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXTAUTH_URL: "http://localhost:43102", VIDEO_BASE_URL: "http://localhost:43102",
    // Public, deterministic fixture material, NOT a secret for any deployed app.
    // All tools reading this take must use this wrapper to read its encrypted rows.
    TOKEN_ENCRYPTION_KEY: createHash("sha256").update("benevol-local-video-fixture-only-never-production").digest("base64"),
    TOKEN_ENCRYPTION_KEY_ID: "local-video-fixture", TOKEN_ENCRYPTION_PREVIOUS_KEYS: "" }
  let commandArgs: string[]
  let childWorkingDirectory: string | undefined
  if (mode === "build") {
    const copy = path.resolve(args[0] ?? "")
    if (!/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(copy)) throw new Error("Only mktemp video copy accepted")
    const next = path.join(copy, "node_modules/next/dist/bin/next")
    childWorkingDirectory = copy
    await access(next)
    // Reserved, non-routable training domain: mail paths are replayed only on localhost.
    // Build-time public URL avoids localhost's ?org= suffix before email templates append ?token=.
    env.NEXT_PUBLIC_APP_URL = "http://video.invalid"
    commandArgs = [next, "build", copy, "--webpack"]
  } else if (mode === "serve" || mode === "serve-delivery") {
    const copy = path.resolve(args[0] ?? "")
    if (!/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(copy)) throw new Error("Only mktemp video copy accepted")
    const server = path.join(copy, ".next/standalone/server.js")
    childWorkingDirectory = path.dirname(server)
    await access(server)
    Object.assign(env, { PORT: "43102", HOSTNAME: "127.0.0.1" })
    if (mode === "serve-delivery") Object.assign(env, { PORT: "43106", NEXTAUTH_URL: "http://localhost:43106", VIDEO_BASE_URL: "http://localhost:43106", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41028", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    commandArgs = [server]
  } else if (mode === "run" || mode === "run-delivery") {
    const [script, ...rest] = args
    const allowed = new Set(["videos/tools/record.ts", "videos/tools/verify-last-minute-mail.ts", "videos/tools/audit-audiovisual.ts", "scripts/seed-video-scenario.ts", "videos/tools/prepare-privacy.ts", "videos/tools/verify-privacy-details.ts", "videos/tools/prepare-delivery.ts", "videos/tools/verify-delivery-details.ts", "videos/tools/verify-delivery-correction.ts"])
    allowed.add("videos/tools/verify-delivery-partial.ts")
    allowed.add("videos/tools/inspect-last-minute-page.ts")
    allowed.add("videos/tools/verify-delivery-fixture.ts")
    allowed.add("videos/tools/prepare-accessibility.ts")
    allowed.add("videos/tools/prepare-navigation.ts")
    allowed.add("videos/tools/inspect-navigation.ts")
    allowed.add("videos/tools/prepare-search.ts")
    allowed.add("videos/tools/prepare-foundation.ts")
    allowed.add("videos/tools/inspect-foundation.ts")
    allowed.add("videos/tools/verify-accessibility-picker.ts")
    allowed.add("videos/tools/verify-registration-errors.ts")
    allowed.add("videos/tools/verify-registration-invitation-success.ts")
    allowed.add("videos/tools/check-registration-error-reset-guard.ts")
    if (!allowed.has(script)) throw new Error("Unknown local video tool")
    if (mode === "run-delivery") {
      if (!["videos/tools/record.ts", "videos/tools/audit-audiovisual.ts"].includes(script) || rest[0] !== "EMAIL_DELIVERY_FAILURES") throw new Error("Only the delivery recorder/review is allowed on the dedicated server")
      Object.assign(env, { NEXTAUTH_URL: "http://localhost:43106", VIDEO_BASE_URL: "http://localhost:43106", ORG_ADMIN_EMAIL: "video.delivery.owner@example.org", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41028", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    }
    if (script === "videos/tools/record.ts" || script === "videos/tools/audit-audiovisual.ts") {
      const validTake = mode === "run-delivery" ? rest[0] === "EMAIL_DELIVERY_FAILURES" : ["LAST_MINUTE_CHANGES", "PRIVACY_PERSONAL_LINKS", "VOLUNTEER_CONFIRMATION_ERRORS", "ADMIN_NAVIGATION", "ORG_TIMEZONE_CHARTER", "GLOBAL_SEARCH", "EVENT_MILESTONES", "ORG_PUBLIC_IDENTITY", "ORG_EMAIL_SETTINGS", "ORG_TEAM_PERMISSIONS", "EVENT_CREATE_BLANK", "EVENT_CREATE_TEMPLATE", "EVENT_PROGRAM_PAGES_QR"].includes(rest[0])
      if (rest[0] === "ADMIN_NAVIGATION") Object.assign(env, { ORG_ADMIN_EMAIL: "video.navigation.owner@example.org", VIDEO_ORG: "formation-navigation", VIDEO_EVENT_SLUG: "rencontre-0" })
      if (rest[0] === "GLOBAL_SEARCH") Object.assign(env, { ORG_ADMIN_EMAIL: "video.search.owner@example.org", VIDEO_ORG: "formation-recherche", VIDEO_EVENT_SLUG: "rencontre-0" })
      const foundation = ({ ORG_TIMEZONE_CHARTER: "charter", ORG_PUBLIC_IDENTITY: "identity", ORG_EMAIL_SETTINGS: "email", ORG_TEAM_PERMISSIONS: "team", EVENT_CREATE_BLANK: "blank", EVENT_CREATE_TEMPLATE: "template", EVENT_MILESTONES: "milestones", EVENT_PROGRAM_PAGES_QR: "pages", SHIFTS_ROLES_VIEWS: "planning" } as Record<string, string>)[rest[0]]
      if (foundation) Object.assign(env, { ORG_ADMIN_EMAIL: `video.${foundation}.owner@example.org`, VIDEO_ORG: foundation === "identity" ? "fetes-de-montvert" : `formation-${foundation}`, VIDEO_EVENT_SLUG: "rencontre-0" })
      const validFlags = rest.length === 1 || (script === "videos/tools/record.ts" && rest.length === 3 && rest[1] === "--rehearse" && rest[2] === "--quick-rehearse")
      if (!(validTake || rest[0] === "SHIFTS_ROLES_VIEWS") || !validFlags) throw new Error("Only explicit local video takes and rehearsal flags accepted")
    } else if (script === "scripts/seed-video-scenario.ts") {
      if (rest.length !== 1 || !["last-minute-changes", "privacy-personal-links"].includes(rest[0])) throw new Error("Only explicit local video seeds accepted")
    } else if (script === "videos/tools/verify-registration-invitation-success.ts") {
      if (rest.length && !(rest.length === 1 && rest[0] === "--finish-readonly")) throw new Error("Only explicit read-only completion accepted")
    } else if (script === "videos/tools/prepare-foundation.ts") {
      if (rest.length !== 1 || !["charter", "identity", "milestones", "pages", "email", "team", "blank", "template", "planning"].includes(rest[0])) throw new Error("Only explicit owned foundation scenario accepted")
    } else if (rest.length) throw new Error("Unexpected tool arguments")
    commandArgs = ["--import", "tsx", script, ...rest]
  } else throw new Error("Usage: local-production.ts serve TEMP_COPY | run VIDEO_TOOL [LAST_MINUTE_CHANGES]")
  const child = spawn(process.execPath, commandArgs, { env, stdio: "inherit", cwd: childWorkingDirectory })
  child.on("error", () => { console.error("Local video child failed to start"); process.exitCode = 1 })
  child.on("exit", code => { process.exitCode = code ?? 1 })
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local video production wrapper failed"); process.exitCode = 1 })
