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
  const script = scenario === "demo" ? "scripts/seed-demo.ts" : "scripts/seed-video-scenario.ts"
  const args = ["--env-file=.env.video.e2e", "node_modules/.bin/tsx", script]
  if (scenario !== "demo") args.push(scenario)
  await run("node", args)
}

async function main() {
  const catalog = await loadCatalog()
  const ids = requested.length > 0 ? requested : catalog.videos.map((video) => video.id)
  for (const id of ids) {
    const entry = await catalogEntry(id)
    console.log(`\n▶ ${entry.id} (${entry.manifest})`)
    await seed(entry.seedScenario)
    await run("npm", ["run", "video:tts", "--", entry.id])
    await run("npm", ["run", "video:record", "--", entry.id])
    await run("npm", ["run", "video:assemble", "--", entry.id])
    await run("npm", ["run", "video:validate", "--", entry.id])
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
