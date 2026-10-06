// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { audioDir, loadManifest, videoDir, type AudioMetadata } from "../lib/manifest"

const exec = promisify(execFile)
const reference = process.argv.find((arg) => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1])
const dryRun = process.argv.includes("--dry-run")
const force = process.argv.includes("--force")
const resplit = process.argv.includes("--resplit")

if (!reference) throw new Error("Usage: npm run video:tts -- <VIDEO_ID> [--dry-run] [--force] [--resplit]")

async function durationMs(file: string): Promise<number> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file])
  const seconds = Number(stdout.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`ffprobe returned an invalid duration for ${file}`)
  return Math.round(seconds * 1_000)
}

async function splitContinuousNarration(master: string, files: string[], transcripts: string[], totalDurationMs: number) {
  const { stderr } = await exec("ffmpeg", [
    "-i", master,
    "-af", "silencedetect=noise=-35dB:d=0.28",
    "-f", "null",
    "-",
  ], { maxBuffer: 10 * 1024 * 1024 }).catch((error: { stderr?: string }) => ({ stderr: error.stderr ?? "" }))
  const starts = [...stderr.matchAll(/silence_start: ([0-9.]+)/g)].map((match) => Number(match[1]) * 1_000)
  const ends = [...stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((match) => Number(match[1]) * 1_000)
  const candidates = starts
    .map((start, index) => ({ start, end: ends[index] }))
    .filter((pause): pause is { start: number; end: number } => Number.isFinite(pause.end) && pause.start > 250 && pause.end < totalDurationMs - 250)
    // Later in a long take Gemini sometimes reduces a requested chapter pause to roughly the
    // length of an ordinary sentence break, so keep all detectable pauses and rank them below.
    .filter((pause) => pause.end - pause.start >= 250)
    .sort((a, b) => a.start - b.start)
  const totalCharacters = transcripts.reduce((sum, transcript) => sum + transcript.length, 0)
  const expectedPauseMs = 1_050
  const spokenDurationMs = totalDurationMs - expectedPauseMs * (files.length - 1)
  let characters = 0
  let after = 0
  const pauses = transcripts.slice(0, -1).map((transcript, index) => {
    characters += transcript.length
    const expected = (characters / totalCharacters) * spokenDurationMs + (index + 1) * expectedPauseMs
    const possible = candidates.filter((pause) => pause.start > after)
    const nearby = possible.filter((pause) => Math.abs((pause.start + pause.end) / 2 - expected) <= 7_000)
    // The first chapters contain clear one-second separators: prefer the longest nearby pause,
    // which avoids mistaking a sentence break for the chapter boundary. Later, when Gemini makes
    // the separators shorter, the expected transcript position is the more reliable signal.
    const pool = index < 4 && nearby.length > 0
      ? [...nearby].sort((a, b) => (b.end - b.start) - (a.end - a.start))
      : possible
    const pause = index < 4 && nearby.length > 0 ? pool[0] : pool.reduce((best, candidate) => {
      const candidateDistance = Math.abs((candidate.start + candidate.end) / 2 - expected)
      const bestDistance = Math.abs((best.start + best.end) / 2 - expected)
      return candidateDistance < bestDistance ? candidate : best
    }, pool[0])
    if (!pause) throw new Error(`Could not locate narration pause ${index + 1}`)
    after = pause.end
    return pause
  })
  if (pauses.length !== files.length - 1) {
    throw new Error(`Could not find ${files.length - 1} narration pauses in the continuous take (found ${pauses.length})`)
  }
  const boundaries = [0, ...pauses.map((pause) => (pause.start + pause.end) / 2), totalDurationMs]
  for (let index = 0; index < files.length; index++) {
    await exec("ffmpeg", [
      "-y",
      "-i", master,
      "-ss", (boundaries[index] / 1_000).toFixed(3),
      "-to", (boundaries[index + 1] / 1_000).toFixed(3),
      "-c:a", "pcm_s16le",
      files[index],
    ])
  }
}

function audioData(response: unknown): string | null {
  if (!response || typeof response !== "object") return null
  const direct = (response as { output_audio?: { data?: unknown } }).output_audio?.data
  if (typeof direct === "string") return direct
  const steps = (response as { steps?: unknown }).steps
  if (!Array.isArray(steps)) return null
  const audio = steps
    .flatMap((step) => step && typeof step === "object" && Array.isArray((step as { content?: unknown }).content) ? (step as { content: unknown[] }).content : [])
    .filter((content): content is { type: string; data: string } => !!content && typeof content === "object" && (content as { type?: unknown }).type === "audio" && typeof (content as { data?: unknown }).data === "string")
  return audio.at(-1)?.data ?? null
}

async function existingMetadata(file: string): Promise<AudioMetadata | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as AudioMetadata
  } catch {
    return null
  }
}

