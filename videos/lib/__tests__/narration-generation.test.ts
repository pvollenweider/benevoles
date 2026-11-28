// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "vitest"
import { assertNarrationGeneration, revisedGenerationSha256, sentenceGenerationSha256, takeGenerationSha256, voiceGroups, type SentenceRevision } from "../narration-generation"

const manifest = { continuousNarration: true, continuousPauseTags: false, voice: "Kore", voiceStyle: "Warm and smiling", segments: [{ id: "intro", transcript: "Bonjour." }, { id: "result", transcript: "Voici le résultat." }] }
const hash = createHash("sha256").update(JSON.stringify({ transcript: "Bonjour.\n\nVoici le résultat.", style: manifest.voiceStyle, model: "gemini-3.8-flash-tts", voice: "Kore", promptVersion: 3 })).digest("hex")
const metadata = () => ({ model: "gemini-3.8-flash-tts", voice: "Kore", segments: { intro: { generationSha256: hash }, result: { generationSha256: hash } } })

test("accepts one identified generation matching all current narration instructions", () => {
  assert.equal(assertNarrationGeneration(manifest, metadata()), hash)
})
test("rejects missing and mixed generation proofs", () => {
  const missing = metadata(); delete (missing.segments.result as { generationSha256?: string }).generationSha256
  assert.throws(() => assertNarrationGeneration(manifest, missing))
  const mixed = metadata(); mixed.segments.result.generationSha256 = "another-take"
  assert.throws(() => assertNarrationGeneration(manifest, mixed))
})
test("rejects old models, altered voice, script, style and pause instructions", () => {
  assert.throws(() => assertNarrationGeneration(manifest, { ...metadata(), model: "gemini-2.5-flash-preview-tts" }))
  assert.throws(() => assertNarrationGeneration(manifest, { ...metadata(), voice: "Puck" }))
  assert.throws(() => assertNarrationGeneration({ ...manifest, voiceStyle: "Other delivery" }, metadata()))
  assert.throws(() => assertNarrationGeneration({ ...manifest, segments: [{ id: "intro", transcript: "Changed script." }] }, metadata()))
  assert.throws(() => assertNarrationGeneration({ ...manifest, continuousPauseTags: true }, metadata()))
})

test("sentence revision requires exactly the edited sentences, the verified base and the same voice", () => {
  const revised = { ...manifest, segments: [{ id: "intro", transcript: "Bienvenue." }, manifest.segments[1]] }
  const revision: SentenceRevision = {
    version: 1, baseline: manifest, baseGenerationSha256: hash,
    chapters: {
      intro: { sourceAudioSha256: "a".repeat(64), sentences: [{ index: 0, transcript: "Bienvenue.", generationSha256: sentenceGenerationSha256("Bienvenue.", manifest.voiceStyle, "gemini-3.8-flash-tts", "Kore"), audioSha256: "b".repeat(64) }] },
      result: { sourceAudioSha256: "c".repeat(64), sentences: [] },
    },
  }
  const fingerprint = revisedGenerationSha256(revised, "gemini-3.8-flash-tts", revision)
  const audio = { ...metadata(), sentenceRevision: revision, segments: { intro: { generationSha256: fingerprint }, result: { generationSha256: fingerprint } } }
  assert.equal(assertNarrationGeneration(revised, audio), fingerprint)
  const omitted = structuredClone(audio); omitted.sentenceRevision.chapters.intro.sentences = []
  assert.throws(() => assertNarrationGeneration(revised, omitted))
  const extra = structuredClone(audio); extra.sentenceRevision.chapters.result.sentences = [...revision.chapters.intro.sentences]
  assert.throws(() => assertNarrationGeneration(revised, extra))
  const voice = structuredClone(audio); voice.sentenceRevision.baseline.voice = "Puck"
  assert.throws(() => assertNarrationGeneration(revised, voice))
  const base = structuredClone(audio); base.sentenceRevision.baseGenerationSha256 = "d".repeat(64)
  assert.throws(() => assertNarrationGeneration(revised, base))
  assert.throws(() => assertNarrationGeneration({ ...revised, segments: [{ id: "intro", transcript: "Encore changé." }, manifest.segments[1]] }, audio))
})

