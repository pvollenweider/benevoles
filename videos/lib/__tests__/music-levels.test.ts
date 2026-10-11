// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { energyMean, frameLevels, medianVoiceLufs, MUSIC_LOOP, musicLevelIssues, musicLevelSummary, musicLoopCopies, musicWindows, NARRATION_LEVEL, parseEbur128Integrated, parseEbur128Momentary, segmentGainDb, type MusicWindow } from "../music-levels"

const frames = (seconds: number, level: number) => Array.from({ length: Math.round(seconds * 10) }, () => level)
const options = { durationS: 10, fadeInS: 0, fadeOutS: 0 }

test("parses ffmpeg ebur128 frame logs, silence included", () => {
  const log = [
    "[Parsed_ebur128_0 @ 0x1] t: 0.0999773  TARGET:-23 LUFS    M:-120.7 S:-120.7     I: -70.0 LUFS       LRA:   0.0 LU",
    "[Parsed_ebur128_0 @ 0x1] t: 0.499977   TARGET:-23 LUFS    M: -11.7 S:-120.7     I: -11.7 LUFS       LRA:   0.0 LU",
    "  Integrated loudness:",
  ].join("\n")
  assert.deepEqual(parseEbur128Momentary(log), [{ t: 0.0999773, m: -120.7 }, { t: 0.499977, m: -11.7 }])
})

test("averages loudness by energy, not by decibels", () => {
  assert.equal(Math.round(energyMean([-20, -20]) * 10) / 10, -20)
  assert.equal(Math.round(energyMean([-20, -120]) * 10) / 10, -23)
})

test("music 16 LU under a speaking voice passes", () => {
  const windows = musicWindows(frames(10, -16), frames(10, -32), frames(10, -16), options)
  assert.ok(windows.length > 0 && windows.every(window => window.kind === "voiced"))
  assert.deepEqual(musicLevelIssues(windows), [])
})

test("music closer than 12 LU to the voice is too loud", () => {
  const issues = musicLevelIssues(musicWindows(frames(10, -16), frames(10, -26), frames(10, -16), options))
  assert.ok(issues.length > 0 && issues.every(issue => issue.includes("too loud")))
})

test("music more than 20 LU under the voice is inaudible, like the old loop hole", () => {
  const issues = musicLevelIssues(musicWindows(frames(10, -16), frames(10, -77), frames(10, -16), options))
  assert.ok(issues.length > 0 && issues.every(issue => issue.includes("inaudible")))
})

test("judges voiced windows on the speech frames only, not the pauses between sentences", () => {
  // Half speech, half pause: the music under the pause does not count against the voice.
  const voice = [...frames(1.5, -16), ...frames(1.5, -120.7)]
  const music = [...frames(1.5, -32), ...frames(1.5, -25)]
  const [window] = musicWindows(voice, music, music, { durationS: 3, fadeInS: 0, fadeOutS: 0 })
  assert.equal(window.kind, "voiced")
  assert.equal(window.kind === "voiced" && window.gapLu, 16)
})

test("music alone must stay above -36 LUFS", () => {
  const silence = frames(10, -120.7)
  assert.deepEqual(musicLevelIssues(musicWindows(silence, frames(10, -31), frames(10, -31), options)), [])
  const issues = musicLevelIssues(musicWindows(silence, frames(10, -40), frames(10, -40), options))
  assert.ok(issues.length > 0 && issues.every(issue => issue.includes("music alone")))
})

test("windows partly spoken are not judged, and fades are left out", () => {
  const voice = [...frames(1, -16), ...frames(9, -120.7)]
  const windows = musicWindows(voice, frames(10, -32), frames(10, -32), { durationS: 10, fadeInS: 1.5, fadeOutS: 2 })
  assert.equal(windows[0].startS, 1.5)
  assert.ok(windows.every(window => window.startS + 3 <= 8))
})

