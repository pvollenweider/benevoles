// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadCatalog, loadManifest, videoDir } from "../manifest"
import { assertNarrationGeneration as liveAssertNarrationGeneration } from "../narration-generation"
import { assertNarrationGeneration as frozenAssertNarrationGeneration } from "./frozen/narration-generation.frozen"

/** A frozen file that changes must be an explicit, reviewed act, never a side effect. */
const FROZEN_CHANGED = "Frozen oracle changed; it stays as taken from 7efa98b6 until the core has left this repository"

/** SHA-256 of the two frozen files as committed, after the two allowed edits of the task brief. */
const FROZEN_SHA256 = {
  "narration-generation": "1a6bca5f1111fb09bf75d40a4cae137f84f632fc685adc47d6cd5f6a583d820a",
  "sentence-timing": "2b4832bbdb972f99f9ec078562e59d1fcffd2e320ecea470b29e564a5faf69c0",
} as const

/**
 * An entry rewrites the part of a frozen message that was deliberately reworded in the live
 * code. It is added in the same commit as the rewording, and never touches the frozen files.
 */
type Rewording = { frozen: string | RegExp; live: string; why: string }

/**
 * Ordered rewritings applied to a frozen `failedCheck` before comparing it with the live one.
 * Empty at the baseline. Rewording a check during the extraction adds an entry here, in the
 * same commit, with a reason; the frozen copy is never edited.
 */
const REWORDED: Rewording[] = []

type NarrationManifest = Parameters<typeof liveAssertNarrationGeneration>[0]
type NarrationRecord = Parameters<typeof liveAssertNarrationGeneration>[1]
type Verdict = { ok: true; key: string } | { ok: false; failedCheck: string }

/** The verdict a narration record gets, with the failed check's message kept so a change of reason is visible. */
function verdict(assertGeneration: typeof liveAssertNarrationGeneration, manifest: NarrationManifest, audio: NarrationRecord): Verdict {
  try {
    return { ok: true, key: assertGeneration(manifest, audio) }
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return { ok: false, failedCheck: error.message }
  }
}

/**
 * Applies every rewording in order and keeps everything the entries do not match, so the
 * actual and expected values Node appends to a failed `assert.equal` stay compared.
 */
function reword(message: string, entries: Rewording[]): string {
  return entries.reduce((current, entry) => typeof entry.frozen === "string"
    ? current.split(entry.frozen).join(entry.live)
    : current.replace(entry.frozen, entry.live), message)
}

const sha256 = (source: string) => createHash("sha256").update(source).digest("hex")

describe("reword", () => {
  it("replaces a frozen fragment with its live wording and keeps the appended values", () => {
    const message = "welcome: generation proof missing, mixed, or outdated for the current script\n\n'aaa' !== 'bbb'\n"
    expect(reword(message, [{ frozen: "generation proof missing, mixed, or outdated", live: "generation proof is stale", why: "test" }]))
      .toBe("welcome: generation proof is stale for the current script\n\n'aaa' !== 'bbb'\n")
  })

  it("uses a regular expression as given, including capture replacements", () => {
    expect(reword("intro: old wording", [{ frozen: /^(\w+): old wording$/m, live: "$1: new wording", why: "test" }]))
      .toBe("intro: new wording")
  })

  it("returns the message unchanged with no entry", () => {
    const message = "welcome: generation proof missing, mixed, or outdated\n\n'aaa' !== 'bbb'\n"
    expect(reword(message, [])).toBe(message)
  })

  it("returns the message unchanged when no entry matches", () => {
    const message = "welcome: generation proof missing, mixed, or outdated\n\n'aaa' !== 'bbb'\n"
    expect(reword(message, [{ frozen: "some other wording", live: "irrelevant", why: "test" }])).toBe(message)
  })
})

describe("the frozen narration oracle", () => {
  for (const name of ["narration-generation", "sentence-timing"] as const) {
    it(`keeps frozen/${name}.frozen.ts as taken from 7efa98b6`, () => {
      const source = readFileSync(path.resolve(__dirname, "frozen", `${name}.frozen.ts`), "utf8")
      expect(sha256(source), FROZEN_CHANGED).toBe(FROZEN_SHA256[name])
    })
  }
})

it("gives every catalog video the same verdict and cache key as the frozen oracle", async () => {
  const catalog = await loadCatalog()
  let comparedOnDisk = 0
  let skippedForMissingMetadata = 0
  let syntheticCompared = 0
  let passingOnDisk = 0
  let failingOnDisk = 0

  for (const entry of catalog.videos) {
    const manifest = await loadManifest(entry.manifest)
    const metadataFile = path.join(videoDir(entry.manifest), "audio-metadata.json")

    if (existsSync(metadataFile)) {
      const audio = JSON.parse(readFileSync(metadataFile, "utf8")) as NarrationRecord
      const live = verdict(liveAssertNarrationGeneration, manifest, audio)
      const frozen = verdict(frozenAssertNarrationGeneration, manifest, audio)
      const expected: Verdict = frozen.ok
        ? frozen
        : { ok: false, failedCheck: reword(frozen.failedCheck, REWORDED) }
      expect.soft(live, `${entry.id} (${entry.manifest}): on-disk record`).toEqual(expected)
      comparedOnDisk++
      if (live.ok) passingOnDisk++
      else failingOnDisk++
    } else {
      skippedForMissingMetadata++
    }

    const candidate = sha256(JSON.stringify({
      transcript: manifest.segments.map(segment => segment.transcript).join("\n\n"),
      style: manifest.voiceStyle,
      model: "gemini-3.8-flash-tts",
      voice: manifest.voice,
      promptVersion: 3,
    }))
    const synthetic: NarrationRecord = {
      model: "gemini-3.8-flash-tts",
      voice: manifest.voice,
      segments: Object.fromEntries(manifest.segments.map(segment => [segment.id, { generationSha256: candidate }])),
    }
    const liveSynthetic = verdict(liveAssertNarrationGeneration, manifest, synthetic)
    const frozenSynthetic = verdict(frozenAssertNarrationGeneration, manifest, synthetic)
    if (manifest.continuousNarration === true) {
      expect.soft(frozenSynthetic.ok, `${entry.id} (${entry.manifest}): the synthetic record must pass the frozen oracle`).toBe(true)
    }
    expect.soft(liveSynthetic, `${entry.id} (${entry.manifest}): synthetic record`).toEqual(frozenSynthetic)
    syntheticCompared++
  }

  console.log(`narration records: ${comparedOnDisk} on-disk compared, ${skippedForMissingMetadata} skipped for missing metadata, ${syntheticCompared} synthetic`)
  expect(comparedOnDisk + skippedForMissingMetadata).toBe(catalog.videos.length)
  expect(syntheticCompared).toBe(catalog.videos.length)
  expect(passingOnDisk, "at least one on-disk record must pass").toBeGreaterThan(0)
  expect(failingOnDisk, "at least one on-disk record must fail").toBeGreaterThan(0)
})