test("a full sentence keeps its colon clauses together and validates measured cut order", () => {
  const baseline = { ...manifest, segments: [{ id: "intro", transcript: "Tu vois le résultat : lis la suite." }] }
  const revised = { ...baseline, segments: [{ id: "intro", transcript: "Vous voyez le résultat : lisez la suite." }] }
  const model = "gemini-3.8-flash-tts"
  const baseGenerationSha256 = createHash("sha256").update(JSON.stringify({ transcript: baseline.segments[0].transcript, style: baseline.voiceStyle, model, voice: baseline.voice, promptVersion: 3 })).digest("hex")
  const revision: SentenceRevision = { version: 1, unit: "sentence", baseline, baseGenerationSha256, chapters: { intro: { sourceAudioSha256: "a".repeat(64), boundariesMs: [0, 6000], sentences: [{ index: 0, transcript: revised.segments[0].transcript, generationSha256: sentenceGenerationSha256(revised.segments[0].transcript, revised.voiceStyle, model, revised.voice), audioSha256: "b".repeat(64) }] } } }
  const fingerprint = revisedGenerationSha256(revised, model, revision)
  const audio = { model, voice: revised.voice, sentenceRevision: revision, segments: { intro: { generationSha256: fingerprint } } }
  assert.equal(assertNarrationGeneration(revised, audio), fingerprint)
  const reversed = structuredClone(audio); reversed.sentenceRevision.chapters.intro.boundariesMs = [6000, 0]
  assert.throws(() => assertNarrationGeneration(revised, reversed))
  const clause = structuredClone(audio); clause.sentenceRevision.unit = "clause"
  assert.throws(() => assertNarrationGeneration(revised, clause))
})

// Two voices (presentation videos): one continuous take per voice, each segment proved by its own take.
const twoVoices = {
  continuousNarration: true, continuousPauseTags: false, voice: "Kore", voiceStyle: "Warm storyteller",
  secondVoice: { voice: "Puck", voiceStyle: "Lively hook" },
  segments: [
    { id: "hook", transcript: "Un tableur qui déborde ?", speaker: "second" as const },
    { id: "story", transcript: "Élodie organise la fête." },
    { id: "cta", transcript: "Essayez benevol.app.", speaker: "second" as const },
    { id: "after", transcript: "Après la fête, le bilan." },
  ],
}
const take = (speaker: "main" | "second") => takeGenerationSha256(voiceGroups(twoVoices).find(g => g.speaker === speaker)!, "gemini-3.8-flash-tts", true)
const twoVoiceMetadata = () => ({
  model: "gemini-3.8-flash-tts", voice: "Kore", secondVoice: "Puck",
  segments: { hook: { generationSha256: take("second") }, story: { generationSha256: take("main") }, cta: { generationSha256: take("second") }, after: { generationSha256: take("main") } },
})

test("a one-voice take keeps its historical proof, so every existing narration stays valid", () => {
  assert.equal(takeGenerationSha256(voiceGroups(manifest)[0], "gemini-3.8-flash-tts", false), hash)
})

test("two voices are two takes, each with the segments of its voice in the manifest's order", () => {
  const groups = voiceGroups(twoVoices)
  assert.deepEqual(groups.map(g => [g.speaker, g.voice, g.segments.map(s => s.id)]), [["main", "Kore", ["story", "after"]], ["second", "Puck", ["hook", "cta"]]])
  assert.notEqual(take("main"), take("second"))
})

test("accepts a two-voice narration whose segments are proved by their own voice's take", () => {
  assert.equal(assertNarrationGeneration(twoVoices, twoVoiceMetadata()), take("main"))
})

test("rejects a two-voice narration with a segment from the wrong take, a changed or missing second voice, or a sentence revision", () => {
  const swapped = twoVoiceMetadata(); swapped.segments.hook.generationSha256 = take("main")
  assert.throws(() => assertNarrationGeneration(twoVoices, swapped))
  assert.throws(() => assertNarrationGeneration(twoVoices, { ...twoVoiceMetadata(), secondVoice: "Charon" }))
  const noSecond: Partial<ReturnType<typeof twoVoiceMetadata>> = twoVoiceMetadata(); delete noSecond.secondVoice
  assert.throws(() => assertNarrationGeneration(twoVoices, noSecond as ReturnType<typeof twoVoiceMetadata>))
  assert.throws(() => assertNarrationGeneration({ ...twoVoices, secondVoice: { voice: "Puck", voiceStyle: "Other delivery" } }, twoVoiceMetadata()))
  assert.throws(() => assertNarrationGeneration(twoVoices, { ...twoVoiceMetadata(), sentenceRevision: { version: 1 } as unknown as SentenceRevision }))
})

test("refuses a second voice the manifest does not declare, on either side", () => {
  assert.throws(() => voiceGroups({ ...manifest, segments: [{ id: "intro", transcript: "Bonjour.", speaker: "second" as const }] }))
  assert.throws(() => assertNarrationGeneration(manifest, { ...metadata(), secondVoice: "Puck" }))
  assert.throws(() => voiceGroups({ ...twoVoices, segments: twoVoices.segments.filter(s => s.speaker !== "second") }))
})