test("summarizes the extreme gaps and the quietest music-only window", () => {
  const windows: MusicWindow[] = [
    { startS: 1, kind: "voiced", voiceLufs: -16, musicLufs: -30, gapLu: 14 },
    { startS: 2, kind: "voiced", voiceLufs: -16, musicLufs: -35, gapLu: 19 },
    { startS: 3, kind: "music-only", levelLufs: -31 },
  ]
  assert.deepEqual(musicLevelSummary(windows), { voicedWindows: 2, musicOnlyWindows: 1, smallestGapLu: 14, largestGapLu: 19, quietestMusicOnlyLufs: -31, loudestMusicOnlyLufs: -31, medianVoiceLufs: -16 })
})

test("loops the steady region enough times to cover the video, crossfades included", () => {
  const length = MUSIC_LOOP.endS - MUSIC_LOOP.startS
  assert.equal(musicLoopCopies(60), 1)
  assert.equal(musicLoopCopies(length), 1)
  assert.equal(musicLoopCopies(121), 2)
  const copies = musicLoopCopies(400)
  assert.ok(copies * length - (copies - 1) * MUSIC_LOOP.crossfadeS >= 400)
  assert.ok((copies - 1) * length - (copies - 2) * MUSIC_LOOP.crossfadeS < 400)
})

test("keeps the « M: nan » frames ffmpeg prints over digital silence (regression: EVENT_CREATE_TEMPLATE)", () => {
  // Dropping them shifted every later frame: speech at 116-119 s was looked up 6 s too late
  // and the narration was judged « music alone at -14 LUFS ».
  const log = [
    "[Parsed_ebur128_0 @ 0x1] t: 0.0999792  TARGET:-23 LUFS    M: -16.0 S: -16.0     I: -16.0 LUFS       LRA:   0.0 LU",
    "[Parsed_ebur128_0 @ 0x1] t: 0.199979   TARGET:-23 LUFS    M:   nan S: -18.9     I: -17.0 LUFS       LRA:   2.9 LU",
    "[Parsed_ebur128_0 @ 0x1] t: 0.299979   TARGET:-23 LUFS    M: -15.0 S: -16.0     I: -16.0 LUFS       LRA:   0.0 LU",
  ].join("\n")
  assert.deepEqual(frameLevels(parseEbur128Momentary(log)), [-16, -120.7, -15])
})

test("places frames by their timestamp, never by their position in the log", () => {
  assert.deepEqual(frameLevels([{ t: 0.1, m: -16 }, { t: 0.3, m: -15 }]), [-16, -120.7, -15])
})

test("a pause louder than 12 LU under the median voice is too loud", () => {
  const voiced = (startS: number): MusicWindow => ({ startS, kind: "voiced", voiceLufs: -16, musicLufs: -32, gapLu: 16 })
  const windows: MusicWindow[] = [voiced(1), voiced(2), voiced(3), { startS: 4, kind: "music-only", levelLufs: -31 }]
  assert.equal(medianVoiceLufs(windows), -16)
  assert.deepEqual(musicLevelIssues(windows), [])
  const issues = musicLevelIssues([...windows, { startS: 5, kind: "music-only", levelLufs: -14 }])
  assert.equal(issues.length, 1)
  assert.ok(issues[0].includes("too loud for a pause"))
})

test("reads the integrated loudness of an ebur128 summary", () => {
  const log = "t: 1.2 TARGET:-23 LUFS M: -20.0 S: -21.0 I: -22.0 LUFS LRA: 1.0 LU\n  Integrated loudness:\n    I:         -17.7 LUFS\n    Threshold: -27.8 LUFS"
  assert.equal(parseEbur128Integrated(log), -17.7)
  assert.equal(parseEbur128Integrated("    I:          -inf LUFS"), null)
})

test("brings every narration chapter to the same loudness, within a safe gain", () => {
  assert.equal(segmentGainDb(-16.1), -1.9)
  assert.equal(segmentGainDb(-21), 3)
  assert.equal(segmentGainDb(-60), NARRATION_LEVEL.maxSegmentGainDb)
  assert.equal(segmentGainDb(null), 0)
})
