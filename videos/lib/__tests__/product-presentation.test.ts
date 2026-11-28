// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { sentenceFor, estimateSentences } from "../sentence-timing"

const root = path.resolve(__dirname, "../../..")
const read = (file: string) => readFileSync(path.join(root, file), "utf8")
const manifest = JSON.parse(read("videos/manifests/presentation-benevol-app.json")) as { id: string; segments: { id: string; transcript: string; fallbackDurationMs: number }[] }
const recorder = read("videos/lib/record-product-presentation.ts")

// The product presentation video: every cue of the recorder lands on exactly one sentence of its
// scene, and the tools that film and review it accept it.
describe("PRODUCT_PRESENTATION", () => {
  test("each recorder cue matches exactly one sentence of its scene", () => {
    // Every segment is a scene, in the manifest's order: a story scene, or a hook card of the second voice.
    const order = [...recorder.matchAll(/await (?:scene|card)\("([^"]+)"/g)].map((m) => m[1])
    expect(order).toEqual(manifest.segments.map((s) => s.id))
    const scenes = [...recorder.matchAll(/await scene\("([^"]+)", async (?:at|\(\)) => \{([\s\S]*?)\n  \}\)/g)]
    for (const [, id, body] of scenes) {
      const segment = manifest.segments.find((s) => s.id === id)!
      const sentences = estimateSentences(segment.transcript, segment.fallbackDurationMs)
      for (const [, cue] of body.matchAll(/await at\("([^"]+)"\)/g)) expect(() => sentenceFor(sentences, cue)).not.toThrow()
    }
  })

  test("the hooks and the call to action are said by the second voice, the story by the main one", () => {
    const m = manifest as unknown as { secondVoice?: { voice: string }; segments: { id: string; speaker?: string }[] }
    expect(m.secondVoice?.voice).toBeTruthy()
    for (const segment of m.segments) expect(segment.speaker === "second").toBe(recorder.includes(`await card("${segment.id}"`) || segment.id === "p-hook" || segment.id === "p-cta")
  })

  test("the volunteer of the story is on example.org, and nothing promises a lasting free service", () => {
    expect(recorder).toMatch(/email: "[a-z.]+@example\.org"/)
    const narration = manifest.segments.map((s) => s.transcript).join(" ")
    expect(narration).not.toMatch(/toujours gratuit|gratuit pour toujours|restera gratuit/i)
  })

  test("the tools that film and review it accept it", () => {
    expect(read("videos/tools/local-production.ts")).toContain('"PRODUCT_PRESENTATION"')
    expect(read("videos/tools/audit-audiovisual.ts")).toContain('"PRODUCT_PRESENTATION"')
    expect(read("videos/tools/audit-full-final-audio.ts")).toContain('"PRODUCT_PRESENTATION"')
    expect(read("videos/tools/record.ts")).toContain('slug === "presentation-benevol-app"')
  })
})
