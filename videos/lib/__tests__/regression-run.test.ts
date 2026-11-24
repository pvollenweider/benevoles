// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import {
  buildRunFacts,
  firstDifferingLine,
  goldenRecovery,
  inventoryMetadata,
  missingFrames,
  parseFrameRate,
  parseProbeOutput,
  validationIssuesFromRun,
  valueSummary,
  type RunSources,
} from "../regression-run"
import type { BaselineInventory } from "../baseline-inventory"

describe("parseFrameRate", () => {
  it("converts the fraction ffprobe prints", () => {
    expect(parseFrameRate("25/1")).toBe(25)
    expect(parseFrameRate("50/1")).toBe(50)
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97002997, 6)
  })

  it("accepts a plain number", () => {
    expect(parseFrameRate("25")).toBe(25)
    expect(parseFrameRate(" 24 ")).toBe(24)
  })

  it("refuses a rate that is not a usable measurement", () => {
    for (const rate of ["", "0/0", "25/0", "abc", "-25/1", "0/1", "1/2/3"]) {
      expect(parseFrameRate(rate), rate).toBeNaN()
    }
  })
})

describe("parseProbeOutput", () => {
  const probe = JSON.stringify({
    streams: [{ width: 1280, height: 800, r_frame_rate: "25/1" }],
    format: { duration: "329.840000" },
  })

  it("reads the first video stream and the container duration", () => {
    expect(parseProbeOutput(probe)).toEqual({ width: 1280, height: 800, frameRate: 25, durationMs: 329_840 })
  })

  it("rounds the duration to the nearest millisecond", () => {
    const output = JSON.stringify({
      streams: [{ width: 390, height: 844, r_frame_rate: "30000/1001" }],
      format: { duration: "1.2345" },
    })
    expect(parseProbeOutput(output)).toEqual({ width: 390, height: 844, frameRate: 30_000 / 1_001, durationMs: 1_235 })
  })

  it("keeps an unusable frame rate as NaN, for the comparison to refuse", () => {
    const output = JSON.stringify({
      streams: [{ width: 1280, height: 800, r_frame_rate: "0/0" }],
      format: { duration: "10" },
    })
    expect(parseProbeOutput(output).frameRate).toBeNaN()
  })

  it("refuses output that is not readable JSON", () => {
    expect(() => parseProbeOutput("")).toThrow(/ffprobe/)
    expect(() => parseProbeOutput("not json")).toThrow(/ffprobe/)
  })

  it("refuses a probe without a video stream, a size or a duration", () => {
    expect(() => parseProbeOutput(JSON.stringify({ format: { duration: "10" } }))).toThrow(/ffprobe/)
    expect(() => parseProbeOutput(JSON.stringify({ streams: [{ r_frame_rate: "25/1" }], format: { duration: "10" } }))).toThrow(/ffprobe/)
    expect(() => parseProbeOutput(JSON.stringify({ streams: [{ width: 1, height: 2, r_frame_rate: "25/1" }] }))).toThrow(/ffprobe/)
  })
})

describe("missingFrames", () => {
  it("returns no missing time when every frame is present and non-empty", () => {
    expect(missingFrames([0, 1_500, 3_000], { 0: 10, 1_500: 20, 3_000: 30 })).toEqual([])
  })

  it("returns a sampled time with no frame file", () => {
    expect(missingFrames([0, 1_500, 3_000], { 0: 10, 3_000: 30 })).toEqual([1_500])
  })

  it("returns a sampled time whose frame file is empty", () => {
    expect(missingFrames([0, 1_500], { 0: 10, 1_500: 0 })).toEqual([1_500])
  })

  it("returns no time for an empty sample list", () => {
    expect(missingFrames([], {})).toEqual([])
  })

  it("keeps the sample order and reports every missing time", () => {
    expect(missingFrames([3_000, 0, 1_500], { 1_500: 7 })).toEqual([3_000, 0])
  })
})

describe("goldenRecovery", () => {
  it("does nothing when no golden directory is left", () => {
    expect(goldenRecovery({ current: false, staged: false, aside: false })).toEqual([])
  })

  it("removes a leftover staging directory", () => {
    expect(goldenRecovery({ current: false, staged: true, aside: false })).toEqual(["remove-staged"])
  })

  it("restores a previous golden moved aside without a current one", () => {
    expect(goldenRecovery({ current: false, staged: false, aside: true })).toEqual(["restore-aside"])
  })

  it("removes a previous golden moved aside when the current one is in place", () => {
    expect(goldenRecovery({ current: true, staged: false, aside: true })).toEqual(["remove-aside"])
  })

  it("removes the staging directory before restoring the previous golden", () => {
    expect(goldenRecovery({ current: false, staged: true, aside: true })).toEqual(["remove-staged", "restore-aside"])
  })
})

