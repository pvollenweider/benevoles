// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Locate every chapter in short audio windows, then optionally recut. ASR is still required. */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir } from "../lib/manifest"

const exec = promisify(execFile)
const reference = process.argv[2]
const apply = process.argv.includes("--apply")
const hash = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex")

async function main() {
  if (!reference) throw new Error("Usage: align-narration-windows.ts VIDEO_ID [--apply]")
  const manifest = await loadManifest(reference)
  if (!manifest.continuousNarration) throw new Error("Window alignment requires one continuous narration")
  const directory = videoDir(manifest.slug)
  const master = path.join(directory, "audio", "continuous-narration.wav")
  const masterSha256 = await hash(master)
  const segments = manifest.segments.slice(1)
  const cuts: { id: string; seconds: number }[] = []
  for (let offset = 0; offset < segments.length; offset += 3) {
    const located = await Promise.all(segments.slice(offset, offset + 3).map(async segment => {
      const { stdout } = await exec(process.execPath, ["--import", "tsx", "videos/tools/locate-narration-boundary.ts", reference, segment.id], { timeout: 180_000, maxBuffer: 1024 * 1024 })
      console.log(stdout.trim())
      const boundary = JSON.parse(await readFile(path.join(directory, `boundary-${segment.id}.json`), "utf8")) as { proposedCut: number; result: { found: boolean } }
      if (!boundary.result.found || !Number.isFinite(boundary.proposedCut)) throw new Error(`${segment.id}: no reliable chapter boundary`)
      return { id: segment.id, seconds: boundary.proposedCut }
    }))
    cuts.push(...located)
  }
  if (await hash(master) !== masterSha256) throw new Error("Master audio changed during alignment; refusing stale proposals")
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", master])
  const totalSeconds = Number(stdout.trim())
  if (!Number.isFinite(totalSeconds) || cuts.some((cut, index) => cut.seconds <= (index ? cuts[index - 1].seconds : 0) || cut.seconds >= totalSeconds)) throw new Error("Chapter boundaries are out of order or outside the master audio")
  await writeFile(path.join(directory, "window-alignment.json"), JSON.stringify({ locatedAt: new Date().toISOString(), masterSha256, totalSeconds, cuts, applied: false, independentContentAuditRequired: true }, null, 2))
  if (apply) {
    const { stdout: recut } = await exec(process.execPath, ["--import", "tsx", "videos/tools/recut-narration.ts", reference, ...cuts.map(c => `${c.id}=${c.seconds.toFixed(6)}`)])
    console.log(recut.trim())
    await writeFile(path.join(directory, "window-alignment.json"), JSON.stringify({ locatedAt: new Date().toISOString(), masterSha256, totalSeconds, cuts, applied: true, independentContentAuditRequired: true }, null, 2))
  }
  console.log(`${cuts.length} window-based boundaries ${apply ? "applied" : "proposed"}; independently audit every chapter before capture`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Window alignment failed"); process.exitCode = 1 })
