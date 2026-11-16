// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Centre the actual portrait viewport; exclude only Chromium's native grey recorder padding. */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { loadManifest, videoDir, type Timeline } from "../lib/manifest"
const exec = promisify(execFile)
export async function focusAttendance() {
  const manifest = await loadManifest("ATTENDANCE_CHECK_IN"), dir = videoDir(manifest.slug)
  const file = path.join(dir, "timeline.json"), raw = await readFile(file)
  const timeline = JSON.parse(raw.toString()) as Timeline
  assert(timeline.capturePurpose === "narration-timed" && manifest.viewport.width === 1280 && manifest.viewport.height === 800)
  const source = path.join(dir, timeline.video)
  const sourceSha256 = createHash("sha256").update(await readFile(source)).digest("hex")
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-i", source, "-vf", "fps=25,crop=2:2:1000:400,format=rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", maxBuffer: 2_000_000 })
  const grey: number[] = []
  for (let i = 0; i < stdout.length / 12; i++) {
    const pixels = [...stdout.subarray(i * 12, i * 12 + 12)]
    if (pixels.every(v => v >= 126 && v <= 130)) grey.push(i)
  }
  assert(grey.length > 100, "Actual sustained grey recorder padding required")
  const startMs = grey[0] * 40, endMs = (grey.at(-1)! + 1) * 40
  const exportCue = timeline.cues.find(c => c.id === "export")!, mobile = timeline.cues.find(c => c.id === "dayof-window")!
  assert(startMs > exportCue.startMs && startMs < mobile.startMs, "Portrait resize must occur during the export's real phone introduction")
  assert(grey.length === grey.at(-1)! - grey[0] + 1, "Padding must stay continuous through the end of the portrait recording")
  assert(endMs >= timeline.cues.at(-1)!.endMs - 80)
  assert(createHash("sha256").update(await readFile(source)).digest("hex") === sourceSha256)
  await mkdir(path.join(dir, "review"), { recursive: true })
  if (!timeline.portraitFrames?.length) await writeFile(path.join(dir, "review/timeline-before-portrait-focus.json"), raw)
  // Native video fits the 390×844 CSS viewport into its fixed 800px height.
  // Measure the physical content edge rather than retaining a 20px grey strip.
  const phone = timeline.cues.find(c => c.id === "dayof-phone")!
  const { stdout: edge } = await exec("ffmpeg", ["-v", "error", "-ss", String(phone.startMs / 1000 + 2), "-i", source, "-vf", "crop=1280:2:0:400,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { encoding: "buffer" })
  let lastContent = 1279
  while (lastContent >= 0 && [0, 1].every(row => [...edge.subarray((row * 1280 + lastContent) * 3, (row * 1280 + lastContent) * 3 + 3)].every(v => v >= 126 && v <= 130))) lastContent--
  const width = lastContent + 1
  assert(width >= 360 && width <= 390 && width % 2 === 0, "Measured physical portrait viewport required")
  const portraitFrames = [{ startMs, endMs, width, height: 800 }]
  await writeFile(file, JSON.stringify({ ...timeline, portraitFrames }, null, 2) + "\n")
  await writeFile(path.join(dir, "review/portrait-focus-proof.json"), JSON.stringify({ sourceSha256, portraitFrames, sampledFrames: grey.length, sampling: "All four actual RGB pixels at x1000/y400 every frame at 25 fps; continuous native grey padding 126–130", note: "Only the measured physical viewport (390×844 CSS pixels scaled by the native recorder to 800px height) is centred on the page background. No product pixels or state rewritten; raw capture retained." }, null, 2))
}
