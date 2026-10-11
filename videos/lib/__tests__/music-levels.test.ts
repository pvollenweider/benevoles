// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { energyMean, MUSIC_LOOP, musicLevelIssues, musicLevelSummary, musicLoopCopies, musicWindows, parseEbur128Momentary, type MusicWindow } from "../music-levels"

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
  assert.deepEqual(musicLevelSummary(windows), { voicedWindows: 2, musicOnlyWindows: 1, smallestGapLu: 14, largestGapLu: 19, quietestMusicOnlyLufs: -31 })
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
