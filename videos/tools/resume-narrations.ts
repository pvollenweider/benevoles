// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Voice preparation only: never labels an MP4 finalized or mutates a fixture.
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { catalogEntry } from "../lib/manifest"

async function run(script: string, args: string[]) {
  return await new Promise<number>(resolve => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { env: process.env, stdio: "inherit" })
    child.on("error", () => resolve(1))
    child.on("exit", code => resolve(code ?? 1))
  })
}
async function main() {
  const ids = process.argv.slice(2)
  if (!ids.length) throw new Error("Explicit catalogue IDs required")
  for (const id of ids) await catalogEntry(id)
  const results: { id: string; status: string }[] = []
  await mkdir("videos/output", { recursive: true })
  const batch = createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 16)
  const reportFile = `videos/output/resumed-narrations-${batch}.json`
  const save = (active: string | null = null) => writeFile(reportFile, JSON.stringify({ updatedAt: new Date().toISOString(), requested: ids, active, scope: "Narration only, not capture, MP4 synchronization or completion", results }, null, 2))
  await save()
  for (const id of ids) {
    await save(id)
    console.log(`Preparing narration ${id}; no final video validation claimed`)
    let status = "generation-failed"
    if (await run("videos/tools/generate-tts.ts", [id]) === 0) {
      status = "audit-required"
      if (await run("videos/tools/audit-narration.ts", [id]) === 0) status = "source-audited"
      else if (await run("videos/tools/align-narration-windows.ts", [id, "--apply", "--wide"]) === 0 && await run("videos/tools/audit-narration.ts", [id]) === 0) status = "source-audited"
    }
    results.push({ id, status })
    await save()
    console.log(`${id}: ${status}`)
  }
  if (results.some(result => result.status !== "source-audited")) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Narration preparation failed"); process.exitCode = 1 })
