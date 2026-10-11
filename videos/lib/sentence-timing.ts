// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * When each sentence of a narration segment starts, from the segment's own audio.
 *
 * A capture cued on a fraction of the scene (`at(0.67)`) drifts from the voice: the pace inside a
 * segment changes with every TTS generation, and the pilot needed four takes for actions that
 * started a sentence too early. A cue on a sentence (`at("La plage va")`) waits for the moment the
 * voice actually says it. The TTS leaves a pause between sentences; the pauses (from FFmpeg's
 * silencedetect) closest to where the text says each sentence should start are its boundaries.
 */

export type Silence = { startMs: number; endMs: number }

/** A scene's cue: a fraction of its narration (`at(0.5)`), or the start of a sentence (`at("Créons les créneaux")`). */
export type Cue = (cue: number | string) => Promise<void>
export type TimedSentence = { text: string; startMs: number; endMs: number; method: "silence" | "estimate" }

/** Sentences and clauses the voice pauses after: « . », « ! », « ? », « … », « ; » and « : ». */
export function splitSentences(transcript: string): string[] {
  return transcript.split(/(?<=[.!?…;:])\s+/).map(sentence => sentence.trim()).filter(Boolean)
}

/** The comparison form of a text: lower case, no accents, apostrophes and punctuation as spaces. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

const spokenWeight = (sentence: string) => Math.max(1, normalizeText(sentence).replace(/ /g, "").length)

/** Pauses that can separate two sentences: inside the speech, not the lead-in or the tail. */
function innerSilences(silences: Silence[], durationMs: number): { speechStartMs: number; speechEndMs: number; gaps: Silence[] } {
  const sorted = [...silences].sort((a, b) => a.startMs - b.startMs)
  const lead = sorted[0] && sorted[0].startMs <= 20 ? sorted[0] : null
  const tail = sorted.at(-1) && sorted.at(-1)!.endMs >= durationMs - 20 ? sorted.at(-1)! : null
  const speechStartMs = lead ? lead.endMs : 0
  const speechEndMs = tail ? tail.startMs : durationMs
  return { speechStartMs, speechEndMs, gaps: sorted.filter(gap => gap !== lead && gap !== tail && gap.startMs > speechStartMs && gap.endMs < speechEndMs) }
}

/**
 * Start and end of every sentence. Each boundary is the end of a pause, chosen among the pauses in
 * order so that the sum of their distances to the expected boundaries (spoken length of the text
 * before it, spread over the speech), minus a bonus for longer pauses, is the smallest. A boundary
 * without a pause within a quarter of the speech keeps its estimate.
 */
export function alignSentences(transcript: string, silences: Silence[], durationMs: number): TimedSentence[] {
  const sentences = splitSentences(transcript)
  const { speechStartMs, speechEndMs, gaps } = innerSilences(silences, durationMs)
  const speech = Math.max(1, speechEndMs - speechStartMs)
  const weights = sentences.map(spokenWeight)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const expected: number[] = []
  let before = 0
  for (let index = 1; index < sentences.length; index++) {
    before += weights[index - 1]
    expected.push(speechStartMs + (before / total) * speech)
  }
  const boundaries = expected.length
  // cost[k][g]: best cost with boundary k on gap g; a boundary may also stay on its estimate.
  const pauseBonus = (gap: Silence) => 0.6 * Math.min(gap.endMs - gap.startMs, 1_200)
  const tolerance = 0.25 * speech
  type Step = { cost: number; previous: number; gap: number }
  const table: Step[][] = []
  for (let k = 0; k < boundaries; k++) {
    const row: Step[] = []
    // Option index gaps.length means « no pause, keep the estimate ».
    for (let g = 0; g <= gaps.length; g++) {
      const distance = g === gaps.length ? tolerance : Math.abs((gaps[g].startMs + gaps[g].endMs) / 2 - expected[k])
      if (distance > tolerance) { row.push({ cost: Infinity, previous: -1, gap: g }); continue }
      // Keeping the estimate costs as much as the farthest acceptable pause.
      const own = g === gaps.length ? tolerance : distance - pauseBonus(gaps[g])
      if (k === 0) { row.push({ cost: own, previous: -1, gap: g }); continue }
      let best: Step = { cost: Infinity, previous: -1, gap: g }
      for (let p = 0; p <= gaps.length; p++) {
        const prior = table[k - 1][p]
        if (!Number.isFinite(prior.cost)) continue
        // Pauses are used once and in order; an estimate never constrains the next pause.
        if (g < gaps.length && p < gaps.length && p >= g) continue
        if (prior.cost + own < best.cost) best = { cost: prior.cost + own, previous: p, gap: g }
      }
      row.push(best)
    }
    table.push(row)
  }
  const chosen: number[] = new Array(boundaries).fill(gaps.length)
  if (boundaries > 0) {
    let at = table[boundaries - 1].reduce((best, step, index, row) => step.cost < row[best].cost ? index : best, 0)
    for (let k = boundaries - 1; k >= 0; k--) {
      chosen[k] = at
      at = table[k][at].previous
    }
  }
  const starts = [speechStartMs, ...chosen.map((g, k) => g === gaps.length ? Math.round(expected[k]) : gaps[g].endMs)]
  const ends = chosen.map((g, k) => g === gaps.length ? Math.round(expected[k]) : gaps[g].startMs)
  return sentences.map((text, index) => ({
    text,
    startMs: Math.round(starts[index]),
    endMs: Math.round(index < ends.length ? ends[index] : speechEndMs),
    method: index === 0 || chosen[index - 1] !== gaps.length ? "silence" : "estimate",
  }))
}

