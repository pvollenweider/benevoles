// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { spawn } from "node:child_process"
import { catalogEntry, loadCatalog } from "../lib/manifest"

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("-"))

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env })
    child.on("error", reject)
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)))
  })
}

async function seed(scenario?: string) {
  if (!scenario) return
  if (scenario === "attendance-check-in" || scenario === "volunteer-badges" || scenario === "event-reports" || scenario === "reminders-changes" || scenario === "targeted-messages" || scenario === "personal-withdrawals" || scenario === "personal-calendar" || scenario === "personal-session" || scenario === "members-management" || scenario === "members-invitations" || scenario === "members-reminders" || scenario === "registrations-management" || scenario === "staffing-gaps") {
    await seed("demo")
    await run("node", ["--env-file=.env.video.e2e", "node_modules/.bin/tsx", "scripts/seed-video-scenario.ts", scenario])
    return
  }
  const script = scenario === "demo" ? "scripts/seed-demo.ts" : "scripts/seed-video-scenario.ts"
  const args = ["--env-file=.env.video.e2e", "node_modules/.bin/tsx", script]
  if (scenario !== "demo") args.push(scenario)
  await run("node", args)
}

async function main() {
  await run("node", ["--import", "tsx", "videos/tools/check-types.ts"])
  const catalog = await loadCatalog()
  const ids = requested.length > 0 ? requested : catalog.videos.map((video) => video.id)
  for (const id of ids) {
    const entry = await catalogEntry(id)
    console.log(`\n▶ ${entry.id} (${entry.manifest})`)
    await run("npm", ["run", "video:tts", "--", entry.id])
    await run("node", ["--env-file-if-exists=.env.video.local", "--import", "tsx", "videos/tools/audit-narration.ts", entry.id])
    await seed(entry.seedScenario)
    if (entry.manifest === "event-reports") {
      await run("node", ["--env-file=.env.video.e2e", "--import", "tsx", "videos/tools/verify-reports.ts"])
      await run("node", ["--import", "tsx", "videos/tools/review-pdfs.ts", "videos/output/event-reports/documents"])
    }
    await run("npm", ["run", "video:record", "--", entry.id])
    await run("npm", ["run", "video:assemble", "--", entry.id])
    await run("npm", ["run", "video:validate", "--", entry.id])
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
