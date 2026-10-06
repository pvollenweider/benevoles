// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)
type LocalMedia = { path: string; sha256: string; durationMs: number }
export type NativeEvidenceContext = {
  nativeRoot: string
  currentProduct: { commit: string; buildId: string; productSourceSha256: string }
  insertionStartMs?: number
  /** All audible narrator intervals in the final timeline, not merely segment boundaries. */
  narrationIntervals?: Array<{ startMs: number; endMs: number }>
}
type CommonEvidence = {
  schemaVersion: 1
  captureSessionId: string
  captureStartedAt: string
  captureEndedAt: string
  locale: "fr-FR" | "fr-CH"
  platform: "macOS"
  browser: "com.apple.Safari" | "com.brave.Browser"
  windowTitle: "Un planning accessible — démonstration"
  product: NativeEvidenceContext["currentProduct"] & {
    verifiedAt: string
    verification: "at-capture-start"
  }
  frontWindowGuard: { checkedFromStart: true; lostFocus: false; checks: number; maxGapMs: number }
  video: LocalMedia
  /** Actual events only; no text content or synthetic keystrokes. Times relative to video PTS. */
  inputEvents: Array<{ atMs: number; kind: "click" | "key" }>
}
export type AccessibilityNativeEvidence = CommonEvidence & (
  | {
    kind: "reader"
    reader: "VoiceOver"
    audioProcess: "com.apple.VoiceOver"
    microphone: false
    audio: LocalMedia
    sync: { videoFirstPTS: number; audioFirstPTS: number }
    audioMeasurement: { sha256: string; meanDb: number; maxDb: number }
  }
  | {
    kind: "zoom"
    zoomObservations: Array<{
      percent: 200 | 400
      atMs: number
      method: "native-browser-menu"
      /** A screenshot of the browser's own displayed zoom value, not a CSS label. */
      screenshot: { path: string; sha256: string }
    }>
  }
)
export type NativeInsertionPlan = {
  kind: "reader" | "zoom"
  videoPath: string
  audioPath?: string
  videoTrimStartMs: number
  audioTrimStartMs: number
  durationMs: number
  insertionStartMs: number
  narrationPolicy: "silence-during-real-reader" | "narration-allowed"
  inputEvents: CommonEvidence["inputEvents"]
  /** This evidence never establishes Windows, NVDA or iOS validation. */
  validatedEnvironment: "VoiceOver / Safari / macOS" | "Native browser zoom / macOS"
}

