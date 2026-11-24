// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure helpers of the regression runner: turn the JSON files and the FFmpeg/FFprobe output of a
 * run into `RunFacts`, check that a validation report agrees with its exit code, and choose what
 * to print for a finding.
 *
 * The runner itself (`videos/tools/regress-baseline.ts`) only orchestrates child processes and
 * copies: everything that can be decided from strings and objects lives here, under test.
 */
import type { BaselineInventory } from "./baseline-inventory"
import type { Interval } from "./picture-checks"
import type { RunFacts } from "./regression-compare"

/** Width, height, frame rate and duration read from the assembled MP4 by `ffprobe`. */
export type ProbeFacts = { width: number; height: number; frameRate: number; durationMs: number }

/** The parts of `audio-mix.json` the comparison keeps; the assembler writes more. */
export type AudioMixFacts = {
  effectsPreset: string
  music: string
  clicks: number
  keys: number
  effectsSha256: string
  videoSha256: string
}

/** The parts of `audio-levels.json` the comparison keeps. */
export type AudioLevelsFacts = {
  summary: { smallestGapLu: number; largestGapLu: number }
  narration: { segmentGainsDb: Record<string, number> }
}

/** The framing part of the timeline as it is after the run. */
export type TimelineFraming = {
  portraitFrames?: Interval[]
  detailFrames?: Interval[]
  mailpitFocusFrames?: Interval[]
  mailpitBodyOnly?: boolean
}

/** Everything a run states, before it is shaped into the comparison type. */
export type RunSources = {
  tools: { node: string; ffmpeg: string }
  vtt: string
  txt: string
  validationIssues: string[]
  audioMix: AudioMixFacts
  audioLevels: AudioLevelsFacts
  timeline: TimelineFraming
  probe: ProbeFacts
  videoBytes: number
  black: Interval[]
  frozen: Interval[]
  frames: { atMs: number; ssim: number }[]
}

/**
 * `r_frame_rate` from `ffprobe`, a fraction such as `25/1` or `30000/1001`, as a number. A rate
 * that is not a positive finite measurement (`0/0`, `25/0`, a negative or unreadable value) is
 * `NaN`: the comparison refuses it instead of treating it as a frame rate.
 */
export function parseFrameRate(rate: string): number {
  const parts = rate.trim().split("/")
  if (parts.length > 2) return Number.NaN
  const numerator = Number(parts[0])
  const value = parts.length === 2 ? numerator / Number(parts[1]) : numerator
  return Number.isFinite(value) && value > 0 ? value : Number.NaN
}

type ProbeOutput = {
  streams?: { width?: unknown; height?: unknown; r_frame_rate?: unknown }[]
  format?: { duration?: unknown }
}

/**
 * Reads the JSON printed by `ffprobe -show_entries stream=width,height,r_frame_rate
 * -show_entries format=duration`. A missing video stream, size or duration throws: the run cannot
 * be compared. An unusable frame rate is kept as `NaN` for `compareRuns` to report.
 */
export function parseProbeOutput(stdout: string): ProbeFacts {
  let output: ProbeOutput
  try {
    output = JSON.parse(stdout) as ProbeOutput
  } catch {
    throw new Error(`Sortie ffprobe illisible : ${stdout.slice(0, 120) || "(vide)"}`)
  }
  const stream = output.streams?.[0]
  const durationSeconds = Number(output.format?.duration)
  if (
    typeof stream?.width !== "number"
    || typeof stream.height !== "number"
    || typeof stream.r_frame_rate !== "string"
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) {
    throw new Error("Sortie ffprobe incomplète : largeur, hauteur, cadence ou durée absente.")
  }
  return {
    width: stream.width,
    height: stream.height,
    frameRate: parseFrameRate(stream.r_frame_rate),
    durationMs: Math.round(durationSeconds * 1_000),
  }
}

/**
 * The sample times whose frame file is absent or empty, in sample order. `present` maps a sample
 * time to the byte size of the PNG written for it; a time missing from the map has no file. FFmpeg
 * 8.1.1 exits 0 and writes nothing when `-ss` lies past the end of the video, so a regression that
 * shortens the capture must fail here instead of producing a partial golden.
 */
export function missingFrames(atMs: number[], present: Record<number, number>): number[] {
  return atMs.filter((time) => !(present[time] > 0))
}

/** A repair of the golden directories left by an interrupted acceptance, in the order to run it. */
export type GoldenRecoveryAction = "remove-staged" | "restore-aside" | "remove-aside"

/**
 * What to do at the start of an acceptance with the golden directories left by an interrupted
 * swap. An unfinished staging directory always goes first. A previous golden moved aside is put
 * back when the current one is absent (the swap never completed), and removed when the current one
 * is in place (the swap completed but the cleanup did not).
 */
export function goldenRecovery(present: { current: boolean; staged: boolean; aside: boolean }): GoldenRecoveryAction[] {
  const actions: GoldenRecoveryAction[] = []
  if (present.staged) actions.push("remove-staged")
  if (present.aside) actions.push(present.current ? "remove-aside" : "restore-aside")
  return actions
}

