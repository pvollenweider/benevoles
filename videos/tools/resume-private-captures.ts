// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Independent fixture journeys; no default reset, TTS or publication.
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
const journeys: Record<string, string[]> = {
  ADMIN_NAVIGATION: ["videos/tools/prepare-navigation.ts"],
  EVENT_CREATE_BLANK: ["videos/tools/prepare-foundation.ts", "blank"],
  GLOBAL_SEARCH: ["videos/tools/prepare-search.ts"],
}
async function child(script: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const processChild = spawn(process.execPath, ["--import", "tsx", script, ...args], { env: process.env, stdio: "inherit" })
    processChild.on("error", reject)
    processChild.on("exit", code => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)))
  })
}
async function main() {
  const ids = process.argv.slice(2)
  let batch: string | undefined
  if (ids[0] === "--batch") {
    batch = ids[1]
    if (!batch || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(batch)) throw new Error("Batch name must be a safe lowercase identifier")
    ids.splice(0, 2)
  }
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !journeys[id])) throw new Error("Explicit distinct supported private journeys required")
  await mkdir("videos/output", { recursive: true })
  const results: { id: string; status: string; error?: string }[] = []
  const reportFile = `videos/output/resumed-private-captures${batch ? `-${batch}` : ""}.json`
  const save = (active: string | null) => writeFile(reportFile, JSON.stringify({ updatedAt: new Date().toISOString(), requested: ids, active, results, note: "Actual narrated capture and automated final checks. No publication or complete human validation claimed." }, null, 2))
  for (const id of ids) {
    await save(id)
    try {
      await child("videos/tools/audit-narration.ts", [id])
      await child("videos/tools/local-production.ts", ["run", ...journeys[id]])
      await child("videos/tools/local-production.ts", ["run", "videos/tools/record.ts", id])
      for (const script of ["assemble", "validate", "review-frames"]) await child(`videos/tools/${script}.ts`, [id])
      await child("videos/tools/audit-narration.ts", [id, "--from-video"])
      await child("videos/tools/local-production.ts", ["run", "videos/tools/audit-audiovisual.ts", id])
      results.push({ id, status: "automated-checks-passed" })
    } catch (error) {
      results.push({ id, status: "needs-review", error: error instanceof Error ? error.message : "Stage failed" })
    }
    await save(null)
  }
  if (results.some(result => result.status !== "automated-checks-passed")) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Private captures failed"); process.exitCode = 1 })
