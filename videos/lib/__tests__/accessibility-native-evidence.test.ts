// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "vitest"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { loadAccessibilityNativeEvidence, validateAccessibilityNativeEvidence, type AccessibilityNativeEvidence, type NativeEvidenceContext } from "../accessibility-native-evidence"

const root = "/tmp/fixture/videos/output/accessibility-keyboard-display/native"
const product = { commit: "a".repeat(40), buildId: "test-build", productSourceSha256: "b".repeat(64) }
const context: NativeEvidenceContext = { nativeRoot: root, currentProduct: product, insertionStartMs: 5000 }
function reader(): AccessibilityNativeEvidence & { kind: "reader" } {
  return {
    schemaVersion: 1, kind: "reader", captureSessionId: "synthetic-test-session-1234",
    captureStartedAt: "2026-10-06T12:00:00Z", captureEndedAt: "2026-10-06T12:00:10Z",
    locale: "fr-FR", platform: "macOS", browser: "com.apple.Safari", windowTitle: "Un planning accessible — démonstration",
    product: { ...product, verification: "at-capture-start", verifiedAt: "2026-10-06T11:59:59Z" },
    frontWindowGuard: { checkedFromStart: true, lostFocus: false, checks: 100, maxGapMs: 100 },
    video: { path: `${root}/reader.mp4`, sha256: "c".repeat(64), durationMs: 10000 },
    inputEvents: [{ kind: "key", atMs: 1000 }],
    reader: "VoiceOver", audioProcess: "com.apple.VoiceOver", microphone: false,
    audio: { path: `${root}/reader.m4a`, sha256: "d".repeat(64), durationMs: 10100 },
    sync: { videoFirstPTS: 100.1, audioFirstPTS: 100 },
    audioMeasurement: { sha256: "d".repeat(64), meanDb: -25, maxDb: -7 },
  }
}
test("real-reader insertion aligns original timestamps and requires silent narrator window", () => {
  const plan = validateAccessibilityNativeEvidence(reader(), { ...context, narrationIntervals: [{ startMs: 0, endMs: 5000 }, { startMs: 15000, endMs: 16000 }] })
  assert.equal(plan.narrationPolicy, "silence-during-real-reader")
  assert.ok(Math.abs(plan.audioTrimStartMs - 100) < 0.00001)
  assert.ok(Math.abs(plan.durationMs - 10000) < 0.00001)
  assert.equal(plan.validatedEnvironment, "VoiceOver / Safari / macOS")
  assert.throws(() => validateAccessibilityNativeEvidence(reader(), { ...context, narrationIntervals: [{ startMs: 4000, endMs: 6000 }] }), /overlaps/)
})
test("rejects old main, retroactive proof, private path and interrupted privacy guard", () => {
  const stale = reader(); stale.product.commit = "e".repeat(40)
  assert.throws(() => validateAccessibilityNativeEvidence(stale, context), /commit differs/)
  const retro = reader(); retro.product.verifiedAt = "2026-10-06T12:00:01Z"
  assert.throws(() => validateAccessibilityNativeEvidence(retro, context), /precede capture/)
  const outside = reader(); outside.audio.path = "/tmp/private-reader.m4a"
  assert.throws(() => validateAccessibilityNativeEvidence(outside, context), /outside/)
  const interrupted = reader(); Object.assign(interrupted.frontWindowGuard, { lostFocus: true })
  assert.throws(() => validateAccessibilityNativeEvidence(interrupted, context), /privacy guard/)
  const few = reader(); few.frontWindowGuard.checks = 2
  assert.throws(() => validateAccessibilityNativeEvidence(few, context), /coverage/)
})
test("rejects synthetic reader, silent audio, excessive clock offset and typed metadata", () => {
  const fake = reader(); Object.assign(fake, { reader: "Gemini" })
  assert.throws(() => validateAccessibilityNativeEvidence(fake, context), /real Safari/)
  const silent = reader(); silent.audioMeasurement.meanDb = -90
  assert.throws(() => validateAccessibilityNativeEvidence(silent, context), /silent/)
  const offset = reader(); offset.sync.videoFirstPTS = 105
  assert.throws(() => validateAccessibilityNativeEvidence(offset, context), /offset/)
  const text = reader(); Object.assign(text.inputEvents[0], { text: "never retain typing" })
  assert.throws(() => validateAccessibilityNativeEvidence(text, context), /typed content/)
})
test("zoom requires independent actual browser observations for 200 and 400 percent", () => {
  const base = reader()
  const zoom: AccessibilityNativeEvidence = { ...base, kind: "zoom", browser: "com.brave.Browser", zoomObservations: [
    { percent: 200, atMs: 2000, method: "native-browser-menu", screenshot: { path: `${root}/200.png`, sha256: "e".repeat(64) } },
    { percent: 400, atMs: 6000, method: "native-browser-menu", screenshot: { path: `${root}/400.png`, sha256: "f".repeat(64) } },
  ] }
  assert.equal(validateAccessibilityNativeEvidence(zoom, context).narrationPolicy, "narration-allowed")
  zoom.zoomObservations.pop()
  assert.throws(() => validateAccessibilityNativeEvidence(zoom, context), /both real zoom/)
})
test("legacy excerpt cannot acquire validity merely by adding a validated flag", () => {
  assert.throws(() => validateAccessibilityNativeEvidence({ validated: true } as unknown as AccessibilityNativeEvidence, context), /legacy/)
})
test("read-only loader rejects changed bytes and a symlink escaping the dedicated output", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "benevol-native-contract-test-"))
  try {
    const nativeRoot = path.join(temporary, "videos/output/accessibility-keyboard-display/native")
    await mkdir(nativeRoot, { recursive: true })
    const evidence = reader()
    evidence.video.path = path.join(nativeRoot, "reader.mp4")
    evidence.audio.path = path.join(nativeRoot, "reader.m4a")
    const evidenceFile = path.join(nativeRoot, "evidence.json")
    await writeFile(evidence.video.path, "Synthetic test bytes, not a capture")
    await writeFile(evidenceFile, JSON.stringify(evidence))
    await assert.rejects(loadAccessibilityNativeEvidence(evidenceFile, { ...context, nativeRoot }), /changed after capture/)
    const outside = path.join(temporary, "outside.json")
    await writeFile(outside, JSON.stringify(evidence))
    const linked = path.join(nativeRoot, "linked.json")
    await symlink(outside, linked)
    await assert.rejects(loadAccessibilityNativeEvidence(linked, { ...context, nativeRoot }), /symlink escapes/)
  } finally {
    // Only the exact test-owned mkdtemp directory is removed.
    await rm(temporary, { recursive: true, force: true })
  }
})