async function main() {
  const manifest = await loadManifest(reference!)
  const model = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts"
  const voice = process.env.GEMINI_TTS_VOICE ?? manifest.voice
  const key = process.env.GEMINI_API_KEY
  const dir = audioDir(manifest.slug)
  const metadataFile = path.join(videoDir(manifest.slug), "audio-metadata.json")
  await mkdir(dir, { recursive: true })

  if (dryRun) {
    console.log(`${manifest.title}: ${manifest.segments.length} segments`)
    for (const segment of manifest.segments) console.log(`- ${segment.id}: ${segment.transcript}`)
    console.log(`Model: ${model}; voice: ${voice}; no API call made.`)
    return
  }
  if (!key) throw new Error("GEMINI_API_KEY is required (it is never written to disk)")

  const previous = await existingMetadata(metadataFile)
  const metadata: AudioMetadata = {
    model,
    voice,
    generatedAt: new Date().toISOString(),
    segments: {},
  }

  if (manifest.continuousNarration) {
    const master = path.join(dir, "continuous-narration.wav")
    if (manifest.continuousPauseTags === true) throw new Error("Inline pause tags can be spoken aloud; use plain paragraph breaks")
    const transcript = manifest.segments.map((segment) => segment.transcript).join("\n\n")
    const generationSha256 = createHash("sha256")
      .update(JSON.stringify({ transcript, style: manifest.voiceStyle, model, voice, promptVersion: 3 }))
      .digest("hex")
    const files = manifest.segments.map((segment) => path.join(dir, `${segment.id}.wav`))
    const cached = !force && manifest.segments.every((segment, index) =>
      previous?.segments[segment.id]?.file === path.relative(videoDir(manifest.slug), files[index])
      && previous.segments[segment.id].generationSha256 === generationSha256)
    if (resplit) {
      await splitContinuousNarration(master, files, manifest.segments.map((segment) => segment.transcript), await durationMs(master))
      console.log("✓ continuous narration re-split")
    } else if (!cached) {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model,
          input: [{
            type: "user_input",
            content: [{
              type: "text",
              text: transcript,
              annotations: [{
                type: "speech_metadata",
                // Gemini 3.8 anchors identity on the selected voice; long identity directives
                // can increase drift. Keep the requested delivery in metadata, not the text.
                style: manifest.voiceStyle,
              }],
            }],
          }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice }] },
        }),
      })
      const body = await response.json().catch(() => null) as unknown
      if (!response.ok) {
        const detail = JSON.stringify(body)?.slice(0, 500) ?? response.statusText
        throw new Error(`Gemini TTS rejected the continuous narration (${response.status}): ${detail}`)
      }
      const responseShape = body as { status?: string; usage?: unknown; steps?: { type?: string; content?: { type?: string; data?: string }[] }[] }
      await writeFile(path.join(videoDir(manifest.slug), "tts-response-summary.json"), JSON.stringify({
        receivedAt: new Date().toISOString(), status: responseShape.status, usage: responseShape.usage,
        steps: responseShape.steps?.map(s => ({ type: s.type, content: s.content?.map(c => ({ type: c.type, encodedLength: c.data?.length })) })),
      }, null, 2))
      const data = audioData(body)
      if (!data) throw new Error("Gemini TTS returned no audio for the continuous narration")
      const temp = `${master}.tmp`
      await writeFile(temp, Buffer.from(data, "base64"))
      await rename(temp, master)
      await splitContinuousNarration(master, files, manifest.segments.map((segment) => segment.transcript), await durationMs(master))
      console.log("✓ continuous narration")
    }
    for (let index = 0; index < manifest.segments.length; index++) {
      const segment = manifest.segments[index]
      const file = files[index]
      metadata.segments[segment.id] = {
        file: path.relative(videoDir(manifest.slug), file),
        durationMs: await durationMs(file),
        generationSha256,
      }
    }
    await writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`)
    console.log(`Audio ready in ${dir}`)
    return
  }

  for (const segment of manifest.segments) {
    const file = path.join(dir, `${segment.id}.wav`)
    const style = segment.style ?? manifest.voiceStyle
    const generationSha256 = createHash("sha256")
      .update(JSON.stringify({ transcript: segment.transcript, style, model, voice }))
      .digest("hex")
    if (!force && previous?.segments[segment.id]?.file === path.relative(videoDir(manifest.slug), file) && previous.segments[segment.id].generationSha256 === generationSha256) {
      try {
        metadata.segments[segment.id] = { file: path.relative(videoDir(manifest.slug), file), durationMs: await durationMs(file), generationSha256 }
        console.log(`↷ ${segment.id} already exists`)
        continue
      } catch {
        // Missing or invalid audio: regenerate it below.
      }
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model,
        input: [{
          type: "user_input",
          content: [{
            type: "text",
            text: segment.transcript,
            annotations: [{ type: "speech_metadata", style }],
          }],
        }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
      }),
    })
    const body = await response.json().catch(() => null) as unknown
    if (!response.ok) {
      const detail = JSON.stringify(body)?.slice(0, 500) ?? response.statusText
      throw new Error(`Gemini TTS rejected ${segment.id} (${response.status}): ${detail}`)
    }
    const data = audioData(body)
    if (!data) throw new Error(`Gemini TTS returned no audio for ${segment.id}`)
    const temp = `${file}.tmp`
    await writeFile(temp, Buffer.from(data, "base64"))
    await rename(temp, file)
    metadata.segments[segment.id] = { file: path.relative(videoDir(manifest.slug), file), durationMs: await durationMs(file), generationSha256 }
    console.log(`✓ ${segment.id}`)
  }

  await writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`)
  console.log(`Audio ready in ${dir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
