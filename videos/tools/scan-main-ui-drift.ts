// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Local OCR of actual MP4 frames. Diagnostic sampling, never full visual validation. */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile, readdir, mkdir, mkdtemp } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadCatalog, videoDir } from "../lib/manifest"
const exec = promisify(execFile)
async function main() {
  const scratch = await mkdtemp("/tmp/benevoles-ui-drift-")
  const binary = path.join(scratch, "local-ui-ocr")
  await exec("swiftc", ["videos/tools/local-ui-ocr.swift", "-o", binary], { timeout: 120000, maxBuffer: 1024 * 1024 })
  const rows = []
  for (const video of (await loadCatalog()).videos) {
    const file = path.join(videoDir(video.manifest), `${video.manifest}.mp4`)
    let bytes: Buffer
    try { bytes = await readFile(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error }
    const videoSha256 = createHash("sha256").update(bytes).digest("hex")
    const directory = path.join(scratch, video.manifest)
    await mkdir(directory)
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", "fps=1/15", path.join(directory, "%04d.png")], { timeout: 180000, maxBuffer: 1024 * 1024 })
    const files = (await readdir(directory)).filter(name => name.endsWith(".png")).sort().map(name => path.join(directory, name))
    const input = path.join(directory, "frames.json")
    await writeFile(input, JSON.stringify(files))
    const { stdout } = await exec(binary, [input], { timeout: 240000, maxBuffer: 2 * 1024 * 1024 })
    const results = JSON.parse(stdout) as { file: string; timeline: boolean; frise: boolean; legacyArchiveAboveVolunteerReports: boolean }[]
    const flags = results.flatMap((result, index) => result.timeline || result.legacyArchiveAboveVolunteerReports ? [{ secondsApproximate: index * 15 + 7.5, frame: result.file, oldTimelineLabel: result.timeline, oldArchivePlacement: result.legacyArchiveAboveVolunteerReports }] : [])
    if (createHash("sha256").update(await readFile(file)).digest("hex") !== videoSha256) throw new Error(`${video.id}: MP4 changed during OCR`)
    rows.push({ id: video.id, slug: video.manifest, videoSha256, frames: files.length, flags, framesShowingFrise: results.filter(result => result.frise).length, humanConfirmationRequired: flags.length > 0 })
    await writeFile("videos/output/ui-drift-scan.json", JSON.stringify({ checkedAt: new Date().toISOString(), scratch, method: "Local Apple Vision OCR of actual MP4 frames sampled every 15 seconds; no cloud upload and no personal text retained. Positive flags need visual confirmation; negative sampling is NOT proof of conformity.", videos: rows }, null, 2))
    console.log(`${video.id}: ${files.length} frames, ${flags.length} possible old UI occurrences`)
  }
  console.log(`${rows.length} MP4s scanned; ${rows.filter(row => row.flags.length).length} need visual confirmation. Frame evidence: ${scratch}`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "UI drift scan failed"); process.exitCode = 1 })