describe("buildRunFacts", () => {
  // The assembler also writes a timeline checksum the comparison does not use.
  const audioMix = {
    effectsPreset: "soft-input-v2",
    music: "mixkit-tech-house-vibes-130.mp3",
    clicks: 12,
    keys: 4,
    effectsSha256: "6b1f",
    videoSha256: "a".repeat(64),
    timelineSha256: "ignored",
  }
  const source: RunSources = {
    tools: { node: "v26.9.0", ffmpeg: "ffmpeg version 8.1.1" },
    vtt: "WEBVTT\n\n00:00:00.500 --> 00:00:02.500\nUne réception.\n",
    txt: "Une réception.\n",
    validationIssues: [],
    audioMix,
    audioLevels: {
      summary: { smallestGapLu: 13.5, largestGapLu: 19.25 },
      narration: { segmentGainsDb: { intro: 1.2, outro: 0.4 } },
    },
    timeline: { portraitFrames: [{ startMs: 1_000, endMs: 3_000 }], mailpitBodyOnly: true },
    probe: { width: 1_280, height: 800, frameRate: 25, durationMs: 329_840 },
    videoBytes: 12_345_678,
    black: [{ startMs: 4_000, endMs: 5_000 }],
    frozen: [{ startMs: 6_000, endMs: 7_000 }],
    frames: [{ atMs: 1_500, ssim: 1 }],
  }

  it("assembles the facts the comparison expects", () => {
    expect(buildRunFacts(source)).toEqual({
      tools: source.tools,
      vtt: source.vtt,
      txt: source.txt,
      validationIssues: [],
      mix: {
        effectsPreset: "soft-input-v2",
        music: "mixkit-tech-house-vibes-130.mp3",
        clicks: 12,
        keys: 4,
        effectsSha256: "6b1f",
      },
      framing: { portraitFrames: [{ startMs: 1_000, endMs: 3_000 }], detailFrames: [], mailpitFocusFrames: [], mailpitBodyOnly: true },
      size: { width: 1_280, height: 800 },
      frameRate: 25,
      durationMs: 329_840,
      loudness: { smallestGapLu: 13.5, largestGapLu: 19.25, segmentGainsDb: { intro: 1.2, outro: 0.4 } },
      black: [{ startMs: 4_000, endMs: 5_000 }],
      frozen: [{ startMs: 6_000, endMs: 7_000 }],
      frames: [{ atMs: 1_500, ssim: 1 }],
      videoSha256: "a".repeat(64),
      videoBytes: 12_345_678,
    })
  })

  it("turns every missing framing field into its empty default", () => {
    const facts = buildRunFacts({ ...source, timeline: {} })
    expect(facts.framing).toEqual({ portraitFrames: [], detailFrames: [], mailpitFocusFrames: [], mailpitBodyOnly: false })
  })

  it("keeps only the interval bounds of a framing", () => {
    const portraitFrames = [{ startMs: 1_000, endMs: 3_000, width: 390, height: 800 }]
    const facts = buildRunFacts({ ...source, timeline: { portraitFrames } })
    expect(facts.framing.portraitFrames).toEqual([{ startMs: 1_000, endMs: 3_000 }])
  })

  it("drops the values written by the assembler that the comparison does not use", () => {
    const facts = buildRunFacts(source)
    expect(facts.mix).not.toHaveProperty("videoSha256")
    expect(facts.mix).not.toHaveProperty("timelineSha256")
  })
})

