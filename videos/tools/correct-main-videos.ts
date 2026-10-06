// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Explicit corrections only. Failed evidence never promotes a video to delivery-ready. */
import { spawn } from "node:child_process"
import { access, mkdir, writeFile } from "node:fs/promises"
import { verifyProductBuild } from "../lib/product-build"

const planning = ["SHIFT_CREATE_SERIES", "SHIFT_TIMELINE_QUICK_ACTIONS", "SHIFT_NIGHT_DST", "SHIFT_WAITLIST_OFFER", "SHIFT_APPROVAL", "SHIFT_ELIGIBILITY_RULES"]
async function run(script: string, args: string[]) {
  return new Promise<number>(resolve => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { env: process.env, stdio: "inherit" })
    child.once("error", () => resolve(1))
    child.once("exit", code => resolve(code ?? 1))
  })
}
async function main() {
  const ids = process.argv.slice(2)
  if (!ids.length || ids.some(id => id !== "EVENT_REPORTS" && !planning.includes(id))) throw new Error("Only reviewed reports/planning corrections allowed")
  process.env.VIDEO_MUSIC_PATH ??= "/Users/pol/Desktop/mixkit-tech-house-vibes-130.mp3"
  await access(process.env.VIDEO_MUSIC_PATH)
  const product = await verifyProductBuild("http://localhost:43102")
  const results: { id: string; status: string; failedStage?: string }[] = []
  await mkdir("videos/output", { recursive: true })
  const save = (active?: { id: string; stage: string }) => writeFile("videos/output/main-corrections-progress.json", JSON.stringify({ updatedAt: new Date().toISOString(), product, requested: ids, active: active ?? null, note: "Automated checks and provenance are not human validation. Nothing published. Failed stages remain visible.", results }, null, 2))
  await save()
  for (const id of ids) {
    const currentProduct = await verifyProductBuild("http://localhost:43102")
    if (currentProduct.commit !== product.commit || currentProduct.buildId !== product.buildId) throw new Error("Capture server changed during the correction batch; restart on the verified main build")
    console.log(`MAIN CORRECTION ${id}: ${product.commit}`)
    const local = (script: string, ...args: string[]): [string, string[]] => ["videos/tools/local-production.ts", ["run", script, ...args]]
    const stages: [string, string, string[]][] = []
    if (id === "EVENT_REPORTS") stages.push(
      ["documents", ...local("videos/tools/verify-reports.ts")],
      ["render-documents", "videos/tools/review-pdfs.ts", ["videos/output/event-reports/documents"]],
    )
    if (planning.includes(id)) stages.push(
      ["tts", "videos/tools/generate-tts.ts", [id]],
      ["align", "videos/tools/align-narration-windows.ts", [id, "--apply"]],
    )
    stages.push(["source-audit", "videos/tools/audit-narration.ts", [id]])
    if (planning.includes(id)) stages.push(["fixture", ...local("videos/tools/prepare-demo.ts")])
    stages.push(
      ["capture", ...local("videos/tools/record.ts", id)],
      ["assemble", "videos/tools/assemble.ts", [id]],
      ["ui-drift", "videos/tools/scan-main-ui-drift.ts", [id]],
      ["frames", "videos/tools/review-frames.ts", [id]],
      ["final-audio", "videos/tools/audit-narration.ts", [id, "--from-video"]],
      ["technical-validation", "videos/tools/validate.ts", [id]],
      ["audiovisual", ...local("videos/tools/audit-audiovisual.ts", id)],
    )
    let failedStage: string | undefined
    for (const [stage, script, args] of stages) {
      await save({ id, stage })
      console.log(`${id}: ${stage}`)
      if (await run(script, args) !== 0) { failedStage = stage; break }
    }
    results.push({ id, status: failedStage ? "needs-correction" : "generated-for-review", failedStage })
    await save()
    console.log(`${id}: ${failedStage ? `STOPPED at ${failedStage}` : "generated for review, not published"}`)
  }
  if (results.some(result => result.failedStage)) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Main corrections failed"); process.exitCode = 1 })
