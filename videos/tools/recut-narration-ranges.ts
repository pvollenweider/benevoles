// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Extract diagnosed source ranges from one voice take, preserving its master.
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata } from "../lib/manifest"
const exec = promisify(execFile)
async function main() {
  const manifest = await loadManifest(process.argv[2])
  if (!manifest.continuousNarration) throw new Error("One continuous source take required")
  const dir = videoDir(manifest.slug)
  const master = path.join(dir, "audio", "continuous-narration.wav")
  const sourceHash = createHash("sha256").update(await readFile(master)).digest("hex")
  if (process.argv[3] !== sourceHash) throw new Error("Explicit current master SHA256 required")
  const args = process.argv.slice(4)
  if (args.length !== manifest.segments.length) throw new Error("Exactly one explicit range per chapter required")
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", master])
  const duration = Number(stdout.trim())
  const ranges = args.map((arg, index) => {
    const match = arg.match(/^([a-z0-9-]+)=([0-9.]+):([0-9.]+)$/)
    if (!match || match[1] !== manifest.segments[index].id) throw new Error("Ranges must name chapters in manifest order")
    const start = Number(match[2]), end = Number(match[3])
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) throw new Error("Invalid source interval")
    return { id: match[1], start, end }
  })
  if (ranges.some((r, i) => i > 0 && r.start < ranges[i - 1].end)) throw new Error("Source ranges overlap or reverse")
  const metadataFile = path.join(dir, "audio-metadata.json")
  const metadata = JSON.parse(await readFile(metadataFile, "utf8")) as AudioMetadata
  const generations = new Set<string | undefined>(ranges.map(range => metadata.segments[range.id]?.generationSha256))
  if (generations.has(undefined) || generations.size !== 1) throw new Error("All ranges must come from one identified voice generation")
  for (const range of ranges) {
    const segment = metadata.segments[range.id]
    if (!segment?.generationSha256) throw new Error("Unidentified source generation")
    await exec("ffmpeg", ["-loglevel", "error", "-y", "-i", master, "-ss", String(range.start), "-to", String(range.end), "-c:a", "pcm_s16le", path.join(dir, segment.file)])
    segment.durationMs = Math.round((range.end - range.start) * 1000)
  }
  await writeFile(metadataFile, JSON.stringify(metadata, null, 2))
  await writeFile(path.join(dir, "narration-ranges.json"), JSON.stringify({ appliedAt: new Date().toISOString(), sourceHash, sourceDuration: duration, ranges, note: "Original master preserved; omitted source passages explicitly visible. Independent chapter ASR and new capture required. No final validation claimed." }, null, 2))
  console.log("Explicit ranges extracted from original take; independently audit every chapter before capture")
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Range extraction failed"); process.exitCode = 1 })