/** Without audio (rehearsal): sentences spread over the expected duration by spoken length. */
export function estimateSentences(transcript: string, durationMs: number): TimedSentence[] {
  return alignSentences(transcript, [], durationMs).map(sentence => ({ ...sentence, method: "estimate" }))
}

/** The one sentence that contains `phrase` (compared without case, accents or punctuation). */
export function sentenceFor(sentences: TimedSentence[], phrase: string): TimedSentence {
  const wanted = normalizeText(phrase)
  if (!wanted) throw new Error("Empty sentence cue")
  const matches = sentences.filter(sentence => ` ${normalizeText(sentence.text)} `.includes(` ${wanted} `))
  if (matches.length !== 1) throw new Error(`Sentence cue « ${phrase} » matches ${matches.length} sentences`)
  return matches[0]
}

/** Parses FFmpeg silencedetect output into pauses, in milliseconds. */
export function parseSilences(ffmpegLog: string): Silence[] {
  const silences: Silence[] = []
  let start: number | null = null
  for (const match of ffmpegLog.matchAll(/silence_(start|end): (-?[0-9.]+)/g)) {
    const value = Math.max(0, Math.round(Number(match[2]) * 1000))
    if (match[1] === "start") start = value
    else if (start !== null) { silences.push({ startMs: start, endMs: value }); start = null }
  }
  return silences
}

export type SentenceAnchor = { segmentId: string; phrase: string; startMs: number; endMs: number; cueMs: number }

/**
 * Interaction markers that happen before the sentence their action waits for: for each anchor, the
 * markers after its cue and before the next anchor or the end of its scene must not precede the
 * sentence start (minus a tolerance for the click sound's own lead).
 */
export function earlyMarkers(anchors: SentenceAnchor[], cues: { id: string; startMs: number; endMs: number }[], markers: { kind: string; atMs: number }[], toleranceMs = 120): { anchor: SentenceAnchor; marker: { kind: string; atMs: number } }[] {
  const early: { anchor: SentenceAnchor; marker: { kind: string; atMs: number } }[] = []
  const ordered = [...anchors].sort((a, b) => a.cueMs - b.cueMs)
  ordered.forEach((anchor, index) => {
    const scene = cues.find(cue => cue.id === anchor.segmentId)
    if (!scene) throw new Error(`Anchor on unknown scene ${anchor.segmentId}`)
    const next = ordered[index + 1]
    const until = next && next.segmentId === anchor.segmentId ? next.cueMs : scene.endMs
    const sentenceAt = scene.startMs + anchor.startMs
    for (const marker of markers) {
      if (marker.atMs >= anchor.cueMs && marker.atMs < until && marker.atMs < sentenceAt - toleranceMs) early.push({ anchor, marker })
    }
  })
  return early
}
