// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { alignSentences, parseSilences, type TimedSentence } from "./sentence-timing"

/** Pauses of at least 120 ms under -38 dB: the TTS's breaths between sentences, not between words. */
export const SILENCE_FILTER = "silencedetect=noise=-38dB:d=0.12"

/** Sentence timings of one narration WAV (FFmpeg on the system). */
export async function sentenceTimingsFromAudio(file: string, transcript: string, durationMs: number): Promise<TimedSentence[]> {
  const { stderr } = await promisify(execFile)("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", SILENCE_FILTER, "-f", "null", "-"], { maxBuffer: 16 * 1024 * 1024 })
  return alignSentences(transcript, parseSilences(stderr), durationMs)
}
