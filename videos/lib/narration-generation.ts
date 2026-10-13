// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { splitSentences } from "./sentence-timing"

export type GenerationManifest = {
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
  sentenceRevision?: SentenceRevision
}

/** Explicit provenance for a continuous base with only edited sentences replaced. */
export type SentenceRevision = {
  version: 1
  unit?: "sentence" | "clause"
  baseline: GenerationManifest
  baseGenerationSha256: string
  chapters: Record<string, { sourceAudioSha256: string; boundariesMs?: number[]; sentences: { index: number; transcript: string; generationSha256: string; audioSha256: string }[] }>
}
export const revisionSentences = (text: string, unit: SentenceRevision["unit"]) => unit === "sentence"
  ? text.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean)
  : splitSentences(text)
export const sentenceGenerationSha256 = (transcript: string, style: string, model: string, voice: string) =>
  createHash("sha256").update(JSON.stringify({ transcript, style, model, voice })).digest("hex")
export const revisedGenerationSha256 = (manifest: GenerationManifest, model: string, revision: SentenceRevision) =>
  createHash("sha256").update(JSON.stringify({ transcript: manifest.segments.map(s => s.transcript).join("\n\n"), style: manifest.voiceStyle, model, voice: manifest.voice, sentenceRevision: revision })).digest("hex")

/** One identified continuous base or explicitly proved sentence revision matching
 * the current entire script and delivery instructions.
 * This is provenance, not an assurance of audible voice consistency or synchrony.
 */
export function assertNarrationGeneration(manifest: GenerationManifest, audio: GenerationMetadata) {
  assert(manifest.continuousNarration === true, "A continuous narration base is required")
  assert(manifest.continuousPauseTags !== true, "Obsolete pause instructions require regenerated narration")
  assert.equal(audio.model, "gemini-3.8-flash-tts", "Gemini 3.8 TTS narration is required")
  assert.equal(audio.voice, manifest.voice, "Narration voice differs from the current manifest")
  if (audio.sentenceRevision) {
    const revision = audio.sentenceRevision
    assert.equal(revision.version, 1)
    assert(revision.unit === undefined || revision.unit === "sentence" || revision.unit === "clause", "Unknown narration revision unit")
    assert.equal(revision.baseline.voice, manifest.voice, "Sentence revision cannot change voice")
    assert.equal(revision.baseline.voiceStyle, manifest.voiceStyle, "Sentence revision cannot change delivery")
    assert.equal(revision.baseline.segments.length, manifest.segments.length)
    assertNarrationGeneration(revision.baseline, { model: audio.model, voice: audio.voice, segments: Object.fromEntries(revision.baseline.segments.map(s => [s.id, { generationSha256: revision.baseGenerationSha256 }])) })
    for (const [index, segment] of manifest.segments.entries()) {
      const original = revision.baseline.segments[index]
      assert.equal(original.id, segment.id, "Sentence revision cannot change chapter IDs/order")
      const before = revisionSentences(original.transcript, revision.unit), after = revisionSentences(segment.transcript, revision.unit)
      assert.equal(before.length, after.length, "Sentence revision must preserve sentence boundaries")
      const chapter = revision.chapters[segment.id]
      assert(chapter && /^[a-f0-9]{64}$/.test(chapter.sourceAudioSha256), "Original audio proof required")
      if (chapter.boundariesMs) assert(chapter.boundariesMs.length === before.length + 1 && chapter.boundariesMs[0] === 0 && chapter.boundariesMs.every((value, i, all) => Number.isFinite(value) && (i === 0 || value > all[i - 1])), "Sentence boundaries must be finite and increasing")
      const changed = after.map((text, i) => text !== before[i] ? i : -1).filter(i => i >= 0)
      assert.deepEqual(chapter.sentences.map(s => s.index), changed, "Generate only changed sentences")
      for (const replacement of chapter.sentences) {
        assert.equal(replacement.transcript, after[replacement.index])
        assert.equal(replacement.generationSha256, sentenceGenerationSha256(replacement.transcript, manifest.voiceStyle, audio.model, audio.voice))
        assert(/^[a-f0-9]{64}$/.test(replacement.audioSha256), "Replacement audio proof required")
      }
    }
    const expected = revisedGenerationSha256(manifest, audio.model, revision)
    for (const segment of manifest.segments) assert.equal(audio.segments[segment.id]?.generationSha256, expected, "Sentence revision proof outdated")
    return expected
  }
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
