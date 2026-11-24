// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { frameSampleTimes, newStretches, parseBlackdetect, parseFreezedetect, parseSsimAll } from "../picture-checks"

// Real stderr lines of ffmpeg 8.1.1: blackdetect on a clip of 2 s black, 2 s picture, 2 s black.
const BLACKDETECT = [
  "[Parsed_blackdetect_1 @ 0x7731019a40] black_start:0 black_end:2 black_duration:2",
  "[Parsed_blackdetect_1 @ 0x7731019a40] black_start:4 black_end:5.96 black_duration:1.96",
].join("\n")

// Real stderr lines of ffmpeg 8.1.1: the first frozen stretch of event-reports.mp4.
const FREEZEDETECT = [
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: 1.72",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_duration: 2.08",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_end: 3.8",
].join("\n")

// Real stderr line of ffmpeg 8.1.1: a still picture until the end of a 5 s clip.
const FREEZE_WITHOUT_END = "[Parsed_freezedetect_1 @ 0x7cfd41d380] lavfi.freezedetect.freeze_start: 1"
const FREEZE_WITHOUT_END_SAMPLE = [
  "  freezedetect:default -> Stream #0:0 (wrapped_avframe)",
  FREEZE_WITHOUT_END,
].join("\n")

// Real stderr blocks of ffmpeg 8.1.1 from /private/tmp/benevoles-dsh/ffmpeg-samples.txt, including
// the configuration lines FFmpeg prints before the filter output.
const BLACKDETECT_SAMPLE = [
  "  blackdetect:default -> Stream #0:0 (wrapped_avframe)",
  "[Parsed_blackdetect_1 @ 0x7731019a40] black_start:0 black_end:2 black_duration:2",
  "[Parsed_blackdetect_1 @ 0x7731019a40] black_start:4 black_end:5.96 black_duration:1.96",
].join("\n")

const FREEZEDETECT_SAMPLE = [
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: 1.72",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_duration: 2.08",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_end: 3.8",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: 4.08",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_duration: 2.6",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_end: 6.68",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: 7.12",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_duration: 8.44",
  "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_end: 15.56",
].join("\n")

// Real stderr lines of ffmpeg 8.1.1: ssim of two identical PNG frames, then of two different ones.
const SSIM_IDENTICAL = "[Parsed_ssim_0 @ 0x761d008e40] SSIM R:1.000000 (inf) G:1.000000 (inf) B:1.000000 (inf) All:1.000000 (inf)"
const SSIM_DIFFERENT = "[Parsed_ssim_0 @ 0x75eec20840] SSIM R:0.500074 (3.010942) G:0.511205 (3.108736) B:0.529111 (3.270811) All:0.513463 (3.128844)"
const SSIM_WITHOUT_ALL = "[Parsed_ssim_0 @ 0x761d008e40] SSIM R:1.000000 (inf) G:1.000000 (inf) B:1.000000 (inf)"

