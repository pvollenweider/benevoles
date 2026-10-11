// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { estimateSentences, sentenceFor } from "../sentence-timing"

/**
 * Every sentence cue written in a recorder (`at("Créons les créneaux")`) must name exactly one
 * sentence of its scene's transcript: a typo, or a transcript edited without its cue, would only
 * fail in the middle of a narrated take otherwise. The scene is the closest `scene("id", …)` above
 * the cue; a cue in a helper shared by several scenes would resolve against the wrong one, so such
 * helpers keep fractions.
 */

const root = path.resolve(__dirname, "../../..")
const recorders = [
  "videos/tools/record.ts",
  ...readdirSync(path.join(root, "videos/lib")).filter(file => /^record-.*\.ts$/.test(file) && !file.endsWith(".test.ts")).map(file => `videos/lib/${file}`),
]

type Segment = { id: string; transcript: string }
const transcriptsByScene = new Map<string, { slug: string; transcript: string }[]>()
for (const file of readdirSync(path.join(root, "videos/manifests")).filter(file => file.endsWith(".json"))) {
  const manifest = JSON.parse(readFileSync(path.join(root, "videos/manifests", file), "utf8")) as { slug: string; segments: Segment[] }
  for (const segment of manifest.segments) {
    const list = transcriptsByScene.get(segment.id) ?? []
    list.push({ slug: manifest.slug, transcript: segment.transcript })
    transcriptsByScene.set(segment.id, list)
  }
}

/** How many sentences of the transcript the cue names (0 when none, more when ambiguous). */
function matches(transcript: string, phrase: string): number {
  try {
    sentenceFor(estimateSentences(transcript, 10_000), phrase)
    return 1
  } catch (error) {
    const found = /matches (\d+) sentences/.exec((error as Error).message)
    return found ? Number(found[1]) : 0
  }
}

type Anchor = { file: string; line: number; scene: string | null; phrase: string }
const anchors: Anchor[] = []
for (const file of recorders) {
  const source = readFileSync(path.join(root, file), "utf8")
  const scenes = [...source.matchAll(/scene\("([A-Za-z0-9_-]+)"/g)].map(match => ({ at: match.index!, id: match[1] }))
  for (const match of source.matchAll(/\bat\(("(?:[^"\\]|\\.)*")\)/g)) {
    const lineStart = source.lastIndexOf("\n", match.index!) + 1
    // Comments may show the syntax (« at("Créons les créneaux") »).
    if (/^\s*(\/\/|\*)/.test(source.slice(lineStart, match.index!))) continue
    const scene = scenes.filter(candidate => candidate.at < match.index!).at(-1)?.id ?? null
    anchors.push({ file, line: source.slice(0, match.index!).split("\n").length, scene, phrase: JSON.parse(match[1]) as string })
  }
}

describe("sentence cues in the recorders", () => {
  it("finds the cues", () => {
    expect(anchors.length).toBeGreaterThan(100)
  })

  it.each(anchors.map(anchor => [`${anchor.file}:${anchor.line} « ${anchor.phrase} »`, anchor] as const))("%s names one sentence of its scene", (_, anchor) => {
    expect(anchor.scene, "a sentence cue must sit inside a scene").not.toBeNull()
    const candidates = transcriptsByScene.get(anchor.scene!) ?? []
    expect(candidates.length, `no manifest has a scene « ${anchor.scene} »`).toBeGreaterThan(0)
    const counts = candidates.map(candidate => matches(candidate.transcript, anchor.phrase))
    expect(counts, `scene « ${anchor.scene} »: matches per manifest ${JSON.stringify(candidates.map(c => c.slug))}`).toContain(1)
    expect(counts.every(count => count <= 1), "ambiguous: the cue names several sentences of one transcript").toBe(true)
  })
})
