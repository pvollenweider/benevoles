// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { alignSentences, earlyMarkers, estimateSentences, normalizeText, parseSilences, sentenceFor, splitSentences } from "../sentence-timing"

// SHIFT_RECURRENCE « stop », fourth take (product 0dfef62b): its narration and the pauses FFmpeg finds in it.
const stop = "La réception des livraisons s’arrête à partir de la cinquième semaine. Les dates sans inscrit sont supprimées. Ici, deux dates ont déjà des inscrits : elles sont d’abord listées, et rien ne change tant que vous ne confirmez pas. Confirmons : ces deux créneaux sont annulés et chaque personne est prévenue par email."
const stopSilences = [
  { startMs: 0, endMs: 411 }, { startMs: 3057, endMs: 3434 }, { startMs: 3521, endMs: 3672 }, { startMs: 5116, endMs: 5796 },
  { startMs: 7435, endMs: 8029 }, { startMs: 8944, endMs: 9274 }, { startMs: 10907, endMs: 11720 }, { startMs: 12129, endMs: 12654 }, { startMs: 15693, endMs: 16111 },
]

describe("sentence timing", () => {
  it("splits on the pauses of the text, colons included", () => {
    expect(splitSentences("Créons les créneaux. La liste : sa période ; ses dates ! Fin ?")).toEqual(["Créons les créneaux.", "La liste :", "sa période ;", "ses dates !", "Fin ?"])
  })

  it("compares phrases without case, accents or punctuation", () => {
    expect(normalizeText("Modifier à partir d’une date")).toBe("modifier a partir d une date")
  })

  it("parses FFmpeg silencedetect output", () => {
    expect(parseSilences("[silencedetect] silence_start: 0\n[silencedetect] silence_end: 0.410875 | silence_duration: 0.41\nsilence_start: 3.057208\nsilence_end: 3.434042 |")).toEqual([{ startMs: 0, endMs: 411 }, { startMs: 3057, endMs: 3434 }])
  })

  it("puts each sentence on the end of the pause before it (verified on the fourth take)", () => {
    const sentences = alignSentences(stop, stopSilences, 16111)
    expect(sentences.map(s => s.startMs)).toEqual([411, 3672, 5796, 8029, 11720, 12654])
    expect(sentences.every(s => s.method === "silence")).toBe(true)
    // The confirmation click of that take, 11 907 ms into the scene, falls on « Confirmons ».
    expect(sentenceFor(sentences, "Confirmons").startMs).toBeLessThanOrEqual(11907)
  })

  it("keeps an estimate when no pause is near a boundary", () => {
    const sentences = alignSentences("Un. Deux trois quatre.", [{ startMs: 0, endMs: 100 }, { startMs: 9_900, endMs: 10_000 }], 10_000)
    expect(sentences[1].method).toBe("estimate")
    expect(sentences[1].startMs).toBeGreaterThan(100)
  })

  it("estimates without audio, in reading order", () => {
    const sentences = estimateSentences("Un court. Un plus long que le premier.", 10_000)
    expect(sentences[0].startMs).toBe(0)
    expect(sentences[1].startMs).toBeGreaterThan(1_000)
    expect(sentences[1].startMs).toBeLessThan(5_000)
  })

  it("finds exactly one sentence for a cue", () => {
    const sentences = estimateSentences("Ouvrons le formulaire. Créons les créneaux. Créons encore.", 6_000)
    expect(sentenceFor(sentences, "créons les").text).toBe("Créons les créneaux.")
    expect(() => sentenceFor(sentences, "Créons")).toThrow(/matches 2/)
    expect(() => sentenceFor(sentences, "Absent")).toThrow(/matches 0/)
  })

  it("flags an interaction that comes before the sentence it waits for", () => {
    const cues = [{ id: "stop", startMs: 77_352, endMs: 93_464 }]
    const anchor = { segmentId: "stop", phrase: "Confirmons", startMs: 11_720, endMs: 12_129, cueMs: 88_800 }
    expect(earlyMarkers([anchor], cues, [{ kind: "click", atMs: 89_259 }])).toEqual([])
    expect(earlyMarkers([anchor], cues, [{ kind: "click", atMs: 88_900 }])).toHaveLength(1)
    // Before the cue, or in another scene: not this anchor's concern.
    expect(earlyMarkers([anchor], cues, [{ kind: "click", atMs: 80_000 }, { kind: "key", atMs: 94_000 }])).toEqual([])
  })
})