describe("validationIssuesFromRun", () => {
  it("returns the issues of a failed validation run", () => {
    expect(validationIssuesFromRun(1, { id: "EVENT_REPORTS", issues: ["capture ends 3000 ms before the timeline"] }, "EVENT_REPORTS"))
      .toEqual(["capture ends 3000 ms before the timeline"])
  })

  it("returns an empty list for a successful validation run", () => {
    expect(validationIssuesFromRun(0, { id: "EVENT_REPORTS", issues: [] }, "EVENT_REPORTS")).toEqual([])
  })

  it("refuses a failed run that lists no issue", () => {
    expect(() => validationIssuesFromRun(1, { id: "EVENT_REPORTS", issues: [] }, "EVENT_REPORTS"))
      .toThrow(/sans lister d'issue/)
  })

  it("refuses a successful run that lists issues", () => {
    expect(() => validationIssuesFromRun(0, { id: "EVENT_REPORTS", issues: ["x"] }, "EVENT_REPORTS"))
      .toThrow(/a réussi.*liste 1 issue/)
  })

  it("refuses the report of another video", () => {
    expect(() => validationIssuesFromRun(0, { id: "OTHER_VIDEO", issues: [] }, "EVENT_REPORTS"))
      .toThrow(/OTHER_VIDEO.*EVENT_REPORTS/)
  })

  it("refuses a report that is not an object with a list of strings", () => {
    expect(() => validationIssuesFromRun(0, null, "EVENT_REPORTS")).toThrow(/illisible/)
    expect(() => validationIssuesFromRun(0, [], "EVENT_REPORTS")).toThrow(/illisible/)
    expect(() => validationIssuesFromRun(0, { id: "EVENT_REPORTS" }, "EVENT_REPORTS")).toThrow(/liste d'issues/)
    expect(() => validationIssuesFromRun(0, { id: "EVENT_REPORTS", issues: [1] }, "EVENT_REPORTS")).toThrow(/liste d'issues/)
  })
})

describe("firstDifferingLine", () => {
  it("finds no difference between equal texts, whatever their line endings", () => {
    expect(firstDifferingLine("a\nb\n", "a\nb\n")).toBeNull()
    expect(firstDifferingLine("a\r\nb", "a\nb")).toBeNull()
  })

  it("returns the first line that differs", () => {
    expect(firstDifferingLine("WEBVTT\n\nUne phrase.\n", "WEBVTT\n\nUne autre phrase.\n"))
      .toEqual({ line: 3, golden: "Une phrase.", actual: "Une autre phrase." })
  })

  it("reports a missing line when one text is longer", () => {
    expect(firstDifferingLine("a\n", "a")).toEqual({ line: 2, golden: "", actual: "" })
    expect(firstDifferingLine("", "x")).toEqual({ line: 1, golden: "", actual: "x" })
  })
})

describe("valueSummary", () => {
  it("prints short values as JSON", () => {
    expect(valueSummary(25, 26)).toBe("25")
    expect(valueSummary(null, 1)).toBe("null")
    expect(valueSummary([{ startMs: 0, endMs: 10 }], [])).toBe('[{"startMs":0,"endMs":10}]')
  })

  it("shortens two long texts to their first differing line", () => {
    const golden = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nUne phrase.\n"
    const actual = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nUne autre phrase.\n"
    expect(valueSummary(golden, actual)).toBe('ligne 4 : "Une phrase."')
    expect(valueSummary(actual, golden)).toBe('ligne 4 : "Une autre phrase."')
  })

  it("truncates a long single line", () => {
    const long = "a".repeat(200)
    expect(valueSummary(long, "short")).toBe(`"${"a".repeat(120)}…"`)
  })
})

describe("inventoryMetadata", () => {
  const inventory: BaselineInventory = {
    version: 1,
    createdAt: "2026-11-24T12:00:00.000Z",
    engineCommit: "188b17e8",
    tools: { node: "v26.9.0", ffmpeg: "ffmpeg version 8.1.1", ffprobe: "ffprobe version 8.1.1", platform: "darwin arm64" },
    music: "music/track.mp3",
    backup: "/backup/baseline",
    videos: { "event-reports": { id: "EVENT_REPORTS", productCommit: "89a884c8", golden: { acceptedAt: "2026-11-24T13:00:00.000Z", note: "x" } } },
    files: { "README.md": { sha256: "a", bytes: 1 } },
  }

  it("keeps every inventory field except its checksums", () => {
    const metadata = inventoryMetadata(inventory)
    expect(metadata).not.toHaveProperty("files")
    expect(metadata.videos).toEqual(inventory.videos)
    expect(metadata.backup).toBe("/backup/baseline")
  })

  it("omits the backup when none is declared", () => {
    const withoutBackup: BaselineInventory = { ...inventory, backup: undefined }
    expect(inventoryMetadata(withoutBackup)).not.toHaveProperty("backup")
  })
})
