// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Extracts each published video's posters from its render and records its real duration and size
 * in videos/renders.json (committed; read by the app, which never sees the MP4 itself).
 *
 *   node --import tsx videos/tools/posters.ts [--input <dir>] [ID …]
 *
 * `--input` is the folder holding the renders (`<dir>/<slug>/<slug>.mp4`), videos/output by
 * default; the posters are always written to this checkout's videos/output/<slug>/ (git-ignored),
 * from where `make video-publish` sends them. Without IDs, every published video is processed; a
 * video without a render is reported and skipped. Requires ffmpeg and ffprobe with a JPEG encoder
 * (the system ffmpeg; Playwright's own build may lack it).
 */
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadCatalog, loadManifest, outputRoot, videosRoot } from "../lib/manifest"
import { mergeRenders, ogPosterFfmpegArgs, parseProbe, posterFfmpegArgs, posterFiles, posterTimestampMs, type Renders } from "../lib/posters"

const exec = promisify(execFile)
const FFMPEG = process.env.FFMPEG ?? "ffmpeg"
const FFPROBE = process.env.FFPROBE ?? "ffprobe"
const RENDERS_FILE = path.join(videosRoot, "renders.json")

const args = process.argv.slice(2)
const inputIndex = args.indexOf("--input")
const inputRoot = path.resolve(inputIndex >= 0 ? args[inputIndex + 1] : outputRoot)
const ids = args.filter((a, i) => !a.startsWith("--") && i !== inputIndex + 1)

async function main() {
  const catalog = await loadCatalog()
  const entries = ids.length
    ? catalog.videos.filter((v) => ids.includes(v.id) || ids.includes(v.manifest))
    : catalog.videos.filter((v) => v.published)
  if (ids.length && entries.length !== ids.length) throw new Error(`Identifiant inconnu parmi : ${ids.join(", ")}`)

  const updates: Renders = {}
  const skipped: string[] = []
  for (const entry of entries) {
    const slug = entry.manifest
    const input = path.join(inputRoot, slug, `${slug}.mp4`)
    if (!existsSync(input)) {
      skipped.push(slug)
      continue
    }
    const { stdout } = await exec(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", input])
    const probe = parseProbe(stdout)
    const manifest = await loadManifest(entry.id)
    const atMs = posterTimestampMs(probe.durationMs, manifest.posterAtMs)
    const files = posterFiles(slug)
    await mkdir(path.join(outputRoot, slug), { recursive: true })
    await exec(FFMPEG, posterFfmpegArgs(input, path.join(outputRoot, files.poster), atMs))
    await exec(FFMPEG, ogPosterFfmpegArgs(input, path.join(outputRoot, files.og), atMs))
    updates[slug] = { ...probe, poster: true }
    console.log(`  ${entry.id} : ${files.poster}, ${files.og} (${(atMs / 1000).toFixed(1)} s sur ${(probe.durationMs / 1000).toFixed(1)} s, ${probe.width}x${probe.height})`)
  }

  const current: Renders = existsSync(RENDERS_FILE) ? JSON.parse(await readFile(RENDERS_FILE, "utf8")) : {}
  await writeFile(RENDERS_FILE, `${JSON.stringify(mergeRenders(current, updates), null, 2)}\n`)
  console.log(`Affiches générées : ${Object.keys(updates).length}. videos/renders.json mis à jour.`)
  if (skipped.length) console.log(`Sans rendu dans ${inputRoot} (ignorées) : ${skipped.length}\n${skipped.map((s) => `  - ${s}`).join("\n")}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
