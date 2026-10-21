// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Production-mode rendering of a disposable LOCAL copy, never a deployment. */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { access, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import type { ProductBuild } from "../lib/product-build"
import { verifyProductBuild } from "../lib/product-build"
import { PUBLIC_APP_URL, videoAdminEmail } from "../lib/public-hosts"

const memberTakes = ["MEMBERS_MANAGEMENT", "MEMBERS_IMPORT", "MEMBERS_INVITATIONS", "MEMBERS_REMINDERS", "REGISTRATIONS_PLACE_MEMBER", "REGISTRATIONS_MANAGEMENT", "STAFFING_GAPS", "TARGETED_MESSAGES", "REMINDERS_CHANGES"]
const memberSeeds = ["members-management", "members-invitations", "members-reminders", "registrations-place-member", "registrations-management", "staffing-gaps", "targeted-messages", "reminders-changes"]

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Only isolated local video DB accepted")
  const [mode, ...args] = process.argv.slice(2)
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXTAUTH_URL: "http://localhost:43102", VIDEO_BASE_URL: "http://localhost:43102",
    // Public, deterministic fixture material, NOT a secret for any deployed app.
    // All tools reading this take must use this wrapper to read its encrypted rows.
    TOKEN_ENCRYPTION_KEY: createHash("sha256").update("benevol-local-video-fixture-only-never-production").digest("base64"),
    TOKEN_ENCRYPTION_KEY_ID: "local-video-fixture", TOKEN_ENCRYPTION_PREVIOUS_KEYS: "",
    CRON_SECRET: process.env.CRON_SECRET || "local-video-fixture-cron-only",
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false",
    SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" }
  let commandArgs: string[]
  let childWorkingDirectory: string | undefined
  let serving: { proof: ProductBuild; port: number } | undefined
  if (mode === "build") {
    const copy = path.resolve(args[0] ?? "")
    if (!/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(copy)) throw new Error("Only mktemp video copy accepted")
    const next = path.join(copy, "node_modules/next/dist/bin/next")
    childWorkingDirectory = copy
    await access(next)
    // The proxy can inline NEXT_PUBLIC_APP_URL: build and capture use the same HTTP origin.
    // Runtime wrappers keep each local port explicit; no product security check is changed.
    env.NEXT_PUBLIC_APP_URL = "http://localhost:43102"
    commandArgs = [next, "build", copy, "--webpack"]
  } else if (mode === "serve" || mode === "serve-public" || mode === "serve-capture" || mode === "serve-delivery" || mode === "serve-dayof" || mode === "serve-merge" || mode === "serve-questions" || mode === "serve-hours") {
    const copy = path.resolve(args[0] ?? "")
    if (!/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(copy)) throw new Error("Only mktemp video copy accepted")
    const server = path.join(copy, ".next/standalone/server.js")
    const proof = JSON.parse(await readFile(path.join(copy, ".video-build.json"), "utf8")) as ProductBuild
    if (proof.snapshot !== copy || !/^[a-f0-9]{40}$/.test(proof.commit) || !proof.buildId || !proof.productSourceSha256) throw new Error("Verified main build proof required before serving video UI")
    childWorkingDirectory = path.dirname(server)
    await access(server)
    // HTTP capture pages must have an HTTP deployment origin (#1062).
    Object.assign(env, { PORT: "43102", HOSTNAME: "127.0.0.1", NEXT_PUBLIC_APP_URL: mode === "serve-capture" ? "http://localhost:43102" : PUBLIC_APP_URL })
    if (mode === "serve-delivery") Object.assign(env, { PORT: "43106", NEXTAUTH_URL: "http://localhost:43106", VIDEO_BASE_URL: "http://localhost:43106", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41028", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    if (mode === "serve-dayof") Object.assign(env, { PORT: "43108", NEXTAUTH_URL: "http://localhost:43108", VIDEO_BASE_URL: "http://localhost:43108", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    if (mode === "serve-merge") Object.assign(env, { PORT: "43110", NEXTAUTH_URL: "http://localhost:43110", VIDEO_BASE_URL: "http://localhost:43110", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    if (mode === "serve-questions") Object.assign(env, { PORT: "43112", NEXTAUTH_URL: "http://localhost:43112", VIDEO_BASE_URL: "http://localhost:43112", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    if (mode === "serve-hours") Object.assign(env, { PORT: "43114", NEXTAUTH_URL: "http://localhost:43114", VIDEO_BASE_URL: "http://localhost:43114", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    if (mode === "serve-public") env.NEXTAUTH_URL = PUBLIC_APP_URL
    serving = { proof, port: Number(env.PORT) }
    commandArgs = [server]
  } else if (mode === "run" || mode === "run-delivery") {
    env.ORG_ADMIN_EMAIL = videoAdminEmail(env.ORG_ADMIN_EMAIL)
    const [script, ...rest] = args
    const allowed = new Set(["videos/tools/record.ts", "videos/tools/verify-last-minute-mail.ts", "videos/tools/audit-audiovisual.ts", "scripts/seed-video-scenario.ts", "videos/tools/prepare-privacy.ts", "videos/tools/verify-privacy-details.ts", "videos/tools/prepare-delivery.ts", "videos/tools/verify-delivery-details.ts", "videos/tools/verify-delivery-correction.ts"])
    allowed.add("videos/tools/verify-delivery-partial.ts")
    allowed.add("videos/tools/inspect-last-minute-page.ts")
    allowed.add("videos/tools/verify-delivery-fixture.ts")
    allowed.add("videos/tools/prepare-accessibility.ts")
    allowed.add("videos/tools/prepare-day-of.ts")
    allowed.add("videos/tools/prepare-member-merge.ts")
    allowed.add("videos/tools/prepare-member-merge-v2.ts")
    allowed.add("videos/tools/prepare-member-merge-v3.ts")
    allowed.add("videos/tools/prepare-member-merge-v4.ts")
    allowed.add("videos/tools/prepare-member-merge-v5.ts")
    allowed.add("videos/tools/prepare-data-exports.ts")
    allowed.add("videos/tools/prepare-org-activity.ts")
    allowed.add("videos/tools/check-org-activity-export.ts")
    allowed.add("videos/tools/prepare-event-questions.ts")
    allowed.add("videos/tools/prepare-volunteer-hours.ts")
    allowed.add("videos/tools/prepare-navigation.ts")
    allowed.add("videos/tools/inspect-navigation.ts")
    allowed.add("videos/tools/prepare-search.ts")
    allowed.add("videos/tools/prepare-event-log.ts")
    allowed.add("videos/tools/prepare-foundation.ts")
    allowed.add("videos/tools/prepare-first-steps.ts")
    allowed.add("videos/tools/prepare-demo.ts")
    allowed.add("videos/tools/verify-badges.ts")
    allowed.add("videos/tools/prepare-registration-mailbox.ts")
    allowed.add("videos/tools/verify-last-minute.ts")
    allowed.add("videos/tools/flush-last-minute-outbox.ts")
    allowed.add("videos/tools/prepare-import-baseline.ts")
    allowed.add("videos/tools/review-main-ui.ts")
    allowed.add("videos/tools/verify-reports.ts")
    allowed.add("videos/tools/inspect-foundation.ts")
    allowed.add("videos/tools/verify-accessibility-picker.ts")
    allowed.add("videos/tools/verify-accessibility-current-pages.ts")
    allowed.add("videos/tools/verify-registration-errors.ts")
    allowed.add("videos/tools/verify-registration-invitation-success.ts")
    allowed.add("videos/tools/check-registration-error-reset-guard.ts")
    allowed.add("videos/tools/migrate-private-identities.ts")
    allowed.add("videos/tools/migrate-export-identities.ts")
    if (!allowed.has(script)) throw new Error("Unknown local video tool")
    if (mode === "run-delivery") {
      if (!["videos/tools/record.ts", "videos/tools/audit-audiovisual.ts"].includes(script) || rest[0] !== "EMAIL_DELIVERY_FAILURES") throw new Error("Only the delivery recorder/review is allowed on the dedicated server")
      Object.assign(env, { NEXTAUTH_URL: "http://localhost:43106", VIDEO_BASE_URL: "http://localhost:43106", VIDEO_ORG: "formation-livraisons", ORG_ADMIN_EMAIL: "video.delivery.owner@example.org", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41028", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
    }
    if (script === "videos/tools/record.ts" || script === "videos/tools/audit-audiovisual.ts") {
      const commonTake = ["VOLUNTEER_BADGES", "EVENT_ARCHIVE_DELETE", "SHIFT_CREATE_EDIT_DETAIL", "SHIFT_CREATE_SERIES", "SHIFT_TIMELINE_QUICK_ACTIONS", "SHIFT_NIGHT_DST", "SHIFT_WAITLIST_OFFER", "SHIFT_APPROVAL", "SHIFT_ELIGIBILITY_RULES", "SHIFT_RECURRENCE", "VOLUNTEER_DISCOVER_EVENT", "VOLUNTEER_CHOOSE_SHIFTS", "VOLUNTEER_PERSONAL_REGISTRATIONS", "VOLUNTEER_CALENDAR", "VOLUNTEER_FORM_RECAP", "VOLUNTEER_REGISTER", "VOLUNTEER_SESSION_AVAILABILITY", ...memberTakes].includes(rest[0])
      const validTake = mode === "run-delivery" ? rest[0] === "EMAIL_DELIVERY_FAILURES" : ["ADMIN_FEATURES_OVERVIEW", "EVENT_CREATE_PUBLISH_OVERVIEW", "ORG_FIRST_STEPS", "LAST_MINUTE_CHANGES", "PRIVACY_PERSONAL_LINKS", "VOLUNTEER_CONFIRMATION_ERRORS", "ADMIN_NAVIGATION", "ORG_TIMEZONE_CHARTER", "GLOBAL_SEARCH", "EVENT_MILESTONES", "ORG_PUBLIC_IDENTITY", "ORG_EMAIL_SETTINGS", "ORG_TEAM_PERMISSIONS", "EVENT_CREATE_BLANK", "EVENT_CREATE_TEMPLATE", "EVENT_VISIBILITY_REGISTRATION_WINDOW", "EVENT_PROGRAM_PAGES_QR", "SECTOR_LEADERS", "REGISTRATION_MONITOR_FOLLOWUP", "EVENT_DUPLICATE", "EVENT_REVIEW_PUBLISH"].includes(rest[0])
      if (rest[0] === "ORG_FIRST_STEPS") Object.assign(env, { ORG_ADMIN_EMAIL: "video.firststeps.owner@example.org", VIDEO_ORG: "formation-premiers-pas" })
      if (rest[0] === "ADMIN_NAVIGATION") Object.assign(env, { ORG_ADMIN_EMAIL: "video.navigation.owner@example.org", VIDEO_ORG: "formation-navigation", VIDEO_EVENT_SLUG: "rencontre-0" })
      if (rest[0] === "GLOBAL_SEARCH") Object.assign(env, { ORG_ADMIN_EMAIL: "video.search.owner@example.org", VIDEO_ORG: "formation-recherche", VIDEO_EVENT_SLUG: "rencontre-0" })
      if (rest[0] === "ATTENDANCE_CHECK_IN") Object.assign(env, { NEXTAUTH_URL: "http://localhost:43108", VIDEO_BASE_URL: "http://localhost:43108", ORG_ADMIN_EMAIL: "video.dayof.owner@example.org", VIDEO_ORG: "formation-jour-j", VIDEO_EVENT_SLUG: "atelier-pointage" })
      if (rest[0] === "ORGANIZATION_ACTIVITY_LOG") Object.assign(env, { ORG_ADMIN_EMAIL: "video.org-activity.owner@example.org", VIDEO_ORG: "formation-journal", VIDEO_EVENT_SLUG: "atelier-journal" })
      if (rest[0] === "DATA_EXPORTS_ARCHIVES") Object.assign(env, { NEXTAUTH_URL: "http://localhost:43102", VIDEO_BASE_URL: "http://localhost:43102", ORG_ADMIN_EMAIL: "video.exports.owner@example.org", VIDEO_ORG: "formation-exports", VIDEO_EVENT_SLUG: "fete-des-archives" })
      if (rest[0] === "MEMBERS_DUPLICATES_MERGE") {
        if (mode !== "run" || url.port !== "45433") throw new Error("Merge recording requires isolated local wrapper")
        Object.assign(env, { NEXTAUTH_URL: "http://localhost:43110", VIDEO_BASE_URL: "http://localhost:43110", ORG_ADMIN_EMAIL: "video.merge.owner@example.org", VIDEO_ORG: "formation-fusion", VIDEO_EVENT_SLUG: "atelier-fusion", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
      }
      if (rest[0] === "EVENT_QUESTIONS") {
        if (mode !== "run" || url.port !== "45433") throw new Error("Questions recording requires isolated local wrapper")
        Object.assign(env, { NEXTAUTH_URL: "http://localhost:43112", VIDEO_BASE_URL: "http://localhost:43112", ORG_ADMIN_EMAIL: "video.questions.owner@example.org", VIDEO_ORG: "formation-questions", VIDEO_EVENT_SLUG: "atelier-questions", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
      }
      if (rest[0] === "VOLUNTEER_HOURS_CERTIFICATE") {
        if (mode !== "run" || url.port !== "45433") throw new Error("Hours recording requires isolated local wrapper")
        Object.assign(env, { NEXTAUTH_URL: "http://localhost:43114", VIDEO_BASE_URL: "http://localhost:43114", ORG_ADMIN_EMAIL: "video.hours.owner@example.org", VIDEO_ORG: "formation-heures", VIDEO_EVENT_SLUG: "heures-september", SMTP_HOST: "127.0.0.1", SMTP_PORT: "41026", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
      }
      const foundation = ({ ORG_TIMEZONE_CHARTER: "charter", ORG_PUBLIC_IDENTITY: "identity", ORG_EMAIL_SETTINGS: "email", ORG_TEAM_PERMISSIONS: "team", EVENT_CREATE_BLANK: "blank", EVENT_CREATE_TEMPLATE: "template", EVENT_MILESTONES: "milestones", EVENT_PROGRAM_PAGES_QR: "pages", SHIFTS_ROLES_VIEWS: "planning" } as Record<string, string>)[rest[0]]
      if (foundation) Object.assign(env, { ORG_ADMIN_EMAIL: `video.${foundation}.owner@example.org`, VIDEO_ORG: foundation === "identity" ? "fetes-de-montvert" : `formation-${foundation}`, VIDEO_EVENT_SLUG: "rencontre-0" })
      const validFlags = rest.length === 1 || (script === "videos/tools/record.ts" && rest.length === 3 && rest[1] === "--rehearse" && ["--quick-rehearse", "--audio-timing"].includes(rest[2]))
      if (!(validTake || commonTake || rest[0] === "SHIFTS_ROLES_VIEWS" || rest[0] === "EVENT_REPORTS" || rest[0] === "EVENT_ACTIVITY_LOG" || rest[0] === "ATTENDANCE_CHECK_IN" || rest[0] === "MEMBERS_DUPLICATES_MERGE" || rest[0] === "EVENT_QUESTIONS" || rest[0] === "VOLUNTEER_HOURS_CERTIFICATE" || rest[0] === "DATA_EXPORTS_ARCHIVES" || rest[0] === "ORGANIZATION_ACTIVITY_LOG") || !validFlags) throw new Error("Only explicit local video takes and rehearsal flags accepted")
      if (memberTakes.includes(rest[0])) Object.assign(env, { VIDEO_ORG: "default", VIDEO_EVENT_SLUG: rest[0] === "REMINDERS_CHANGES" ? "atelier-rappels" : "fete-du-village" })
    } else if (script === "videos/tools/migrate-private-identities.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length !== 2 || !["delivery", "merge"].includes(rest[0]) || !["--check-only", "--apply-exact-owned"].includes(rest[1])) throw new Error("Only exact private identity migration or read-only preflight accepted")
      await verifyProductBuild(rest[0] === "delivery" ? "http://localhost:43106" : "http://localhost:43110")
    } else if (script === "videos/tools/migrate-export-identities.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length !== 1 || rest[0] !== "--apply-exact-owned") throw new Error("Only exact export identity migration accepted")
      await verifyProductBuild("http://localhost:43102")
    } else if (script === "videos/tools/prepare-data-exports.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length) throw new Error("Only exact owned export preparation accepted")
      await verifyProductBuild("http://localhost:43102")
    } else if (script === "videos/tools/prepare-volunteer-hours.ts") {
      if (mode !== "run" || url.port !== "45433" || (rest.length && !(rest[0] === "--reset-owned" && (rest.length === 1 || rest.length === 2 && rest[1] === "--recover-stale-ledger")))) throw new Error("Only isolated hours preparation or explicit owned reset accepted")
      await verifyProductBuild("http://localhost:43114")
    } else if (script === "videos/tools/prepare-event-questions.ts") {
      if (mode !== "run" || url.port !== "45433" || (rest.length && !(rest.length === 1 && rest[0] === "--reset-owned"))) throw new Error("Only isolated questions preparation or explicit owned reset accepted")
      await verifyProductBuild("http://localhost:43112")
    } else if (script === "videos/tools/prepare-member-merge-v5.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length) throw new Error("Only create-once isolated merge generation v5 accepted")
      await verifyProductBuild("http://localhost:43110")
    } else if (script === "videos/tools/prepare-member-merge-v4.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length) throw new Error("Only create-once isolated merge generation v4 accepted")
      await verifyProductBuild("http://localhost:43110")
    } else if (script === "videos/tools/prepare-member-merge-v3.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length) throw new Error("Only create-once isolated merge generation v3 accepted")
      await verifyProductBuild("http://localhost:43110")
    } else if (script === "videos/tools/prepare-member-merge-v2.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length) throw new Error("Only create-once isolated merge generation v2 accepted")
      await verifyProductBuild("http://localhost:43110")
    } else if (script === "videos/tools/prepare-member-merge.ts") {
      if (mode !== "run" || url.port !== "45433" || (rest.length && !(rest.length === 1 && rest[0] === "--reset-owned"))) throw new Error("Only isolated merge preparation or explicit owned reset accepted")
      await verifyProductBuild("http://localhost:43110")
    } else if (script === "videos/tools/prepare-day-of.ts") {
      if (mode !== "run" || url.port !== "45433" || (rest.length && !(rest.length === 1 && rest[0] === "--reset-owned"))) throw new Error("Only isolated Jour J preparation or explicit owned reset accepted")
      await verifyProductBuild("http://localhost:43108")
    } else if (script === "videos/tools/prepare-event-log.ts") {
      if (mode !== "run" || url.port !== "45433" || rest.length) throw new Error("Only exact event-log preparation accepted")
      await verifyProductBuild("http://localhost:43102")
    } else if (script === "scripts/seed-video-scenario.ts") {
      if (rest.length !== 1 || !["last-minute-changes", "privacy-personal-links", "event-reports", "event-activity-log", "data-exports-archives", "organization-activity-log", "shift-recurrence", "personal-withdrawals", "personal-calendar", "personal-session", ...memberSeeds].includes(rest[0])) throw new Error("Only explicit local video seeds accepted")
      if (["data-exports-archives", "event-activity-log"].includes(rest[0])) {
        if (mode !== "run" || url.port !== "45433") throw new Error("Exports require the isolated video DB")
        await verifyProductBuild("http://localhost:43102")
      }
      if (["last-minute-changes", "reminders-changes"].includes(rest[0])) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = spawn(process.execPath, ["--import", "tsx", "videos/tools/prepare-registration-mailbox.ts", rest[0]], { env, stdio: "inherit" })
          cleanup.on("error", reject); cleanup.on("exit", code => code === 0 ? resolve() : reject(new Error(`Owned reminder/imprevu mailbox cleanup failed (${code})`)))
        })
      }
      if (memberSeeds.includes(rest[0])) {
        if (mode !== "run" || url.port !== "45433") throw new Error("Member seeds require isolated common video DB and server")
        await verifyProductBuild("http://localhost:43102")
        if (["registrations-place-member", "registrations-management"].includes(rest[0])) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = spawn(process.execPath, ["--import", "tsx", "videos/tools/prepare-registration-mailbox.ts", rest[0]], { env, stdio: "inherit" })
            cleanup.on("error", reject)
            cleanup.on("exit", code => code === 0 ? resolve() : reject(new Error(`Exact registration mailbox cleanup failed (${code})`)))
          })
        }
        // The existing preparation tool checks exact organization identity and synthetic
        // people BEFORE resetting only default. A scenario must never skip that guard.
        await new Promise<void>((resolve, reject) => {
          const preparation = spawn(process.execPath, ["--import", "tsx", "videos/tools/prepare-demo.ts"], { env, stdio: "inherit" })
          preparation.on("error", reject)
          preparation.on("exit", code => code === 0 ? resolve() : reject(new Error(`Guarded demo preparation failed (${code}); member seed not executed`)))
        })
        await verifyProductBuild("http://localhost:43102")
      }
    } else if (script === "videos/tools/verify-registration-invitation-success.ts") {
      if (rest.length && !(rest.length === 1 && rest[0] === "--finish-readonly")) throw new Error("Only explicit read-only completion accepted")
    } else if (script === "videos/tools/prepare-registration-mailbox.ts") {
      if (rest.length !== 1 || !["members-invitations", "members-reminders", "registrations-place-member", "registrations-management", "sector-leaders", "staffing-gaps", "organizer-monitor-followup", "targeted-messages", "last-minute-changes", "reminders-changes"].includes(rest[0])) throw new Error("Only identified batch registration fixture mail accepted")
    } else if (script === "videos/tools/prepare-foundation.ts") {
      if (rest.length !== 1 || !["charter", "identity", "milestones", "pages", "email", "team", "blank", "template", "planning"].includes(rest[0])) throw new Error("Only explicit owned foundation scenario accepted")
    } else if (rest.length) throw new Error("Unexpected tool arguments")
    if (script === "videos/tools/prepare-demo.ts") await verifyProductBuild("http://localhost:43102")
    commandArgs = ["--import", "tsx", script, ...rest]
  } else throw new Error("Usage: local-production.ts serve TEMP_COPY | run VIDEO_TOOL [LAST_MINUTE_CHANGES]")
  // Auth.js prefers AUTH_URL over NEXTAUTH_URL; never inherit a different video port.
  env.AUTH_URL = env.NEXTAUTH_URL
  const child = spawn(process.execPath, commandArgs, { env, stdio: "inherit", cwd: childWorkingDirectory })
  if (serving && child.pid) {
    await mkdir("videos/output", { recursive: true })
    await writeFile(`videos/output/product-server-${serving.port}.json`, JSON.stringify({ ...serving.proof, pid: child.pid, port: serving.port }, null, 2))
  }
  child.on("error", () => { console.error("Local video child failed to start"); process.exitCode = 1 })
  child.on("exit", code => { process.exitCode = code ?? 1 })
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local video production wrapper failed"); process.exitCode = 1 })
