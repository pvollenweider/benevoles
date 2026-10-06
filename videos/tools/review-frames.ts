// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Actual media frames for visual review. This never claims a complete audiovisual audit. */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type Timeline } from "../lib/manifest"

const exec = promisify(execFile)
const reference = process.argv[2]
const rehearsal = process.argv.includes("--rehearse")
if (!reference) throw new Error("Usage: review-frames.ts VIDEO_ID [--rehearse]")

async function main() {
  const manifest = await loadManifest(reference)
  const directory = videoDir(manifest.slug)
  const timeline = JSON.parse(await readFile(path.join(directory, "timeline.json"), "utf8")) as Timeline
  const isRehearsal = timeline.capturePurpose === "rehearsal"
  if (rehearsal !== isRehearsal) throw new Error("Rehearsal timelines require --rehearse; that flag must not be used for final recordings")
  const source = rehearsal ? path.resolve(directory, timeline.video) : path.join(directory, `${manifest.slug}.mp4`)
  const sourceSha256 = createHash("sha256").update(await readFile(source)).digest("hex")
  const reviewDirectory = path.join(directory, rehearsal ? "rehearsal-review-frames" : "review-frames")
  await mkdir(reviewDirectory, { recursive: true })
  const frames: { scene: string; fraction: number; seconds: number; file: string }[] = []
  const frameHeight = 2 * Math.round(manifest.viewport.height * 640 / manifest.viewport.width / 2)
  for (const cue of timeline.cues) {
    // Inspect the chapter overlay too: later samples alone miss a title that
    // disappears prematurely when the scene immediately navigates elsewhere.
    const duration = cue.endMs - cue.startMs
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid cue duration: ${cue.id}`)
    const samples = [
      { fraction: Math.min(600 / duration, 0.1), label: undefined },
      ...[0.25, 0.45, 0.6, 0.85].map(fraction => ({ fraction, label: undefined })),
      // Slow typing can consume most of a cue. Its actual result may only be
      // visible near the end; do not confuse a form screenshot with proof of success.
      { fraction: Math.max(0, 1 - Math.min(300, duration * 0.05) / duration), label: "end" },
    ]
    for (const { fraction, label } of samples) {
      const seconds = (cue.startMs + (cue.endMs - cue.startMs) * fraction) / 1000
      const file = path.join(reviewDirectory, `${cue.id}-${label ?? Math.round(fraction * 100)}.png`)
      await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", seconds.toFixed(3), "-i", source, "-frames:v", "1", "-vf", "scale=640:-2", file])
      frames.push({ scene: cue.id, fraction, seconds, file })
    }
  }
  const inputs = frames.flatMap(frame => ["-i", frame.file])
  const layout = frames.map((_, index) => `${(index % 4) * 640}_${Math.floor(index / 4) * frameHeight}`).join("|")
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", `${frames.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${frames.length}:layout=${layout}`, "-frames:v", "1", path.join(reviewDirectory, "contact-sheet.png")], { maxBuffer: 10 * 1024 * 1024 })
  if (createHash("sha256").update(await readFile(source)).digest("hex") !== sourceSha256) throw new Error("Source changed during frame extraction; do not use this review")
  await writeFile(path.join(reviewDirectory, "index.json"), JSON.stringify({ video: manifest.slug, source, sourceSha256, capturePurpose: timeline.capturePurpose ?? "narration-timed", extractedAt: new Date().toISOString(), note: rehearsal ? "Six raw rehearsal frames per scene, including chapter start, midpoint and end; no narration or audiovisual validation" : "Six actual MP4 frames per scene, including chapter start, midpoint and end; not a full audiovisual verification", frames }, null, 2))
  console.log(`Review frames: ${reviewDirectory}`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