function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Native accessibility evidence: ${message}`)
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
function timestamp(value: string): number {
  requireThat(typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value), "missing ISO capture timestamp")
  const result = Date.parse(value)
  requireThat(Number.isFinite(result), "invalid capture timestamp")
  return result
}
function scopedPath(file: string, nativeRoot: string): string {
  requireThat(path.isAbsolute(nativeRoot) && path.basename(nativeRoot) === "native" && path.basename(path.dirname(nativeRoot)) === "accessibility-keyboard-display" && path.basename(path.dirname(path.dirname(nativeRoot))) === "output", "nativeRoot must be the dedicated accessibility output directory")
  requireThat(typeof file === "string" && path.isAbsolute(file), "artifact paths must be absolute")
  const relative = path.relative(nativeRoot, file)
  requireThat(relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "artifact outside dedicated native directory")
  return path.resolve(file)
}
function media(value: LocalMedia, extension: string, root: string): string {
  requireThat(value && /^[a-f0-9]{64}$/.test(value.sha256), "missing media SHA-256")
  requireThat(finite(value.durationMs) && value.durationMs >= 1000 && value.durationMs <= 180_000, "invalid media duration")
  const result = scopedPath(value.path, root)
  requireThat(path.extname(result) === extension, `expected ${extension} artifact`)
  return result
}

/** Pure fail-closed validation. Legacy clips cannot be retroactively stamped as current. */
export function validateAccessibilityNativeEvidence(evidence: AccessibilityNativeEvidence, context: NativeEvidenceContext): NativeInsertionPlan {
  requireThat(evidence && evidence.schemaVersion === 1 && ["reader", "zoom"].includes(evidence.kind), "unsupported or legacy capture schema")
  requireThat(/^[a-zA-Z0-9-]{16,80}$/.test(evidence.captureSessionId), "missing capture session identity")
  const start = timestamp(evidence.captureStartedAt)
  const end = timestamp(evidence.captureEndedAt)
  requireThat(end > start && end - start <= 185_000, "invalid capture interval")
  requireThat(evidence.product?.verification === "at-capture-start", "product must be verified before capture, never retroactively")
  const verifiedAt = timestamp(evidence.product.verifiedAt)
  requireThat(verifiedAt <= start && start - verifiedAt <= 30_000, "product verification must immediately precede capture")
  for (const key of ["commit", "buildId", "productSourceSha256"] as const) {
    requireThat(Boolean(context.currentProduct[key]) && evidence.product[key] === context.currentProduct[key], `capture ${key} differs from current product`)
  }
  requireThat(/^[a-f0-9]{40}$/.test(evidence.product.commit) && /^[a-f0-9]{64}$/.test(evidence.product.productSourceSha256), "invalid product fingerprints")
  requireThat(["fr-FR", "fr-CH"].includes(evidence.locale) && evidence.platform === "macOS", "French native browser locale and macOS required")
  requireThat(evidence.windowTitle === "Un planning accessible — démonstration", "wrong training window")
  const guard = evidence.frontWindowGuard
  requireThat(guard?.checkedFromStart === true && guard.lostFocus === false && finite(guard.maxGapMs) && guard.maxGapMs > 0 && guard.maxGapMs <= 150, "uninterrupted front-window privacy guard required")
  requireThat(Number.isInteger(guard.checks) && guard.checks >= Math.floor((end - start) / 150), "front-window guard coverage is incomplete")
  const videoPath = media(evidence.video, ".mp4", context.nativeRoot)
  requireThat(Math.abs(evidence.video.durationMs - (end - start)) <= 2000, "video duration differs from capture interval")
  requireThat(Array.isArray(evidence.inputEvents) && evidence.inputEvents.length > 0, "actual input event cues required")
  let previous = -1
  for (const event of evidence.inputEvents) {
    requireThat(Object.keys(event).sort().join(",") === "atMs,kind", "input event cues must never contain typed content")
    requireThat(["click", "key"].includes(event.kind) && finite(event.atMs) && event.atMs >= previous && event.atMs >= 0 && event.atMs < evidence.video.durationMs, "invalid or unordered actual input cue")
    previous = event.atMs
  }
  const insertionStartMs = context.insertionStartMs ?? 0
  requireThat(finite(insertionStartMs) && insertionStartMs >= 0, "invalid insertion point")
  if (evidence.kind === "zoom") {
    requireThat(["com.apple.Safari", "com.brave.Browser"].includes(evidence.browser), "unsupported zoom browser")
    requireThat(Array.isArray(evidence.zoomObservations) && evidence.zoomObservations.length >= 2, "both real zoom levels are required")
    for (const level of [200, 400]) {
      const observation = evidence.zoomObservations.find(item => item.percent === level)
      requireThat(observation && observation.method === "native-browser-menu" && finite(observation.atMs) && observation.atMs >= 0 && observation.atMs < evidence.video.durationMs, `missing actual browser ${level}% zoom evidence`)
      scopedPath(observation.screenshot.path, context.nativeRoot)
      requireThat(path.extname(observation.screenshot.path) === ".png" && /^[a-f0-9]{64}$/.test(observation.screenshot.sha256), "zoom screenshot fingerprint required")
    }
    return { kind: "zoom", videoPath, videoTrimStartMs: 0, audioTrimStartMs: 0, durationMs: evidence.video.durationMs, insertionStartMs, narrationPolicy: "narration-allowed", inputEvents: evidence.inputEvents, validatedEnvironment: "Native browser zoom / macOS" }
  }
  requireThat(evidence.browser === "com.apple.Safari" && evidence.reader === "VoiceOver" && evidence.audioProcess === "com.apple.VoiceOver" && evidence.microphone === false, "reader requires real Safari VoiceOver audio without microphone")
  const audioPath = media(evidence.audio, ".m4a", context.nativeRoot)
  requireThat(evidence.audioMeasurement?.sha256 === evidence.audio.sha256 && finite(evidence.audioMeasurement.meanDb) && finite(evidence.audioMeasurement.maxDb) && evidence.audioMeasurement.meanDb > -55 && evidence.audioMeasurement.maxDb > -45 && evidence.audioMeasurement.maxDb <= 1, "reader audio is silent or unverified")
  requireThat(finite(evidence.sync?.videoFirstPTS) && finite(evidence.sync?.audioFirstPTS), "original capture PTS required")
  const deltaMs = (evidence.sync.videoFirstPTS - evidence.sync.audioFirstPTS) * 1000
  requireThat(Math.abs(deltaMs) <= 1000, "native audio/video clock offset exceeds synchronization bound")
  const audioTrimStartMs = Math.max(deltaMs, 0)
  const videoTrimStartMs = Math.max(-deltaMs, 0)
  const durationMs = Math.min(evidence.video.durationMs - videoTrimStartMs, evidence.audio.durationMs - audioTrimStartMs)
  requireThat(durationMs >= 1000 && Math.abs(evidence.video.durationMs - evidence.audio.durationMs) <= 2000, "reader tracks do not cover the same capture")
  for (const interval of context.narrationIntervals ?? []) {
    requireThat(finite(interval.startMs) && finite(interval.endMs) && interval.endMs >= interval.startMs, "invalid narration interval")
    requireThat(interval.endMs <= insertionStartMs || interval.startMs >= insertionStartMs + durationMs, "narration overlaps real VoiceOver; create an actual silent insertion")
  }
  return { kind: "reader", videoPath, audioPath, videoTrimStartMs, audioTrimStartMs, durationMs, insertionStartMs, narrationPolicy: "silence-during-real-reader", inputEvents: evidence.inputEvents.map(event => ({ ...event, atMs: event.atMs - videoTrimStartMs })).filter(event => event.atMs >= 0 && event.atMs < durationMs), validatedEnvironment: "VoiceOver / Safari / macOS" }
}

async function verifyArtifact(file: string, expectedHash: string, root: string): Promise<void> {
  const canonicalRoot = await realpath(root)
  const canonicalFile = await realpath(scopedPath(file, root))
  requireThat(canonicalFile.startsWith(`${canonicalRoot}${path.sep}`), "artifact symlink escapes native directory")
  requireThat((await stat(canonicalFile)).isFile(), "artifact is not a regular file")
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(canonicalFile)) hash.update(chunk)
  requireThat(hash.digest("hex") === expectedHash, "artifact changed after capture fingerprint")
}
async function durationMs(file: string): Promise<number> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file])
  const duration = Number(stdout.trim()) * 1000
  requireThat(finite(duration) && duration > 0, "unreadable media duration")
  return duration
}
/** Read-only loader checks actual local bytes, durations and nonsilent VoiceOver track. */
export async function loadAccessibilityNativeEvidence(file: string, context: NativeEvidenceContext): Promise<NativeInsertionPlan> {
  scopedPath(file, context.nativeRoot)
  const canonical = await realpath(file)
  requireThat(canonical.startsWith(`${await realpath(context.nativeRoot)}${path.sep}`), "evidence symlink escapes native directory")
  const evidence = JSON.parse(await readFile(canonical, "utf8")) as AccessibilityNativeEvidence
  const plan = validateAccessibilityNativeEvidence(evidence, context)
  await verifyArtifact(evidence.video.path, evidence.video.sha256, context.nativeRoot)
  requireThat(Math.abs(await durationMs(evidence.video.path) - evidence.video.durationMs) <= 100, "actual video duration differs from evidence")
  if (evidence.kind === "zoom") {
    for (const observation of evidence.zoomObservations) await verifyArtifact(observation.screenshot.path, observation.screenshot.sha256, context.nativeRoot)
  } else {
    await verifyArtifact(evidence.audio.path, evidence.audio.sha256, context.nativeRoot)
    requireThat(Math.abs(await durationMs(evidence.audio.path) - evidence.audio.durationMs) <= 100, "actual audio duration differs from evidence")
    const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostdin", "-i", evidence.audio.path, "-vn", "-af", "volumedetect", "-f", "null", "-"], { maxBuffer: 2 * 1024 * 1024 })
    const mean = Number(stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1])
    const max = Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1])
    requireThat(finite(mean) && finite(max) && mean > -55 && max > -45, "actual VoiceOver audio is silent")
    requireThat(Math.abs(mean - evidence.audioMeasurement.meanDb) <= 0.2 && Math.abs(max - evidence.audioMeasurement.maxDb) <= 0.2, "actual audio metrics differ from evidence")
  }
  return plan
}
