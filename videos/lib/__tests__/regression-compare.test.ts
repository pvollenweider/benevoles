// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { compareRuns, failing, TOLERANCES, type RunFacts } from "../regression-compare"

/** A complete run, valid and equal to itself; each test changes one fact. */
function facts(overrides: Partial<RunFacts> = {}): RunFacts {
  return {
    version: 1,
    tools: { node: "v26.9.0", ffmpeg: "ffmpeg version 8.1.1 Copyright (c) 2000-2026 the FFmpeg developers" },
    vtt: "WEBVTT\n\n00:00:00.500 --> 00:00:02.500\nUne réception.\n",
    txt: "Une réception.\n",
    validationIssues: [],
    mix: { effectsPreset: "normal", music: "music/track.mp3", clicks: 12, keys: 4, effectsSha256: "6b1f" },
    framing: {
      portraitFrames: [{ startMs: 1_000, endMs: 3_000, width: 390, height: 800 }],
      detailFrames: [{ startMs: 4_000, endMs: 5_000, x: 10, y: 20, width: 300, height: 200 }],
      focusFrames: [{ startMs: 6_000, endMs: 7_000 }],
      focusBodyOnly: false,
    },
    size: { width: 1_280, height: 800 },
    frameRate: 25,
    durationMs: 329_840,
    loudness: { smallestGapLu: 3.5, largestGapLu: 8.25, segmentGainsDb: { intro: 1.2, outro: 0.4 } },
    black: [],
    frozen: [{ startMs: 5_000, endMs: 9_000 }],
    frames: [{ atMs: 1_500, ssim: 1 }, { atMs: 2_500, ssim: 1 }],
    videoSha256: "a".repeat(64),
    videoBytes: 12_345_678,
    ...overrides,
  }
}

