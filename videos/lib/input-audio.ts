// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import type { Timeline } from "./manifest"

/** Locally synthesized, soft sounds. Metadata contains no key names or text. */
export function inputAudio(timeline: Timeline, durationSeconds: number): Buffer {
  if (timeline.inputAudioVersion !== 1 || !timeline.inputEvents) throw new Error("Recapture required: actual interaction timestamps missing")
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Invalid effects duration")
  const rate = 48000
  const samples = new Float32Array(Math.ceil(durationSeconds * rate))
  for (const event of timeline.inputEvents) {
    if (!["click", "key"].includes(event.kind) || !Number.isFinite(event.atMs) || event.atMs < 0 || event.atMs > durationSeconds * 1000 + 100) throw new Error("Invalid interaction timestamp")
    const start = Math.round(event.atMs * rate / 1000)
    const length = Math.round(rate * (event.kind === "click" ? 0.045 : 0.022))
    let random = 1234567
    for (let index = 0; index < length && start + index < samples.length; index++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const t = index / rate
      const noise = random / 4294967296 * 2 - 1
      const envelope = Math.min(1, index / 24) * Math.exp(-t * (event.kind === "click" ? 170 : 220))
      const tone = Math.sin(2 * Math.PI * (event.kind === "click" ? 650 : 1100) * t)
      // Clicks +9.5 dB versus the first pilot; keys remain quieter than clicks.
      samples[start + index] += (noise * 0.35 + tone * 0.65) * envelope * (event.kind === "click" ? 0.48 : 0.14)
    }
  }
  const wav = Buffer.alloc(44 + samples.length * 2)
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write("data", 36); wav.writeUInt32LE(samples.length * 2, 40)
  for (let index = 0; index < samples.length; index++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), 44 + index * 2)
  return wav
}
