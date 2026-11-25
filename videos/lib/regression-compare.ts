// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Comparison of a re-assembled reference video with its golden run, by class.
 *
 * Strict facts are structure and text: any difference fails. Tolerance facts move a little between
 * two correct assemblies (duration, loudness, frame SSIM, a still stretch absent from the golden)
 * and are compared with the tolerances below. A black stretch is always a tolerance finding: a
 * golden may never contain one. Informative facts depend on the encoder and are reported, never
 * failing. The runner prints them and decides with `failing`.
 *
 * This module is pure: it compares two `RunFacts` and never runs FFmpeg or reads a file.
 */
import { newStretches, type Interval } from "./picture-checks"

export const TOLERANCES = { durationFrames: 1, loudnessLu: 0.5, segmentGainDb: 0.1, ssimMin: 0.98, stretchMs: 200 } as const

/** Everything a run of the video pipeline states about one video, as compared by the regression loop. */
export type RunFacts = {
  tools: { node: string; ffmpeg: string }
  vtt: string
  txt: string
  validationIssues: string[]
  mix: { effectsPreset: string; music: string; clicks: number; keys: number; effectsSha256: string }
  framing: { portraitFrames: Interval[]; detailFrames: Interval[]; mailpitFocusFrames: Interval[]; mailpitBodyOnly: boolean }
  size: { width: number; height: number }
  frameRate: number
  durationMs: number
  loudness: { smallestGapLu: number; largestGapLu: number; segmentGainsDb: Record<string, number> }
  black: Interval[]
  frozen: Interval[]
  frames: { atMs: number; ssim: number }[]
  videoSha256: string
  videoBytes: number
}

/** One difference between a golden run and an actual run. `field` is a dotted path into `RunFacts`. */
export type Finding = { class: "strict" | "tolerance" | "informative"; field: string; golden: unknown; actual: unknown }

/** The findings that fail the loop; informative ones are only reported. */
export const failing = (findings: Finding[]) => findings.filter((finding) => finding.class !== "informative")

/** Decimal values from JSON and FFmpeg are binary floats: a gap written as the tolerance itself must stay inside it. */
const FLOAT_EPSILON = 1e-9

/**
 * A comparable value must be a real number. FFmpeg prints `0/0` for some streams and `-inf` for
 * silence, so a NaN or infinite value is not a measurement and can never be inside a tolerance:
 * `Math.abs(NaN - x) > tolerance` is false, which used to hide the finding.
 */
function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

function beyondTolerance(observed: number, expected: number, tolerance: number): boolean {
  return Math.abs(observed - expected) > tolerance + FLOAT_EPSILON
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => deepEqual(value, right[index]))
  }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key)
    && deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}

/**
 * Every difference between the golden facts and the actual ones, strict first, then tolerance,
 * then informative. A value inside its tolerance gives no finding. A stretch is compared with the
 * golden through `newStretches`: an accepted still stretch where the narration goes on is not a
 * regression, a new one is.
 */
