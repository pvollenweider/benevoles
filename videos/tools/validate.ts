// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata, type Timeline } from "../lib/manifest"
import { mismatchedNarrationEdges, unexpectedPauseInstructions } from "../lib/narration-fidelity"
import { assertNarrationGeneration } from "../lib/narration-generation"

const exec = promisify(execFile)
const reference = process.argv.find((argument) => !argument.startsWith("-") && argument !== process.argv[0] && argument !== process.argv[1])
if (!reference) throw new Error("Usage: npm run video:validate -- <VIDEO_ID>")

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T
}

async function durationMs(file: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file])
  return Math.round(Number(stdout.trim()) * 1_000)
}

async function main() {
  const manifest = await loadManifest(reference!)
  if (!manifest.continuousNarration) {
    throw new Error(`${manifest.id}: masterclass videos must use one continuous narration take`)
  }
  const dir = videoDir(manifest.slug)
  const timeline = await readJson<Timeline>(path.join(dir, "timeline.json"))
  if (timeline.capturePurpose === "rehearsal") throw new Error(`${manifest.id}: rehearsal cannot be validated as a synchronized narrated video`)
  const audio = await readJson<AudioMetadata>(path.join(dir, "audio-metadata.json"))
  assertNarrationGeneration(manifest, audio)
  if (audio.voice !== manifest.voice) throw new Error(`${manifest.id}: generated voice differs from manifest`)
  if (timeline.slug !== manifest.slug) throw new Error(`${manifest.id}: timeline belongs to another video`)
  if (timeline.cues.length !== manifest.segments.length) {
    throw new Error(`${manifest.id}: ${timeline.cues.length} cues for ${manifest.segments.length} segments`)
  }

  const issues: string[] = []
  let narrationContentChecked = false
  try {
    const audit = await readJson<{ segments: { id: string; audioSha256: string; expected: string; recognized?: string; needsReview: boolean }[] }>(path.join(dir, "narration-audit.json"))
    narrationContentChecked = true
    for (const segment of manifest.segments) {
      const checked = audit.segments.find(s => s.id === segment.id)
      if (!checked || checked.expected !== segment.transcript || checked.needsReview) {
        issues.push(`${segment.id}: independent narration audit missing, outdated or failed`)
        continue
      }
      if (!checked.recognized || unexpectedPauseInstructions(segment.transcript, checked.recognized).length) issues.push(`${segment.id}: unrequested spoken instruction or missing recognized text`)
      if (checked.recognized && mismatchedNarrationEdges(segment.transcript, checked.recognized).length) issues.push(`${segment.id}: narration beginning/end needs review despite overall word score`)
      const bytes = await readFile(path.join(dir, audio.segments[segment.id].file))
      if (createHash("sha256").update(bytes).digest("hex") !== checked.audioSha256) issues.push(`${segment.id}: narration audio changed since content audit`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    issues.push("independent narration audit is missing; scene timing alone cannot validate this video")
  }
  const scenes = manifest.segments.map((segment, index) => {
    const cue = timeline.cues[index]
    const generated = audio.segments[segment.id]
    if (!cue || cue.id !== segment.id) issues.push(`${segment.id}: cue missing or out of order`)
    if (!generated) issues.push(`${segment.id}: audio missing`)
    const visualMs = cue ? cue.endMs - cue.startMs : 0
    const audioMs = generated?.durationMs ?? 0
    const driftMs = visualMs - audioMs
    if (driftMs < -1_600 || driftMs > 1_600) issues.push(`${segment.id}: visual/audio drift ${driftMs} ms`)
    if (index > 0 && cue && timeline.cues[index - 1] && cue.startMs < timeline.cues[index - 1].endMs) {
      issues.push(`${segment.id}: overlaps the previous scene`)
    }
    return { id: segment.id, visualMs, audioMs, driftMs }
  })

  const captureMs = await durationMs(path.join(dir, timeline.video))
  const lastEnd = timeline.cues.at(-1)?.endMs ?? 0
  if (captureMs < lastEnd) issues.push(`capture ends ${lastEnd - captureMs} ms before the timeline`)
  const report = {
    id: manifest.id,
    slug: manifest.slug,
    validatedAt: new Date().toISOString(),
    continuousNarration: true,
    narrationContentChecked,
    voice: manifest.voice,
    captureMs,
    scenes,
    issues,
  }
  await writeFile(path.join(dir, "validation.json"), `${JSON.stringify(report, null, 2)}\n`)
  if (issues.length > 0) throw new Error(`${manifest.id} synchronization failed:\n- ${issues.join("\n- ")}`)
  console.log(`✓ ${manifest.id}: ${scenes.length} scene durations aligned, one continuous ${manifest.voice} voice; narration content ${narrationContentChecked ? "checked" : "NOT CHECKED"}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
