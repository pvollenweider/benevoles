// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "vitest"
import { assertNarrationGeneration } from "../narration-generation"

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
