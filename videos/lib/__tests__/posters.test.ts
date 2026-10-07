// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { mergeRenders, ogPosterFfmpegArgs, parseProbe, posterFfmpegArgs, posterFiles, posterTimestampMs } from "../posters"

describe("posterFiles", () => {
  it("names the poster and the link preview next to the video", () => {
    expect(posterFiles("event-create-blank")).toEqual({
      poster: "event-create-blank/event-create-blank.jpg",
      og: "event-create-blank/event-create-blank-og.jpg",
    })
  })
})

describe("posterTimestampMs", () => {
  it("takes a third of the video by default", () => {
    expect(posterTimestampMs(90_000)).toBe(30_000)
  })

  it("uses the manifest's posterAtMs when it lies inside the video", () => {
    expect(posterTimestampMs(90_000, 12_000)).toBe(12_000)
    expect(posterTimestampMs(90_000, 95_000)).toBe(30_000)
    expect(posterTimestampMs(90_000, -1)).toBe(30_000)
  })
})

describe("ffmpeg arguments", () => {
  it("seeks before the input and writes a single JPEG frame at most 1280 px wide", () => {
    const args = posterFfmpegArgs("in.mp4", "out.jpg", 30_500)
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4)).toEqual(["-ss", "30.500", "-i", "in.mp4"])
    expect(args[args.indexOf("-vf") + 1]).toContain("scale=w='min(1280,iw)':h=-2")
    expect(args).toContain("-frames:v")
    expect(args.at(-1)).toBe("out.jpg")
  })

  it("fits the whole frame into 1200 x 630 for link previews, never cropped", () => {
    const filter = ogPosterFfmpegArgs("in.mp4", "og.jpg", 1000)[ogPosterFfmpegArgs("in.mp4", "og.jpg", 1000).indexOf("-vf") + 1]
    expect(filter).toContain("scale=1200:630:force_original_aspect_ratio=decrease")
    expect(filter).toContain("pad=1200:630")
  })
})

describe("parseProbe", () => {
  it("reads size and duration from ffprobe's JSON", () => {
    const json = JSON.stringify({ streams: [{ width: 1280, height: 800 }], format: { duration: "153.640000" } })
    expect(parseProbe(json)).toEqual({ durationMs: 153_640, width: 1280, height: 800 })
  })

  it("refuses a file without a video stream or a duration", () => {
    expect(() => parseProbe(JSON.stringify({ streams: [], format: { duration: "3" } }))).toThrow()
    expect(() => parseProbe(JSON.stringify({ streams: [{ width: 1, height: 1 }], format: {} }))).toThrow()
  })
})

describe("mergeRenders", () => {
  it("replaces updated entries, keeps the others, and sorts the keys", () => {
    const a = { durationMs: 1000, width: 1, height: 1, poster: false }
    const b = { durationMs: 2000, width: 2, height: 2, poster: true }
    const merged = mergeRenders({ zeta: a, alpha: a }, { alpha: b, mid: b })
    expect(Object.keys(merged)).toEqual(["alpha", "mid", "zeta"])
    expect(merged.alpha).toEqual(b)
    expect(merged.zeta).toEqual(a)
  })
})