function intervals(values: Interval[] | undefined): Interval[] {
  return (values ?? []).map(({ startMs, endMs }) => ({ startMs, endMs }))
}

/** Shapes the JSON files and measurements of a run into the facts `compareRuns` compares. */
export function buildRunFacts(source: RunSources): RunFacts {
  return {
    tools: source.tools,
    vtt: source.vtt,
    txt: source.txt,
    validationIssues: source.validationIssues,
    mix: {
      effectsPreset: source.audioMix.effectsPreset,
      music: source.audioMix.music,
      clicks: source.audioMix.clicks,
      keys: source.audioMix.keys,
      effectsSha256: source.audioMix.effectsSha256,
    },
    framing: {
      portraitFrames: intervals(source.timeline.portraitFrames),
      detailFrames: intervals(source.timeline.detailFrames),
      mailpitFocusFrames: intervals(source.timeline.mailpitFocusFrames),
      mailpitBodyOnly: source.timeline.mailpitBodyOnly ?? false,
    },
    size: { width: source.probe.width, height: source.probe.height },
    frameRate: source.probe.frameRate,
    durationMs: source.probe.durationMs,
    loudness: {
      smallestGapLu: source.audioLevels.summary.smallestGapLu,
      largestGapLu: source.audioLevels.summary.largestGapLu,
      segmentGainsDb: source.audioLevels.narration.segmentGainsDb,
    },
    black: source.black,
    frozen: source.frozen,
    frames: source.frames,
    videoSha256: source.audioMix.videoSha256,
    videoBytes: source.videoBytes,
  }
}

/** Everything of an inventory except its checksums, for `writeInventory` after an acceptance. */
export function inventoryMetadata(inventory: BaselineInventory): Omit<BaselineInventory, "files"> {
  return {
    version: inventory.version,
    createdAt: inventory.createdAt,
    engineCommit: inventory.engineCommit,
    tools: inventory.tools,
    music: inventory.music,
    ...(inventory.backup ? { backup: inventory.backup } : {}),
    videos: inventory.videos,
  }
}

type ValidationReport = { id?: unknown; issues?: unknown }

/**
 * The issues a `validation.json` report carries, once it is proven to belong to this run.
 * `validate.ts` exits non-zero when it lists issues: that is a result, not a crash. Every other
 * disagreement between the exit code and the report means the run cannot be trusted.
 */
export function validationIssuesFromRun(exitCode: number, report: unknown, expectedId: string): string[] {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Résultat de validation illisible : objet JSON attendu.")
  }
  const { id, issues } = report as ValidationReport
  if (id !== expectedId) {
    throw new Error(`Résultat de validation de ${String(id)} au lieu de ${expectedId}.`)
  }
  if (!Array.isArray(issues) || !issues.every((issue) => typeof issue === "string")) {
    throw new Error(`Résultat de validation de ${expectedId} : liste d'issues absente ou illisible.`)
  }
  if (exitCode !== 0 && issues.length === 0) {
    throw new Error(`validate.ts a échoué (code ${exitCode}) sans lister d'issue pour ${expectedId}.`)
  }
  if (exitCode === 0 && issues.length > 0) {
    throw new Error(`validate.ts a réussi (code 0) mais liste ${issues.length} issue(s) pour ${expectedId}.`)
  }
  return issues
}

/** The first line that differs between two texts, 1-based, and its two versions. */
export type DifferingLine = { line: number; golden: string; actual: string }

/**
 * First line that differs between two texts, ignoring CRLF vs LF; `null` when they are identical.
 * A line missing from one text is an empty string there, so a trailing newline counts as a line.
 */
export function firstDifferingLine(golden: string, actual: string): DifferingLine | null {
  const goldenLines = golden.split(/\r?\n/)
  const actualLines = actual.split(/\r?\n/)
  const count = Math.max(goldenLines.length, actualLines.length)
  for (let index = 0; index < count; index++) {
    if (goldenLines[index] !== actualLines[index]) {
      return { line: index + 1, golden: goldenLines[index] ?? "", actual: actualLines[index] ?? "" }
    }
  }
  return null
}

function clip(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * A printable value for a finding. A long or multi-line text (a VTT, a transcript) is shortened
 * to its first differing line, with its line number: printing two whole subtitle files hides the
 * one line that changed. Other values are printed as JSON.
 */
export function valueSummary(value: unknown, counterpart: unknown, maxLength = 120): string {
  if (typeof value !== "string") return JSON.stringify(value) ?? String(value)
  const multiline = value.includes("\n") || (typeof counterpart === "string" && counterpart.includes("\n"))
  if (multiline && typeof counterpart === "string") {
    const difference = firstDifferingLine(counterpart, value)
    if (difference) return `ligne ${difference.line} : ${JSON.stringify(clip(difference.actual, maxLength))}`
  }
  const firstLine = value.split(/\r?\n/, 1)[0]
  if (value.includes("\n")) return `ligne 1 : ${JSON.stringify(clip(firstLine, maxLength))} …`
  return JSON.stringify(clip(value, maxLength))
}
