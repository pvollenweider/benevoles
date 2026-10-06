// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata, type Timeline } from "../lib/manifest"
import { readableCaptions } from "../lib/captions"

const exec = promisify(execFile)
const reference = process.argv.find((arg) => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1])
if (!reference) throw new Error("Usage: npm run video:assemble -- <VIDEO_ID>")

const two = (value: number) => String(value).padStart(2, "0")
function vttTime(ms: number) {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)
  return `${two(hours)}:${two(minutes)}:${two(seconds)}.${String(ms % 1_000).padStart(3, "0")}`
}

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T
}

async function mediaDuration(file: string): Promise<number> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file])
  const seconds = Number(stdout.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid media duration for ${file}`)
  return seconds
}

async function main() {
  const manifest = await loadManifest(reference!)
  const dir = videoDir(manifest.slug)
  const timeline = await json<Timeline>(path.join(dir, "timeline.json"))
  if (timeline.capturePurpose === "rehearsal") throw new Error("Refusing to assemble a rehearsal as a narrated video; record again against the verified narration first")
  const audio = await json<AudioMetadata>(path.join(dir, "audio-metadata.json"))
  const narrationAudit = await json<{ segments: { id: string; expected: string; audioSha256: string; needsReview: boolean }[] }>(path.join(dir, "narration-audit.json"))
  if (audio.model !== "gemini-3.8-flash-tts" || audio.voice !== manifest.voice) throw new Error("Current Gemini 3.8 narration and manifest voice required")
  if (manifest.continuousNarration && new Set(manifest.segments.map(segment => audio.segments[segment.id]?.generationSha256)).size !== 1) throw new Error("Continuous narration requires a single voice generation for the whole video")
  if (manifest.continuousNarration) {
    const transcript = manifest.segments.map(segment => segment.transcript).join(manifest.continuousPauseTags === false ? "\n\n" : "\n\n<short pause>\n\n")
    const expectedGeneration = createHash("sha256").update(JSON.stringify({ transcript, style: manifest.voiceStyle, model: audio.model, voice: audio.voice, promptVersion: manifest.continuousPauseTags === false ? 3 : 2 })).digest("hex")
    if (manifest.segments.some(segment => audio.segments[segment.id]?.generationSha256 !== expectedGeneration)) throw new Error("Narration instructions changed since generation; regenerate and audit before assembling")
  }
  for (const segment of manifest.segments) {
    const generated = audio.segments[segment.id]
    const checked = narrationAudit.segments.find(item => item.id === segment.id)
    if (!generated || !checked || checked.expected !== segment.transcript || checked.needsReview) throw new Error(`Current narration audit required for ${segment.id}; regenerate/audit before assembling`)
    const actualSha = createHash("sha256").update(await readFile(path.join(dir, generated.file))).digest("hex")
    if (checked.audioSha256 !== actualSha) throw new Error(`Narration changed since audit: ${segment.id}`)
  }
  const capture = path.join(dir, timeline.video)
  const output = path.join(dir, `${manifest.slug}.mp4`)
  await access(capture)
  const captureDuration = await mediaDuration(capture)
  // Never mix overlapping chapters or truncate a narration at the end of the
  // capture. Measure the WAV itself rather than trusting stale metadata.
  for (let index = 0; index < manifest.segments.length; index++) {
    const segment = manifest.segments[index]
    const cue = timeline.cues.find(item => item.id === segment.id)
    const generated = audio.segments[segment.id]
    if (!cue || !generated) throw new Error(`Missing timeline or audio for ${segment.id}`)
    const actualVoiceMs = await mediaDuration(path.join(dir, generated.file)) * 1000
    const next = timeline.cues[index + 1]
    const availableUntil = next?.startMs ?? captureDuration * 1000
    if (cue.startMs + actualVoiceMs > availableUntil + 100) {
      throw new Error(`Narration ${segment.id} exceeds the next chapter/capture by ${Math.round(cue.startMs + actualVoiceMs - availableUntil)} ms; align or recapture before assembling`)
    }
    if (timeline.cues[index]?.id !== segment.id) throw new Error(`Timeline order mismatch for ${segment.id}`)
  }
  const music = process.env.VIDEO_MUSIC_PATH
  if (music) await access(music)

  const cues = new Map(timeline.cues.map((cue) => [cue.id, cue]))
  const inputs: string[] = ["-i", capture]
  const filters: string[] = []
  const labels: string[] = []
  const vtt: string[] = ["WEBVTT", ""]
  const transcript: string[] = [manifest.title, ""]
  let videoMap = "0:v:0"
  if (manifest.slug === "sector-leaders") {
    const phone = cues.get("mobile")
    if (!phone) throw new Error("Missing phone framing cue")
    const start = ((phone.startMs + 500) / 1000).toFixed(3)
    const end = (phone.endMs / 1000).toFixed(3)
    filters.push("[0:v]split=2[desktop][phoneSource]")
    filters.push("[phoneSource]crop=390:800:0:0,pad=1280:800:445:0:color=0xf8fafc[phoneFrame]")
    filters.push(`[desktop][phoneFrame]overlay=0:0:enable='between(t,${start},${end})'[framedVideo]`)
    videoMap = "[framedVideo]"
  }
  if (timeline.portraitFrames?.length) {
    if (videoMap !== "0:v:0" || timeline.portraitFrames.length !== 1) throw new Error("Unsupported combination of portrait framing intervals")
    const frame = timeline.portraitFrames[0]
    if (frame.width > manifest.viewport.width || frame.height !== manifest.viewport.height || frame.endMs <= frame.startMs) throw new Error("Invalid portrait capture framing")
    const left = Math.floor((manifest.viewport.width - frame.width) / 2)
    filters.push("[0:v]split=2[desktop][phoneSource]")
    filters.push(`[phoneSource]crop=${frame.width}:${frame.height}:0:0,pad=${manifest.viewport.width}:${manifest.viewport.height}:${left}:0:color=0xf8fafc[phoneFrame]`)
    filters.push(`[desktop][phoneFrame]overlay=0:0:enable='between(t,${(frame.startMs / 1000).toFixed(3)},${(frame.endMs / 1000).toFixed(3)})'[framedVideo]`)
    videoMap = "[framedVideo]"
  }
  if (timeline.detailFrames?.length) {
    if (videoMap !== "0:v:0") throw new Error("Detail framing cannot be combined with portrait framing")
    let previousEnd = 0
    const frames = timeline.detailFrames.map(frame => {
      if (frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0 || frame.x + frame.width > manifest.viewport.width || frame.y + frame.height > manifest.viewport.height || frame.endMs <= frame.startMs) throw new Error("Invalid detail capture framing")
      // Hold the actual close-up through the sentence, not just the last click.
      const chapter = timeline.cues.find(cue => cue.startMs <= frame.startMs && cue.endMs >= frame.startMs)
      if (!chapter) throw new Error("Detail framing must start inside a narrated chapter")
      const endMs = Math.max(frame.endMs, chapter.endMs)
      if (frame.startMs < previousEnd) throw new Error("Overlapping detail capture framing intervals")
      previousEnd = endMs
      return { ...frame, endMs }
    })
    filters.push(`[0:v]split=${frames.length + 1}[detailBase]${frames.map((_, index) => `[detailSource${index}]`).join("")}`)
    let previous = "detailBase"
    for (const [index, frame] of frames.entries()) {
      filters.push(`[detailSource${index}]crop=${frame.width}:${frame.height}:${frame.x}:${frame.y},scale=${manifest.viewport.width}:${manifest.viewport.height}[detailFrame${index}]`)
      const next = `detailOutput${index}`
      filters.push(`[${previous}][detailFrame${index}]overlay=0:0:enable='between(t,${(frame.startMs / 1000).toFixed(3)},${(frame.endMs / 1000).toFixed(3)})'[${next}]`)
      previous = next
    }
    videoMap = `[${previous}]`
  }

  manifest.segments.forEach((segment, index) => {
    const cue = cues.get(segment.id)
    const generated = audio.segments[segment.id]
    if (!cue || !generated) throw new Error(`Missing timeline or audio for ${segment.id}`)
    inputs.push("-i", path.join(dir, generated.file))
    const label = `voice${index}`
    filters.push(`[${index + 1}:a]adelay=delays=${cue.startMs}:all=1[${label}]`)
    labels.push(`[${label}]`)
    for (const caption of readableCaptions(segment.transcript, cue.startMs, generated.durationMs)) vtt.push(`${vttTime(caption.startMs)} --> ${vttTime(caption.endMs)}`, caption.text, "")
    transcript.push(segment.transcript, "")
  })
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000[narration]`)
  if (music) {
    const musicInput = manifest.segments.length + 1
    const fadeOut = Math.max(0, captureDuration - 2)
    inputs.push("-stream_loop", "-1", "-i", music)
    filters.push(`[${musicInput}:a]atrim=duration=${captureDuration.toFixed(3)},volume=0.075,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut.toFixed(3)}:d=2,aresample=48000[music]`)
    filters.push("[narration][music]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000,apad[final]")
  } else {
    filters.push("[narration]apad[final]")
  }

  await exec("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", videoMap,
    "-map", "[final]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-shortest",
    output,
  ], { maxBuffer: 10 * 1024 * 1024 })

  await writeFile(path.join(dir, `${manifest.slug}.vtt`), `${vtt.join("\n")}\n`)
  await writeFile(path.join(dir, `${manifest.slug}.txt`), `${transcript.join("\n").trim()}\n`)
  console.log(`Video ready: ${output}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
