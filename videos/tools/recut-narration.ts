// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Apply specific silence cuts diagnosed from independent recognition; audit again afterwards.
import { execFile } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata } from "../lib/manifest"
const exec = promisify(execFile)
async function main() {
  const manifest = await loadManifest(process.argv[2])
  const dir = videoDir(manifest.slug)
  const file = path.join(dir, "audio-metadata.json")
  const metadata = JSON.parse(await readFile(file, "utf8")) as AudioMetadata
  const cuts = [0]
  for (const segment of manifest.segments) cuts.push(cuts.at(-1)! + metadata.segments[segment.id].durationMs / 1000)
  const previousEnd = cuts.at(-1)!
  for (const arg of process.argv.slice(3)) {
    const [id, seconds] = arg.split("=")
    const index = id === "end" ? manifest.segments.length : manifest.segments.findIndex(s => s.id === id)
    if (index < 1 || !Number.isFinite(Number(seconds)) || Number(seconds) > previousEnd) throw new Error(`Invalid boundary: ${arg}`)
    cuts[index] = Number(seconds)
  }
  if (cuts.some((c, i) => i > 0 && c <= cuts[i - 1])) throw new Error("Cuts must increase")
  for (const [index, segment] of manifest.segments.entries()) {
    await exec("ffmpeg", ["-loglevel", "error", "-y", "-i", path.join(dir, "audio", "continuous-narration.wav"), "-ss", String(cuts[index]), "-to", String(cuts[index + 1]), "-c:a", "pcm_s16le", path.join(dir, metadata.segments[segment.id].file)])
    metadata.segments[segment.id].durationMs = Math.round((cuts[index + 1] - cuts[index]) * 1000)
  }
  await writeFile(file, JSON.stringify(metadata, null, 2))
  await writeFile(path.join(dir, "narration-cuts.json"), JSON.stringify({ appliedAt: new Date().toISOString(), cuts, note: "Independent recognition must verify these cuts before capture" }, null, 2))
  console.log("Cuts applied; re-audit narration and recapture before assembling")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