describe("picture checks", () => {
  it("parses black stretches from FFmpeg blackdetect output", () => {
    expect(parseBlackdetect(BLACKDETECT)).toEqual([
      { startMs: 0, endMs: 2_000 },
      { startMs: 4_000, endMs: 5_960 },
    ])
  })

  it("reads empty blackdetect output as no stretch", () => {
    expect(parseBlackdetect("")).toEqual([])
  })

  it("parses frozen stretches from FFmpeg freezedetect output", () => {
    expect(parseFreezedetect(FREEZEDETECT, 20_000)).toEqual([{ startMs: 1_720, endMs: 3_800 }])
  })

  it("reads empty freezedetect output as no stretch", () => {
    expect(parseFreezedetect("", 20_000)).toEqual([])
  })

  it("closes a freeze still running at the end of the file at the video duration", () => {
    expect(parseFreezedetect(FREEZE_WITHOUT_END, 9_000)).toEqual([{ startMs: 1_000, endMs: 9_000 }])
  })

  it("reads the All value of FFmpeg ssim output", () => {
    expect(parseSsimAll(SSIM_IDENTICAL)).toBe(1)
    expect(parseSsimAll(SSIM_DIFFERENT)).toBe(0.513463)
  })

  it("refuses ssim output without an All value", () => {
    expect(() => parseSsimAll(SSIM_WITHOUT_ALL)).toThrow(/All:/)
  })

  it("samples the middle of every cue and framing interval, sorted and deduplicated", () => {
    expect(frameSampleTimes({ cues: [{ startMs: 0, endMs: 1_000 }, { startMs: 1_000, endMs: 3_000 }], mailpitFocusFrames: [{ startMs: 1_200, endMs: 1_800 }] })).toEqual([500, 1_500, 2_000])
  })

  it("samples every kind of framing interval, once each", () => {
    expect(frameSampleTimes({
      cues: [{ startMs: 2_000, endMs: 4_000 }, { startMs: 4_000, endMs: 6_000 }],
      portraitFrames: [{ startMs: 0, endMs: 1_000 }],
      detailFrames: [{ startMs: 0, endMs: 1_000 }],
      mailpitFocusFrames: [{ startMs: 6_000, endMs: 7_000 }],
    })).toEqual([500, 3_000, 5_000, 6_500])
  })

  it("keeps a stretch within the tolerance of the golden one, on both ends", () => {
    expect(newStretches([{ startMs: 0, endMs: 1_000 }], [{ startMs: 100, endMs: 1_100 }], 200)).toEqual([])
    expect(newStretches([{ startMs: 0, endMs: 1_000 }], [{ startMs: 200, endMs: 1_200 }], 200)).toEqual([])
  })

  it("returns a stretch that has no golden counterpart", () => {
    expect(newStretches([{ startMs: 0, endMs: 1_000 }], [{ startMs: 5_000, endMs: 9_000 }], 200)).toEqual([{ startMs: 5_000, endMs: 9_000 }])
  })

  it("returns a stretch whose end left the tolerance, even when its start did not", () => {
    expect(newStretches([{ startMs: 0, endMs: 1_000 }], [{ startMs: 100, endMs: 1_500 }], 200)).toEqual([{ startMs: 100, endMs: 1_500 }])
  })

  it("keeps parsing the real FFmpeg sample blocks, configuration lines included", () => {
    expect(parseBlackdetect(BLACKDETECT_SAMPLE)).toEqual([
      { startMs: 0, endMs: 2_000 },
      { startMs: 4_000, endMs: 5_960 },
    ])
    expect(parseFreezedetect(FREEZEDETECT_SAMPLE, 20_000)).toEqual([
      { startMs: 1_720, endMs: 3_800 },
      { startMs: 4_080, endMs: 6_680 },
      { startMs: 7_120, endMs: 15_560 },
    ])
  })

  it("refuses a blackdetect line it cannot read instead of dropping it", () => {
    const line = "[Parsed_blackdetect_0 @ 0x761d008e40] black_start: 1.0, black_end: 2.0 black_duration: 1.0"
    expect(() => parseBlackdetect(line)).toThrow(/black_start: 1\.0, black_end: 2\.0/)
  })

  it("refuses a freeze end with no pending start", () => {
    const line = "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_end: 3.8"
    expect(() => parseFreezedetect(line, 20_000)).toThrow(/freeze_end: 3\.8/)
  })

  it("refuses a second freeze start before the previous end", () => {
    const stderr = [
      "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: 1.72",
      "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: 4.08",
    ].join("\n")
    expect(() => parseFreezedetect(stderr, 20_000)).toThrow(/freeze_start: 4\.08/)
  })

  it("refuses a freeze start whose number cannot be read", () => {
    const line = "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: abc"
    expect(() => parseFreezedetect(line, 20_000)).toThrow(/freeze_start: abc/)
  })

  it("refuses a freeze duration whose number cannot be read", () => {
    const line = "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_duration: abc"
    expect(() => parseFreezedetect(line, 20_000)).toThrow(/freeze_duration: abc/)
  })

  it("refuses a freeze end before its start", () => {
    const stderr = [
      "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_start: 3.8",
      "[Parsed_freezedetect_0 @ 0x7c9100a640] lavfi.freezedetect.freeze_end: 1.72",
    ].join("\n")
    expect(() => parseFreezedetect(stderr, 20_000)).toThrow(/freeze_end: 1\.72/)
  })

  it("closes the real open start at the video duration", () => {
    expect(parseFreezedetect(FREEZE_WITHOUT_END_SAMPLE, 9_000)).toEqual([{ startMs: 1_000, endMs: 9_000 }])
  })
})