describe("compareRuns", () => {
  it("finds nothing when a run matches its golden facts", () => {
    expect(compareRuns(facts(), facts())).toEqual([])
  })

  it("reports changed captions as one strict finding", () => {
    const golden = facts()
    expect(compareRuns(golden, facts({ vtt: `${golden.vtt}Une autre ligne.\n` }))).toEqual([
      { class: "strict", field: "vtt", golden: golden.vtt, actual: `${golden.vtt}Une autre ligne.\n` },
    ])
  })

  it("compares every mix, framing, size and frame rate field strictly", () => {
    const golden = facts()
    expect(compareRuns(golden, facts({ mix: { ...golden.mix, clicks: 13 } }))).toEqual([
      { class: "strict", field: "mix.clicks", golden: 12, actual: 13 },
    ])
    expect(compareRuns(golden, facts({ framing: { ...golden.framing, focusFrames: [] } }))).toEqual([
      { class: "strict", field: "framing.focusFrames", golden: golden.framing.focusFrames, actual: [] },
    ])
    expect(compareRuns(golden, facts({ size: { width: 1_280, height: 802 } }))).toEqual([
      { class: "strict", field: "size.height", golden: 800, actual: 802 },
    ])
    expect(compareRuns(golden, facts({ frameRate: 30 }))).toEqual([
      { class: "strict", field: "frameRate", golden: 25, actual: 30 },
    ])
  })

  it("reports a changed width of a portrait frame as one strict finding", () => {
    const golden = facts()
    const actual = facts({
      framing: {
        ...golden.framing,
        portraitFrames: [{ ...golden.framing.portraitFrames[0], width: 392 }],
      },
    })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "strict", field: "framing.portraitFrames", golden: golden.framing.portraitFrames, actual: actual.framing.portraitFrames },
    ])
  })

  it("reports a golden of another version as one strict finding", () => {
    const golden = facts({ version: 2 })
    expect(compareRuns(golden, facts())).toEqual([
      { class: "strict", field: "version", golden: 2, actual: 1 },
    ])
  })

  it("compares the list of sampled frame times strictly", () => {
    const golden = facts()
    const actual = facts({ frames: [{ atMs: 1_500, ssim: 1 }, { atMs: 2_600, ssim: 1 }] })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "strict", field: "frames[].atMs", golden: [1_500, 2_500], actual: [1_500, 2_600] },
    ])
  })

  it("accepts a duration within one frame at 25 frames per second", () => {
    const golden = facts()
    expect(compareRuns(golden, facts({ durationMs: golden.durationMs + 40 }))).toEqual([])
  })

  it("reports a duration one millisecond beyond one frame at 25 frames per second", () => {
    const golden = facts()
    const actual = facts({ durationMs: golden.durationMs + 41 })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "durationMs", golden: golden.durationMs, actual: actual.durationMs },
    ])
  })

  it("holds the same one-frame rule at 50 frames per second", () => {
    const golden = facts({ frameRate: 50 })
    expect(compareRuns(golden, { ...golden, durationMs: golden.durationMs + 20 })).toEqual([])
    expect(compareRuns(golden, { ...golden, durationMs: golden.durationMs + 21 })).toEqual([
      { class: "tolerance", field: "durationMs", golden: golden.durationMs, actual: golden.durationMs + 21 },
    ])
  })

  it("reports a quietness gap that moved beyond half a LU", () => {
    const golden = facts()
    expect(compareRuns(golden, facts({ loudness: { ...golden.loudness, smallestGapLu: golden.loudness.smallestGapLu + 0.5 } }))).toEqual([])
    expect(compareRuns(golden, facts({ loudness: { ...golden.loudness, smallestGapLu: golden.loudness.smallestGapLu + 0.51 } }))).toEqual([
      { class: "tolerance", field: "loudness.smallestGapLu", golden: 3.5, actual: 4.01 },
    ])
  })

  it("reports a segment gain that moved beyond a tenth of a dB", () => {
    const golden = facts()
    expect(compareRuns(golden, facts({ loudness: { ...golden.loudness, segmentGainsDb: { intro: 1.3, outro: 0.4 } } }))).toEqual([])
    expect(compareRuns(golden, facts({ loudness: { ...golden.loudness, segmentGainsDb: { intro: 1.31, outro: 0.4 } } }))).toEqual([
      { class: "tolerance", field: "loudness.segmentGainsDb.intro", golden: 1.2, actual: 1.31 },
    ])
  })

  it("reports a segment present in only one run as a strict finding", () => {
    const golden = facts()
    const extra = facts({ loudness: { ...golden.loudness, segmentGainsDb: { intro: 1.2, outro: 0.4, bonus: 0.2 } } })
    const missing = facts({ loudness: { ...golden.loudness, segmentGainsDb: { intro: 1.2 } } })
    expect(compareRuns(golden, extra)).toEqual([
      { class: "strict", field: "loudness.segmentGainsDb.bonus", golden: null, actual: 0.2 },
    ])
    expect(compareRuns(golden, missing)).toEqual([
      { class: "strict", field: "loudness.segmentGainsDb.outro", golden: 0.4, actual: null },
    ])
  })

  it("reports a frame whose SSIM fell below the minimum", () => {
    const golden = facts()
    const actual = facts({ frames: [{ atMs: 1_500, ssim: 0.97 }, { atMs: 2_500, ssim: 1 }] })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "frames[1500].ssim", golden: 1, actual: 0.97 },
    ])
  })

  it("reports a non-finite actual quietness gap", () => {
    const golden = facts()
    const actual = facts({ loudness: { ...golden.loudness, smallestGapLu: Number.NaN } })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "loudness.smallestGapLu", golden: 3.5, actual: Number.NaN },
    ])
  })

  it("reports a non-finite actual segment gain", () => {
    const golden = facts()
    const actual = facts({ loudness: { ...golden.loudness, segmentGainsDb: { intro: Number.NaN, outro: 0.4 } } })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "loudness.segmentGainsDb.intro", golden: 1.2, actual: Number.NaN },
    ])
  })

  it("reports a non-finite actual duration", () => {
    const golden = facts()
    const actual = facts({ durationMs: Number.NaN })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "durationMs", golden: golden.durationMs, actual: Number.NaN },
    ])
  })

  it("reports two non-finite durations instead of treating them as equal", () => {
    const golden = facts({ durationMs: Number.NaN })
    const actual = facts({ durationMs: Number.NaN })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "durationMs", golden: Number.NaN, actual: Number.NaN },
    ])
  })

  it("refuses an unusable frame rate even when both runs share it", () => {
    const golden = facts({ frameRate: 0 })
    const actual = facts({ frameRate: 0, durationMs: golden.durationMs + 5_000 })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "strict", field: "frameRate", golden: 0, actual: 0 },
      { class: "tolerance", field: "durationMs", golden: golden.durationMs, actual: golden.durationMs + 5_000 },
    ])
  })

  it("refuses two NaN frame rates and judges no duration", () => {
    const golden = facts({ frameRate: Number.NaN })
    const actual = facts({ frameRate: Number.NaN })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "strict", field: "frameRate", golden: Number.NaN, actual: Number.NaN },
      { class: "tolerance", field: "durationMs", golden: golden.durationMs, actual: golden.durationMs },
    ])
  })

  it("refuses an infinite frame rate and judges no duration", () => {
    const golden = facts()
    const actual = facts({ frameRate: Number.POSITIVE_INFINITY })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "strict", field: "frameRate", golden: 25, actual: Number.POSITIVE_INFINITY },
      { class: "tolerance", field: "durationMs", golden: golden.durationMs, actual: golden.durationMs },
    ])
  })

  it("reports a non-finite golden SSIM", () => {
    const golden = facts({ frames: [{ atMs: 1_500, ssim: Number.NaN }, { atMs: 2_500, ssim: 1 }] })
    const actual = facts()
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "frames[1500].ssim", golden: Number.NaN, actual: 1 },
    ])
  })

  it("accepts a still stretch already in the golden, within the tolerance", () => {
    const golden = facts()
    expect(compareRuns(golden, facts({ frozen: [{ startMs: 5_100, endMs: 9_100 }] }))).toEqual([])
  })

  it("reports a black stretch absent from the golden", () => {
    const golden = facts()
    const withBlack = facts({ black: [{ startMs: 12_000, endMs: 14_000 }] })
    expect(compareRuns(golden, withBlack)).toEqual([
      { class: "tolerance", field: "black", golden: [], actual: [{ startMs: 12_000, endMs: 14_000 }] },
    ])
  })

  it("reports a black stretch that is also in the golden", () => {
    const stretch = { startMs: 12_000, endMs: 14_000 }
    const golden = facts({ black: [stretch] })
    const actual = facts({ black: [{ startMs: 12_100, endMs: 14_100 }] })
    expect(compareRuns(golden, actual)).toEqual([
      { class: "tolerance", field: "black", golden: [stretch], actual: [{ startMs: 12_100, endMs: 14_100 }] },
    ])
  })

  it("reports no black finding when the run has none, even when the golden has one", () => {
    const golden = facts({ black: [{ startMs: 12_000, endMs: 14_000 }] })
    expect(compareRuns(golden, facts({ black: [] }))).toEqual([])
  })

  it("reports a frozen stretch absent from the golden", () => {
    const golden = facts()
    const withFreeze = facts({ frozen: [...golden.frozen, { startMs: 20_000, endMs: 24_000 }] })
    expect(compareRuns(golden, withFreeze)).toEqual([
      { class: "tolerance", field: "frozen", golden: golden.frozen, actual: [{ startMs: 20_000, endMs: 24_000 }] },
    ])
  })

  it("reports encoder-dependent values as informative, never failing", () => {
    const golden = facts()
    const actual = facts({
      tools: { ...golden.tools, ffmpeg: "ffmpeg version 8.2" },
      videoSha256: "b".repeat(64),
    })
    const findings = compareRuns(golden, actual)
    expect(findings.map(({ class: findingClass, field }) => ({ class: findingClass, field }))).toEqual([
      { class: "informative", field: "tools.ffmpeg" },
      { class: "informative", field: "videoSha256" },
    ])
    expect(failing(findings)).toEqual([])
  })

  it("reports a non-empty validation result as strict", () => {
    const golden = facts()
    expect(compareRuns(golden, facts({ validationIssues: ["cue 3 overlaps cue 4"] }))).toEqual([
      { class: "strict", field: "validationIssues", golden: [], actual: ["cue 3 overlaps cue 4"] },
    ])
  })

  it("keeps the published tolerances", () => {
    expect(TOLERANCES).toEqual({ durationFrames: 1, loudnessLu: 0.5, segmentGainDb: 0.1, ssimMin: 0.98, stretchMs: 200 })
  })
})