export function compareRuns(golden: RunFacts, actual: RunFacts): Finding[] {
  const findings: Finding[] = []
  const strict = (field: string, expected: unknown, observed: unknown) => {
    if (!deepEqual(expected, observed)) findings.push({ class: "strict", field, golden: expected, actual: observed })
  }
  const tolerance = (field: string, expected: unknown, observed: unknown) => {
    findings.push({ class: "tolerance", field, golden: expected, actual: observed })
  }
  const toleranceNumber = (field: string, expected: number, observed: number, allowed: number) => {
    if (!isFiniteNumber(expected) || !isFiniteNumber(observed) || beyondTolerance(observed, expected, allowed)) {
      tolerance(field, expected, observed)
    }
  }

  // A frame rate is needed to judge the duration: an unusable one is a strict failure even when
  // both runs carry the same invalid value, and the duration below cannot be judged either.
  const frameRateUsable = isFiniteNumber(golden.frameRate) && golden.frameRate > 0
    && isFiniteNumber(actual.frameRate) && actual.frameRate > 0

  // Strict: text, structure and the list of sampled moments.
  strict("vtt", golden.vtt, actual.vtt)
  strict("txt", golden.txt, actual.txt)
  strict("validationIssues", [], actual.validationIssues)
  strict("mix.effectsPreset", golden.mix.effectsPreset, actual.mix.effectsPreset)
  strict("mix.music", golden.mix.music, actual.mix.music)
  strict("mix.clicks", golden.mix.clicks, actual.mix.clicks)
  strict("mix.keys", golden.mix.keys, actual.mix.keys)
  strict("mix.effectsSha256", golden.mix.effectsSha256, actual.mix.effectsSha256)
  strict("framing.portraitFrames", golden.framing.portraitFrames, actual.framing.portraitFrames)
  strict("framing.detailFrames", golden.framing.detailFrames, actual.framing.detailFrames)
  strict("framing.mailpitFocusFrames", golden.framing.mailpitFocusFrames, actual.framing.mailpitFocusFrames)
  strict("framing.mailpitBodyOnly", golden.framing.mailpitBodyOnly, actual.framing.mailpitBodyOnly)
  strict("size.width", golden.size.width, actual.size.width)
  strict("size.height", golden.size.height, actual.size.height)
  if (frameRateUsable) strict("frameRate", golden.frameRate, actual.frameRate)
  else findings.push({ class: "strict", field: "frameRate", golden: golden.frameRate, actual: actual.frameRate })
  strict("frames[].atMs", golden.frames.map((frame) => frame.atMs), actual.frames.map((frame) => frame.atMs))

  // Strict: the set of loudness segments is structure, even when their gains move within tolerance.
  const goldenSegments = golden.loudness.segmentGainsDb
  const actualSegments = actual.loudness.segmentGainsDb
  const segmentKeys = [...new Set([...Object.keys(goldenSegments), ...Object.keys(actualSegments)])].sort()
  const inGolden = (key: string) => Object.prototype.hasOwnProperty.call(goldenSegments, key)
  const inActual = (key: string) => Object.prototype.hasOwnProperty.call(actualSegments, key)
  for (const key of segmentKeys) {
    if (inGolden(key) !== inActual(key)) {
      findings.push({
        class: "strict",
        field: `loudness.segmentGainsDb.${key}`,
        golden: inGolden(key) ? goldenSegments[key] : null,
        actual: inActual(key) ? actualSegments[key] : null,
      })
    }
  }

  // Tolerance: one frame of duration at the golden frame rate, loudness, frames, still pictures.
  if (!frameRateUsable || !isFiniteNumber(golden.durationMs) || !isFiniteNumber(actual.durationMs)) {
    tolerance("durationMs", golden.durationMs, actual.durationMs)
  } else if (beyondTolerance(actual.durationMs, golden.durationMs, (TOLERANCES.durationFrames * 1_000) / golden.frameRate)) {
    tolerance("durationMs", golden.durationMs, actual.durationMs)
  }
  toleranceNumber("loudness.smallestGapLu", golden.loudness.smallestGapLu, actual.loudness.smallestGapLu, TOLERANCES.loudnessLu)
  toleranceNumber("loudness.largestGapLu", golden.loudness.largestGapLu, actual.loudness.largestGapLu, TOLERANCES.loudnessLu)
  for (const key of segmentKeys) {
    if (!inGolden(key) || !inActual(key)) continue
    toleranceNumber(`loudness.segmentGainsDb.${key}`, goldenSegments[key], actualSegments[key], TOLERANCES.segmentGainDb)
  }
  for (const frame of actual.frames) {
    const goldenFrame = golden.frames.find((candidate) => candidate.atMs === frame.atMs)
    // A sampled moment absent from the golden is a structural difference, already strict above.
    if (goldenFrame === undefined) continue
    if (!isFiniteNumber(goldenFrame.ssim) || !isFiniteNumber(frame.ssim) || frame.ssim < TOLERANCES.ssimMin) {
      tolerance(`frames[${frame.atMs}].ssim`, goldenFrame.ssim, frame.ssim)
    }
  }
  // A golden must never contain a black stretch, so every stretch of the run is a finding, even
  // when the golden happens to carry the same one.
  if (actual.black.length) tolerance("black", golden.black, actual.black)
  const newFrozen = newStretches(golden.frozen, actual.frozen, TOLERANCES.stretchMs)
  if (newFrozen.length) tolerance("frozen", golden.frozen, newFrozen)

  // Informative: values fixed by the tool versions and the encoder, reported but never failing.
  if (golden.tools.node !== actual.tools.node) findings.push({ class: "informative", field: "tools.node", golden: golden.tools.node, actual: actual.tools.node })
  if (golden.tools.ffmpeg !== actual.tools.ffmpeg) findings.push({ class: "informative", field: "tools.ffmpeg", golden: golden.tools.ffmpeg, actual: actual.tools.ffmpeg })
  if (golden.videoSha256 !== actual.videoSha256) findings.push({ class: "informative", field: "videoSha256", golden: golden.videoSha256, actual: actual.videoSha256 })
  if (golden.videoBytes !== actual.videoBytes) findings.push({ class: "informative", field: "videoBytes", golden: golden.videoBytes, actual: actual.videoBytes })

  return findings
}
