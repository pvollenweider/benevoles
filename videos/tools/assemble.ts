// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata, type Timeline } from "../lib/manifest"
import { readableCaptions } from "../lib/captions"
import { inputAudio } from "../lib/input-audio"
import { frameLevels, MUSIC_LOOP, MUSIC_MIX, MUSIC_RULE, musicLevelIssues, musicLevelSummary, musicLoopCopies, musicWindows, NARRATION_LEVEL, parseEbur128Integrated, parseEbur128Momentary, segmentGainDb } from "../lib/music-levels"

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

async function integratedLoudness(file: string): Promise<number | null> {
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { maxBuffer: 64 * 1024 * 1024 })
  return parseEbur128Integrated(stderr)
}

async function main() {
  const manifest = await loadManifest(reference!)
  const dir = videoDir(manifest.slug)
  const musicGainDb = manifest.musicGainDb ?? 0
  if (!Number.isFinite(musicGainDb) || Math.abs(musicGainDb) > 3) throw new Error("Music gain must be finite and between -3 and 3 dB; the measured music rule is unchanged")
  const musicMix = { ...MUSIC_MIX, volume: MUSIC_MIX.volume * 10 ** (musicGainDb / 20), gainDb: musicGainDb }
  if (["SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "SHIFT_ROSTER_VISIBILITY", "MEMBERS_INVITATIONS", "MEMBERS_REMINDERS", "PLATFORM_INTERNAL_ADMINISTRATION"].includes(manifest.id)) {
    await (await import("./focus-mailpit")).focusMailpit(manifest.id)
  }
  const timeline = await json<Timeline>(path.join(dir, "timeline.json"))
  const { stdout: targetMain } = await exec("git", ["rev-parse", "origin/main"])
  if (timeline.product?.commit !== targetMain.trim() || !timeline.product?.buildId || !timeline.product?.productSourceSha256) throw new Error("Capture provenance missing or not on target main; recapture, never retroactively stamp an old video")
  if (timeline.capturePurpose === "rehearsal") throw new Error("Refusing to assemble a rehearsal as a narrated video; record again against the verified narration first")
  const audio = await json<AudioMetadata>(path.join(dir, "audio-metadata.json"))
  const narrationAudit = await json<{ promptVersion?: number; segments: { id: string; expected: string; audioSha256: string; needsReview: boolean }[] }>(path.join(dir, "narration-audit.json"))
  if (narrationAudit.promptVersion !== 2) throw new Error("Multilingual narration audit required: recheck for spoken stage directions before assembling")
  if (audio.model !== "gemini-3.8-flash-tts" || audio.voice !== manifest.voice) throw new Error("Current Gemini 3.8 narration and manifest voice required")
  if (manifest.continuousNarration) {
    const { assertNarrationGeneration } = await import("../lib/narration-generation")
    assertNarrationGeneration(manifest, audio)
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
  if (!music) throw new Error("VIDEO_MUSIC_PATH required for music-backed tutorials")
  await access(music)
  const effects = path.join(dir, "input-effects.wav")
  if (!timeline.inputEvents?.length) throw new Error("No recorded interactions: check the input tracker before assembling a tutorial")
  await writeFile(effects, inputAudio(timeline, captureDuration))

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
    const scope = cues.get("scope"), signup = cues.get("new-signup")
    if (!scope || !signup) throw new Error("Missing desktop restoration framing cues")
    const start = (phone.startMs / 1000).toFixed(3)
    const end = (scope.startMs / 1000).toFixed(3)
    // Chromium's native recording exposes 713 physical rows after a resize.
    // Crop only that recorder padding, then put the real viewport on the page background.
    // A navigation repaints the full desktop surface at the start of new-signup.
    filters.push("[0:v]split=3[desktop][phoneSource][restoredDesktopSource]")
    filters.push("[phoneSource]crop=390:712:0:0,pad=1280:800:445:0:color=0xf8fafc[phoneFrame]")
    filters.push(`[desktop][phoneFrame]overlay=0:0:enable='between(t,${start},${end})'[phoneFramedVideo]`)
    filters.push("[restoredDesktopSource]crop=1280:712:0:0,pad=1280:800:0:0:color=0xf8fafc[restoredDesktopFrame]")
    filters.push(`[phoneFramedVideo][restoredDesktopFrame]overlay=0:0:enable='between(t,${end},${((signup.startMs + 1000) / 1000).toFixed(3)})'[framedVideo]`)
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

  if (timeline.mailpitFocusFrames?.length) {
    const leaderFraming = manifest.slug === "sector-leaders" && videoMap === "[framedVideo]"
    if ((videoMap !== "0:v:0" && !leaderFraming) || manifest.viewport.width !== 1280 || manifest.viewport.height !== 800) throw new Error("Mailpit focus requires desktop pixels outside any other framing")
    let previousEnd = 0
    for (const frame of timeline.mailpitFocusFrames) {
      if (!Number.isFinite(frame.startMs) || !Number.isFinite(frame.endMs) || frame.startMs < previousEnd || frame.endMs <= frame.startMs || frame.endMs > captureDuration * 1000 + 80) throw new Error("Invalid Mailpit focus interval")
      if (leaderFraming && frame.startMs < cues.get("new-signup")!.startMs + 1040 && frame.endMs > cues.get("mobile")!.startMs - 40) throw new Error("Mailpit focus overlaps leader phone/desktop restoration framing")
      previousEnd = frame.endMs
    }
    const enabled = timeline.mailpitFocusFrames.map(frame => `between(t,${(frame.startMs / 1000).toFixed(3)},${((frame.endMs - 1) / 1000).toFixed(3)})`).join("+")
    // Frame actual Mailpit pixels only. Approved body-only shots exclude its fixed
    // English date; other shots keep headers at their original scale.
    // Compose on the existing frame only after proving the intervals are disjoint.
    filters.push(`${videoMap === "0:v:0" ? "[0:v]" : videoMap}split=2[mailpitBase][mailpitSource]`)
    if (timeline.mailpitBodyOnly && (!["SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "PLATFORM_INTERNAL_ADMINISTRATION", "SHIFT_ROSTER_VISIBILITY"].includes(manifest.id) || timeline.mailpitHolds?.length)) throw new Error("Body-only Mailpit framing requires an approved capture without holds")
    filters.push(timeline.mailpitBodyOnly
      ? (["SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "SHIFT_ROSTER_VISIBILITY"].includes(manifest.id) ? "[mailpitSource]crop=960:536:320:264,scale=1280:714,pad=1280:800:0:43:color=0xf8fafc[mailpitPane]" : "[mailpitSource]crop=960:576:320:224,scale=1280:768,pad=1280:800:0:16:color=0xf8fafc[mailpitPane]")
      : "[mailpitSource]crop=960:800:320:0,pad=1280:800:160:0:color=0xf8fafc[mailpitPane]")
    filters.push(`[mailpitBase][mailpitPane]overlay=0:0:enable='${enabled}'[mailpitFocused]`)
    videoMap = "[mailpitFocused]"
  }

  for (const [index, hold] of (timeline.mailpitHolds ?? []).entries()) {
    if (videoMap === "0:v:0" || !timeline.mailpitFocusFrames?.some(frame => hold.sourceMs >= frame.startMs && hold.sourceMs < frame.endMs) || hold.startMs !== hold.sourceMs || hold.endMs <= hold.startMs || hold.endMs - hold.startMs > 6000 || timeline.inputEvents?.some(event => event.atMs >= hold.startMs && event.atMs < hold.endMs)) throw new Error("Invalid hold of an actual Mailpit frame")
    const start = (hold.sourceMs / 1000).toFixed(3), end = (hold.endMs / 1000).toFixed(3)
    const still = `mailpitStill${index}`, output = `mailpitHeld${index}`
    filters.push(`[0:v]trim=start=${start}:duration=0.04,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${((hold.endMs - hold.startMs) / 1000).toFixed(3)},crop=960:800:320:0,pad=1280:800:160:0:color=0xf8fafc,setpts=PTS+${start}/TB[${still}]`)
    filters.push(`${videoMap}[${still}]overlay=0:0:enable='between(t,${start},${end})'[${output}]`)
    videoMap = `[${output}]`
  }

  const segmentGains: Record<string, number> = {}
  for (const [index, segment] of manifest.segments.entries()) {
    const cue = cues.get(segment.id)
    const generated = audio.segments[segment.id]
    if (!cue || !generated) throw new Error(`Missing timeline or audio for ${segment.id}`)
    const file = path.join(dir, generated.file)
    inputs.push("-i", file)
    // Every chapter at the same loudness before mixing (see NARRATION_LEVEL).
    const gain = segmentGainDb(await integratedLoudness(file))
    segmentGains[segment.id] = gain
    const label = `voice${index}`
    filters.push(`[${index + 1}:a]volume=${gain}dB,adelay=delays=${cue.startMs}:all=1[${label}]`)
    labels.push(`[${label}]`)
    for (const caption of readableCaptions(segment.transcript, cue.startMs, generated.durationMs)) vtt.push(`${vttTime(caption.startMs)} --> ${vttTime(caption.endMs)}`, caption.text, "")
    transcript.push(segment.transcript, "")
  }
  // A measured static gain avoids the gain ramp of single-pass dynamic loudnorm.
  let normalization = "loudnorm=I=-16:LRA=11:TP=-1.5"
  let staticGainDb: number | null = null
  if (manifest.narrationStaticNormalization) {
    const voiceFilters = manifest.segments.map((segment, index) => `[${index + 1}:a]volume=${segmentGains[segment.id]}dB,adelay=delays=${cues.get(segment.id)!.startMs}:all=1[voice${index}]`)
    voiceFilters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,acompressor=${NARRATION_LEVEL.compressor},ebur128[measured]`)
    const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostats", ...inputs, "-filter_complex", voiceFilters.join(";"), "-map", "[measured]", "-f", "null", "-"], { maxBuffer: 64 * 1024 * 1024 })
    const integrated = parseEbur128Integrated(stderr)
    if (integrated === null) throw new Error("Cannot measure static narration normalization")
    staticGainDb = -16 - integrated
    normalization = `volume=${staticGainDb}dB`
  }
  const narrationLevel = { ...NARRATION_LEVEL, staticGainDb }
  // Chapters never overlap: no amix normalization, so the compressor sees the levelled voice.
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,acompressor=${NARRATION_LEVEL.compressor},${normalization},aresample=48000[narration]`)
  const musicInput = manifest.segments.length + 1
  const fadeOut = Math.max(0, captureDuration - 2)
  const copies = musicLoopCopies(captureDuration)
  // Loop only the steady part of the track, crossfaded at each seam, never its own fade-out.
  inputs.push("-i", music)
  filters.push(`[${musicInput}:a]atrim=start=${MUSIC_LOOP.startS}:end=${MUSIC_LOOP.endS},asetpts=PTS-STARTPTS,aresample=48000${copies > 1 ? `,asplit=${copies}${Array.from({ length: copies }, (_, index) => `[loop${index}]`).join("")}` : "[loop0]"}`)
  let bed = "loop0"
  for (let index = 1; index < copies; index++) {
    filters.push(`[${bed}][loop${index}]acrossfade=d=${MUSIC_LOOP.crossfadeS}:c1=tri:c2=tri[bed${index}]`)
    bed = `bed${index}`
  }
  // A compressed bed at a steady level: the narration is already normalized, so a steady
  // music keeps the same distance under it. Ducking was measured to widen that distance
  // (deeper under loud sentences, shallower under quiet ones), so there is none.
  filters.push(`[${bed}]acompressor=${musicMix.compressor},atrim=duration=${captureDuration.toFixed(3)},volume=${musicMix.volume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut.toFixed(3)}:d=2,asplit=2[music][musicStem]`)
  filters.push("[narration]asplit=2[narrationMix][narrationStem]")
  inputs.push("-i", effects)
  filters.push(`[${musicInput + 1}:a]aresample=48000[effects]`)
  // No second loudnorm on the mix: in dynamic mode it lifted the music in every pause
  // (about 5 LU over its level under the voice). The narration already sits at -16 LUFS
  // and the music far under it, so a peak limiter is enough.
  filters.push("[narrationMix][music][effects]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.79:level=false:latency=true,aresample=48000,apad[final]")

  const stems = await mkdtemp(path.join(os.tmpdir(), "benevol-music-stems-"))
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
    "-map", "[narrationStem]", "-c:a", "pcm_s16le", path.join(stems, "voice.wav"),
    "-map", "[musicStem]", "-c:a", "pcm_s16le", path.join(stems, "music.wav"),
  ], { maxBuffer: 10 * 1024 * 1024 })
  const momentary = async (file: string) => {
    const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostats", "-loglevel", "verbose", "-i", file, "-af", "ebur128=framelog=verbose", "-f", "null", "-"], { maxBuffer: 64 * 1024 * 1024 })
    return frameLevels(parseEbur128Momentary(stderr))
  }
  const windows = musicWindows(await momentary(path.join(stems, "voice.wav")), await momentary(path.join(stems, "music.wav")), await momentary(output), { durationS: captureDuration, fadeInS: 1.5, fadeOutS: 2 })
  await rm(stems, { recursive: true, force: true })
  const levelIssues = musicLevelIssues(windows)
  const videoSha256 = createHash("sha256").update(await readFile(output)).digest("hex")
  await writeFile(path.join(dir, "audio-levels.json"), `${JSON.stringify({ rule: MUSIC_RULE, loop: MUSIC_LOOP, mix: musicMix, narration: { ...narrationLevel, segmentGainsDb: segmentGains }, videoSha256, summary: musicLevelSummary(windows), issues: levelIssues, windows }, null, 2)}\n`)

  await writeFile(path.join(dir, `${manifest.slug}.vtt`), `${vtt.join("\n")}\n`)
  await writeFile(path.join(dir, `${manifest.slug}.txt`), `${transcript.join("\n").trim()}\n`)
  await writeFile(path.join(dir, "audio-mix.json"), JSON.stringify({ effectsPreset: "soft-input-v2", music: path.basename(music), clicks: timeline.inputEvents!.filter(event => event.kind === "click").length, keys: timeline.inputEvents!.filter(event => event.kind === "key").length, effectsSha256: createHash("sha256").update(await readFile(effects)).digest("hex"), timelineSha256: createHash("sha256").update(await readFile(path.join(dir, "timeline.json"))).digest("hex"), videoSha256 }, null, 2))
  if (levelIssues.length) throw new Error(`Music level outside the rule (low but audible, never over the narration):\n- ${levelIssues.join("\n- ")}`)
  console.log(`Video ready: ${output}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
