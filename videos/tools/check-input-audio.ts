// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { inputAudio } from "../lib/input-audio"
import type { Timeline } from "../lib/manifest"

const timeline: Timeline = { slug: "test", recordedAt: "", video: "", cues: [], inputAudioVersion: 1, inputEvents: [{ kind: "click", atMs: 100 }, { kind: "key", atMs: 500 }] }
const wav = inputAudio(timeline, 1)
assert.equal(wav.length, 96044)
assert.equal(wav.toString("ascii", 0, 4), "RIFF")
assert.equal(wav.readInt16LE(44), 0)
assert.notEqual(wav.readInt16LE(44 + 4801 * 2), 0)
assert.notEqual(wav.readInt16LE(44 + 24001 * 2), 0)
assert.equal(wav.readInt16LE(44 + 40000 * 2), 0)
const peak = (start: number, end: number) => {
  let maximum = 0
  for (let sample = start; sample < end; sample++) maximum = Math.max(maximum, Math.abs(wav.readInt16LE(44 + sample * 2)))
  return maximum
}
assert.ok(peak(4800, 7000) > 8000, "click must remain audible in the v2 mix")
assert.ok(peak(24000, 26000) < 6000, "keys must remain quieter than clicks")
assert.throws(() => inputAudio({ ...timeline, inputAudioVersion: undefined }, 1))
assert.throws(() => inputAudio({ ...timeline, inputEvents: [{ kind: "key", atMs: -1 }] }, 1))
assert.throws(() => inputAudio({ ...timeline, inputEvents: [{ kind: "click", atMs: NaN }] }, 1))
assert.throws(() => inputAudio(timeline, Infinity))
console.log("Input audio checks passed: WAV format, separate click/key timings, silence and invalid input rejection.")
