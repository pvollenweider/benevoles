// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

type GenerationManifest = {
  continuousNarration?: boolean
  continuousPauseTags?: boolean
  voice: string
  voiceStyle: string
  segments: { id: string; transcript: string }[]
}
type GenerationMetadata = {
  model: string
  voice: string
  segments: Record<string, { generationSha256?: string }>
}

/** One identified take matching the current entire script and delivery instructions.
 * This is provenance, not an assurance of audible voice consistency or synchrony.
 */
export function assertNarrationGeneration(manifest: GenerationManifest, audio: GenerationMetadata) {
  assert(manifest.continuousNarration === true, "One continuous narration take is required")
  assert(manifest.continuousPauseTags !== true, "Obsolete pause instructions require regenerated narration")
  assert.equal(audio.model, "gemini-3.8-flash-tts", "Gemini 3.8 TTS narration is required")
  assert.equal(audio.voice, manifest.voice, "Narration voice differs from the current manifest")
  const expected = createHash("sha256").update(JSON.stringify({
    transcript: manifest.segments.map(segment => segment.transcript).join("\n\n"),
    style: manifest.voiceStyle,
    model: audio.model,
    voice: audio.voice,
    promptVersion: 3,
  })).digest("hex")
  assert(manifest.segments.length > 0, "Narration chapters are required")
  for (const segment of manifest.segments) {
    assert.equal(audio.segments[segment.id]?.generationSha256, expected,
      `${segment.id}: generation proof missing, mixed, or outdated for the current script and voice instructions`)
  }
  return expected
}
