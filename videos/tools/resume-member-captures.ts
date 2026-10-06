// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Sequential captures sharing default. Parallel audio work is safe; parallel fixture resets are not.
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { catalogEntry } from "../lib/manifest"
import { verifyProductBuild } from "../lib/product-build"

const scenarios: Record<string, string | null> = {
  MEMBERS_MANAGEMENT: "members-management", MEMBERS_IMPORT: null,
  MEMBERS_INVITATIONS: "members-invitations", MEMBERS_REMINDERS: "members-reminders",
  REGISTRATIONS_MANAGEMENT: "registrations-management", STAFFING_GAPS: "staffing-gaps",
  TARGETED_MESSAGES: "targeted-messages", REMINDERS_CHANGES: "reminders-changes",
}
type Result = { id: string; status: "generated-for-review" | "needs-review"; failedStage?: string; error?: string }
type Stage = [string, string, string[]]
async function run(script: string, args: string[]) {
  return new Promise<number>(resolve => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { env: process.env, stdio: "inherit" })
    child.on("error", () => resolve(1))
    child.on("exit", code => resolve(code ?? 1))
  })
}
async function main() {
  const requested = process.argv.slice(2)
  const directCapture = requested.includes("--direct-capture")
  if (requested.filter(arg => arg === "--direct-capture").length > 1) throw new Error("Duplicate capture mode")
  const ids = requested.filter(arg => arg !== "--direct-capture")
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(scenarios, id))) throw new Error("Supply unique explicit member-training IDs only")
  for (const id of ids) await catalogEntry(id)
  const startedAt = new Date().toISOString()
  const batch = createHash("sha256").update(JSON.stringify({ ids, startedAt, pid: process.pid })).digest("hex").slice(0, 20)
  const reportFile = `videos/output/member-captures-${batch}.json`
  const results: Result[] = []
  let active: { id: string; stage: string } | null = null
  await mkdir("videos/output", { recursive: true })
  const save = (state: "active" | "finished" | "failed" = "active", error?: string) => writeFile(reportFile, JSON.stringify({ batch, startedAt, updatedAt: new Date().toISOString(), state, pid: process.pid, requested: ids, rehearsalPerformed: !directCapture, active, results, error, note: "Generated-for-review is not publication, human validation or proof of complete masterclass coverage. Direct capture omits only rehearsal; actual full capture, integrity checks and final media reviews remain required. Never run alongside another default-fixture capture." }, null, 2))
  await save()
  const local = (script: string, args: string[] = []): [string, string[]] => ["videos/tools/local-production.ts", ["run", script, ...args]]
  try {
    for (const id of ids) {
      const prepare = (): [string, string[]] => scenarios[id]
        ? local("scripts/seed-video-scenario.ts", [scenarios[id]!]) // wrapper verifies main, prepares guarded default, then seeds
        : local("videos/tools/prepare-demo.ts")
      const stages: Stage[] = [
        ["source-audit", "videos/tools/audit-narration.ts", [id]],
        ...(!directCapture ? [
          ["prepare-rehearsal", ...prepare()],
          ["quick-rehearsal", ...local("videos/tools/record.ts", [id, "--rehearse", "--quick-rehearse"])],
        ] as Stage[] : []),
        ["prepare-capture", ...prepare()],
        ["narrated-capture", ...local("videos/tools/record.ts", [id])],
        ["assemble", "videos/tools/assemble.ts", [id]],
        ["frames", "videos/tools/review-frames.ts", [id]],
        ["final-audio", "videos/tools/audit-narration.ts", [id, "--from-video"]],
        ["technical-validation", "videos/tools/validate.ts", [id]],
        ["audiovisual-review", ...local("videos/tools/audit-audiovisual.ts", [id])],
      ]
      let failedStage: string | undefined
      let error: string | undefined
      for (const [stage, script, args] of stages) {
        active = { id, stage }; await save()
        try {
          // A stale product is never disguised as a successful audio-only stage.
          await verifyProductBuild("http://localhost:43102")
          const code = await run(script, args)
          if (code !== 0) { failedStage = stage; error = `Child exited ${code}`; break }
        } catch (cause) {
          failedStage = stage; error = cause instanceof Error ? cause.message : "Stage failed"; break
        }
      }
      results.push({ id, status: failedStage ? "needs-review" : "generated-for-review", failedStage, error })
      active = null; await save()
      console.log(`${id}: ${failedStage ? `needs-review (${failedStage}: ${error})` : "generated-for-review"}`)
    }
    active = null
    await save(results.some(result => result.failedStage) ? "failed" : "finished")
    if (results.some(result => result.failedStage)) process.exitCode = 1
  } catch (cause) {
    await save("failed", cause instanceof Error ? cause.message : "Batch failed")
    throw cause
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Member capture batch failed"); process.exitCode = 1 })
