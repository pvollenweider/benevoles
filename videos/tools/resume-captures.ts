// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Sequential common-fixture captures. Failures stay visible and do not block other videos.
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { catalogEntry } from "../lib/manifest"

const allowed = ["SECTOR_LEADERS", "EVENT_DUPLICATE", "EVENT_REVIEW_PUBLISH", "EVENT_ARCHIVE_DELETE", "SHIFT_CREATE_EDIT_DETAIL", "SHIFT_CREATE_SERIES", "SHIFT_TIMELINE_QUICK_ACTIONS", "SHIFT_NIGHT_DST", "SHIFT_WAITLIST_OFFER", "SHIFT_APPROVAL", "SHIFT_ELIGIBILITY_RULES", "VOLUNTEER_DISCOVER_EVENT", "VOLUNTEER_CHOOSE_SHIFTS", "VOLUNTEER_FORM_RECAP"]
async function run(script: string, args: string[]) {
  return await new Promise<number>(resolve => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { env: process.env, stdio: "inherit" })
    child.on("error", () => resolve(1))
    child.on("exit", code => resolve(code ?? 1))
  })
}
async function main() {
  const ids = process.argv.slice(2)
  if (!ids.length || ids.some(id => !allowed.includes(id))) throw new Error("Only explicit common-training catalogue IDs allowed")
  for (const id of ids) await catalogEntry(id)
  const results: { id: string; status: string; failedStage?: string }[] = []
  await mkdir("videos/output", { recursive: true })
  for (const id of ids) {
    console.log(`Capturing ${id}; common synthetic fixture only`)
    const local = (script: string, args: string[] = []): [string, string[]] => ["videos/tools/local-production.ts", ["run", script, ...args]]
    const stages: [string, string, string[]][] = [
      ["source-audit", "videos/tools/audit-narration.ts", [id]],
      ["prepare-rehearsal", ...local("videos/tools/prepare-demo.ts")],
      ["rehearsal", ...local("videos/tools/record.ts", [id, "--rehearse", "--quick-rehearse"])],
      ["prepare-capture", ...local("videos/tools/prepare-demo.ts")],
      ["capture", ...local("videos/tools/record.ts", [id])],
      ["assemble", "videos/tools/assemble.ts", [id]],
      ["frames", "videos/tools/review-frames.ts", [id]],
      ["final-audio", "videos/tools/audit-narration.ts", [id, "--from-video"]],
      ["technical-validation", "videos/tools/validate.ts", [id]],
    ]
    stages.push(["audiovisual-review", ...local("videos/tools/audit-audiovisual.ts", [id])])
    let failedStage: string | undefined
    for (const [stage, script, args] of stages) {
      let code = await run(script, args)
      if (code !== 0 && ["source-audit", "final-audio"].includes(stage)) {
        console.log(`${id}: retrying independent ${stage}; a failed transcription is never edited or accepted`)
        code = await run(script, args)
      }
      if (code !== 0) { failedStage = stage; break }
    }
    results.push({ id, status: failedStage ? "needs-review" : "generated-for-review", failedStage })
    await writeFile("videos/output/resumed-captures.json", JSON.stringify({ updatedAt: new Date().toISOString(), note: "Generated-for-review is not human validation, complete coverage or publication. Every failed stage remains listed.", results }, null, 2))
    console.log(`${id}: ${failedStage ? `needs review at ${failedStage}` : "generated for review"}`)
  }
  if (results.some(result => result.failedStage)) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Capture resumption failed"); process.exitCode = 1 })
